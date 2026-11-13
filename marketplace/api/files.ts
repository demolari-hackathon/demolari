// POST /api/files (raw body, content-type): a signed-in person uploads a file to env.FILES (lib/files.ts)
// → { key, url }; the url (/files/<key>) is public and served by the /files/* route.
import { ambasada, type Env } from "../lib/ambasada.ts";
import { upload } from "../lib/files.ts";

const MAX_BYTES = 10 * 1024 * 1024;

export default async function files(req: Request, env: Env): Promise<Response> {
  if (req.method !== "POST") return Response.json({ error: { code: "INVALID_REQUEST", message: "POST the file" } }, { status: 405 });
  const user = await ambasada(env).auth.user(req);
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED", message: "sign in to upload" } }, { status: 401 });
  const size = Number(req.headers.get("content-length") ?? 0);
  if (!size || size > MAX_BYTES) return Response.json({ error: { code: "INVALID_REQUEST", message: "send a file up to 10 MB with a content-length" } }, { status: 413 });
  const stored = await upload(env.FILES, req.body, { contentType: req.headers.get("content-type") ?? undefined, folder: `u/${user.id}` });
  return Response.json(stored, { status: 201 });
}
