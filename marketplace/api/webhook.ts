import { isVillageError } from "@ambasada/village";
import { ambasada, type Env } from "../lib/ambasada.ts";
import { startPaidOrder } from "../lib/orders.ts";
export default async function webhook(req: Request, env: Env): Promise<Response> {
  try {
    const event = await ambasada(env).verifyWebhook(req);
    if (event.type === "checkout.paid" && event.data.session?.id) await startPaidOrder(env, event.data.session.id);
    return new Response("ok");
  } catch (error) { if (isVillageError(error)) return error.toResponse(); throw error; }
}
