import { isVillageError } from "@ambasada/village";
import type { Env } from "../lib/ambasada.ts";
import { startCheckout } from "../lib/orders.ts";
import { TIERS, type Tier } from "../offerings.ts";
export default async function checkout(req: Request, env: Env): Promise<Response> {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).length > 35000) return new Response("Body too large", { status: 413 });
    const { intake, tier } = JSON.parse(raw) as { intake: unknown; tier: Tier };
    if (!Object.hasOwn(TIERS, tier)) return Response.json({ error: { message: "Unknown tier" } }, { status: 400 });
    return Response.json(await startCheckout(env, intake, tier));
  } catch (error) {
    if (isVillageError(error)) return error.toResponse();
    if (error instanceof SyntaxError || error instanceof TypeError) return Response.json({ error: { message: "Invalid JSON intake" } }, { status: 400 });
    throw error;
  }
}
