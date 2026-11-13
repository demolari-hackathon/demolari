/**
 * The job that does a paid order (src/jobs/handlers.ts runs it, one per Checkout session): translate the order and
 * tell the village what was delivered (deliverCheckout), so the person sees it with the purchase in their ambasada app.
 * It runs in the Jobs Durable Object, not in a request: only the village client it is given, no request context.
 */
import type { Village } from "@ambasada/village";
import { translate } from "./translate.ts";

export const ORDER_JOB = "deliver-checkout";
export const orderJob = (sessionId: string) => `checkout:${sessionId}`;

/**
 * Throws to be retried; safe to run twice (the village keeps one delivery per session). One order is done once: a job
 * that finds its order already delivered (a second run of it) returns that delivery instead of doing the work again.
 */
export async function fulfil(village: Village, sessionId: string, attempt: number): Promise<{ text: string }> {
  const session = await village.getCheckout(sessionId);
  if (session.status !== "paid") throw new Error(`${sessionId} is ${session.status}, not paid`);
  const { text, to } = session.metadata ?? {};
  if (!text) return { text: "" };
  if (attempt === 1) {
    // "working" never undoes a delivery: the answer is what the village has for this order.
    const said = await village.deliverCheckout(sessionId, { status: "working" }).catch((e) => void console.error(`could not say ${sessionId} is being worked on`, e));
    if (said?.status === "delivered") return { text: said.text ?? "" };
  }
  const result = await translate(village, text, to);
  await village.deliverCheckout(sessionId, { text: result.slice(0, 4000) });
  return { text: result };
}
