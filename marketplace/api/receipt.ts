import { isVillageError } from "@ambasada/village";
import type { Env } from "../lib/ambasada.ts";
import { orderStatus } from "../lib/orders.ts";
export default async function receipt(req: Request, env: Env): Promise<Response> {
  if (req.method !== "GET") return new Response("Method not allowed", { status: 405 });
  try { return Response.json(await orderStatus(env, new URL(req.url).searchParams.get("order") ?? "", req.headers.get("Authorization")?.replace(/^Bearer /, "") ?? ""), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { if (isVillageError(error)) return error.toResponse(); throw error; }
}
