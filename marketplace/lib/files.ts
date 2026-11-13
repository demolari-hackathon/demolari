/**
 * env.FILES: this app's file storage (Cloudflare R2). Uploads and generated files; each one is public at
 * /files/<key> on the app's own address (the /files/* route calls serveFile). Don't keep files in the database.
 *
 *   const { key, url } = await upload(env.FILES, req.body, { contentType: "image/png" });   // url: /files/u/…
 *   return serveFile(env.FILES, req);                                                        // GET /files/*
 *
 * Files are public to anyone with the URL: keep private documents behind your own route that checks who asks.
 * `npx ambasada files put|list|delete|url` manages them from the terminal.
 */

/** What this file needs from an R2 binding (env.FILES satisfies it). */
export interface Bucket {
  put(key: string, value: ReadableStream | ArrayBuffer | ArrayBufferView | string | Blob | null, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string, options?: { onlyIf?: Headers; range?: Headers }): Promise<StoredFile | null>;
  delete(key: string): Promise<void>;
}

export interface StoredFile {
  httpEtag: string;
  size: number;
  httpMetadata?: { contentType?: string };
  range?: { offset?: number; length?: number; suffix?: number };
  body?: ReadableStream;
}

export const FILES_PATH = "/files/";

/** Stores `body` under a new random key (in `folder`) → `{ key, url }`, url relative to the app (/files/<key>). */
export async function upload(bucket: Bucket, body: ReadableStream | ArrayBuffer | ArrayBufferView | string | Blob | null, options: { contentType?: string; folder?: string } = {}): Promise<{ key: string; url: string }> {
  const key = `${options.folder ?? "u"}/${crypto.randomUUID()}`;
  await bucket.put(key, body, { httpMetadata: { contentType: options.contentType ?? "application/octet-stream" } });
  return { key, url: fileUrl(key) };
}

export const fileUrl = (key: string) => `${FILES_PATH}${key.split("/").map(encodeURIComponent).join("/")}`;

/** GET/HEAD /files/<key>: the file with its type, an ETag (304 when unchanged), byte ranges, and a cache header. */
export async function serveFile(bucket: Bucket, req: Request): Promise<Response> {
  if (req.method !== "GET" && req.method !== "HEAD") return new Response(null, { status: 405, headers: { allow: "GET, HEAD" } });
  const path = new URL(req.url).pathname;
  const key = decodeURIComponent(path.slice(path.indexOf(FILES_PATH) + FILES_PATH.length));
  if (!key) return new Response("Not found", { status: 404 });
  const file = await bucket.get(key, { onlyIf: req.headers, range: req.headers });
  if (!file) return new Response("Not found", { status: 404 });
  const headers = new Headers({ etag: file.httpEtag, "cache-control": "public, max-age=3600", "accept-ranges": "bytes" });
  if (file.httpMetadata?.contentType) headers.set("content-type", file.httpMetadata.contentType);
  if (!file.body) return new Response(null, { status: 304, headers }); // If-None-Match matched: nothing changed
  const r = file.range;
  if (r && req.headers.has("range")) {
    const offset = r.suffix !== undefined ? file.size - r.suffix : (r.offset ?? 0);
    const length = r.suffix ?? r.length ?? file.size - offset;
    headers.set("content-range", `bytes ${offset}-${offset + length - 1}/${file.size}`);
    headers.set("content-length", String(length));
    return new Response(req.method === "HEAD" ? null : file.body, { status: 206, headers });
  }
  headers.set("content-length", String(file.size));
  return new Response(req.method === "HEAD" ? null : file.body, { headers });
}
