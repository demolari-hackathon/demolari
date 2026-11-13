// GET /api/notes: the latest notes from env.DB (lib/db.ts), cached a minute in env.KV (lib/kv.ts).
// POST /api/notes { text }: adds one. The table is db/migrations/0001_init.sql.
import type { Env } from "../lib/ambasada.ts";
import { all, run } from "../lib/db.ts";
import { cached, remove } from "../lib/kv.ts";

type Note = { id: number; text: string; created_at: number };

export default async function notes(req: Request, env: Env): Promise<Response> {
  if (req.method === "POST") {
    const { text } = (await req.json().catch(() => ({}))) as { text?: unknown };
    if (typeof text !== "string" || !text.trim() || text.length > 500) {
      return Response.json({ error: { code: "INVALID_REQUEST", message: "body must be { text }, 1 to 500 characters" } }, { status: 400 });
    }
    const { lastRowId } = await run(env.DB, "INSERT INTO notes (text, created_at) VALUES (?, ?)", text.trim(), Date.now());
    await remove(env.KV, "notes:latest");
    return Response.json({ id: lastRowId }, { status: 201 });
  }
  const latest = await cached(env.KV, "notes:latest", 60, () => all<Note>(env.DB, "SELECT id, text, created_at FROM notes ORDER BY id DESC LIMIT 20"));
  return Response.json({ notes: latest });
}
