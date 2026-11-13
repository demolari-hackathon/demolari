/**
 * A live room (Durable Object `Room`, bound as env.ROOMS): everyone connected to the same room id shares it.
 *
 *   GET /api/rooms/<id>/ws  (WebSocket)  → env.ROOMS.getByName(id).fetch(req)
 *   client → { "text": "hi" }            server → { type: "history", messages } on join,
 *                                                 { type: "message", message } to everyone,
 *                                                 { type: "presence", online } when people come and go
 *
 * WebSocket hibernation: the object sleeps between messages and the connections stay open, so an idle room
 * costs nothing. Its own SQLite (`ctx.storage.sql`) keeps the last 50 messages, replayed to whoever joins.
 * The same shape fits presence, live counters, a game table, a queue or a rate limit: one object per thing.
 */
import { DurableObject } from "cloudflare:workers";

const KEEP = 50;

export type RoomMessage = { id: number; name: string; text: string; at: number };
export type RoomEvent = { type: "history"; messages: RoomMessage[] } | { type: "message"; message: RoomMessage } | { type: "presence"; online: number };

export class Room extends DurableObject<unknown> {
  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env);
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, text TEXT NOT NULL, at INTEGER NOT NULL)");
  }

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get("upgrade") !== "websocket") return Response.json({ online: this.ctx.getWebSockets().length, messages: this.history() });
    // Who is talking: the client says. Behind Sign in with ambasada, pass the signed-in name from your route instead.
    const name = (new URL(req.url).searchParams.get("name") ?? "").trim().slice(0, 40) || "guest";
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ name });
    server.send(JSON.stringify({ type: "history", messages: this.history() } satisfies RoomEvent));
    this.broadcast({ type: "presence", online: this.ctx.getWebSockets().length });
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): Promise<void> {
    let text = "";
    try {
      text = String((JSON.parse(typeof data === "string" ? data : new TextDecoder().decode(data)) as { text?: unknown }).text ?? "").trim().slice(0, 2000);
    } catch {
      return;
    }
    if (!text) return;
    const { name } = ws.deserializeAttachment() as { name: string };
    const at = Date.now();
    const { id } = this.ctx.storage.sql.exec<{ id: number }>("INSERT INTO messages (name, text, at) VALUES (?, ?, ?) RETURNING id", name, text, at).one();
    this.ctx.storage.sql.exec("DELETE FROM messages WHERE id <= ?", id - KEEP);
    this.broadcast({ type: "message", message: { id, name, text, at } });
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    try {
      ws.close(code, reason);
    } catch {
      // already closed
    }
    this.broadcast({ type: "presence", online: this.ctx.getWebSockets().filter((s) => s !== ws).length });
  }

  private history(): RoomMessage[] {
    return this.ctx.storage.sql.exec<RoomMessage>("SELECT id, name, text, at FROM messages ORDER BY id").toArray();
  }

  private broadcast(event: RoomEvent): void {
    const text = JSON.stringify(event);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(text);
      } catch {
        // a closing socket: webSocketClose cleans up
      }
    }
  }
}
