import { VillageError } from "@ambasada/village";
import { ambasada, type Env } from "./ambasada.ts";
import { assess, normalizeIntake, type AssessmentResult } from "./assessment.ts";
import { jobState, startJob } from "./jobs.ts";
import { TIERS, type Tier } from "../offerings.ts";
export interface Order { id: string; access_hash: string; intake: string; tier: Tier; session_id: string | null }
export const digest = async (value: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))].map(x => x.toString(16).padStart(2, "0")).join("");
export async function startCheckout(env: Env, input: unknown, tier: Tier) {
  const intake = normalizeIntake(input, tier);
  await assess(env, intake, true);
  const id = crypto.randomUUID(), access = crypto.randomUUID() + crypto.randomUUID();
  await env.DB.prepare("INSERT INTO assessment_orders(id,access_hash,intake,tier,created_at) VALUES(?,?,?,?,?)").bind(id, await digest(access), JSON.stringify(intake), tier, Date.now()).run();
  const session = await ambasada(env).checkout({
    offering: `assessment_${tier}`, amount: TIERS[tier].price, description: `Agent Checkup ${tier} assessment`,
    success_url: `https://demolari.vercel.app/?session={CHECKOUT_SESSION_ID}#order=${id}&access=${access}`,
    cancel_url: "https://demolari.vercel.app/#workspace", client_reference_id: id, metadata: { order_id: id },
  }, { idempotencyKey: `checkout:${id}` });
  await env.DB.prepare("UPDATE assessment_orders SET session_id=? WHERE id=?").bind(session.id, id).run();
  return { url: session.url };
}
export async function startPaidOrder(env: Env, sessionId: string) {
  const session = await ambasada(env).getCheckout(sessionId);
  if (session.status !== "paid") throw new VillageError("CONFLICT", "Order has not been paid", 409);
  const order = await env.DB.prepare("SELECT * FROM assessment_orders WHERE session_id=?").bind(sessionId).first<Order>();
  if (!order || session.client_reference_id !== order.id || session.amount < TIERS[order.tier].price) throw new VillageError("NOT_FOUND", "No matching assessment order", 404);
  await startJob(env, `checkout:${sessionId}`, "checkout-assessment", { intake: JSON.parse(order.intake), session: sessionId }, { deadline: Math.floor(Date.now() / 1000) + 180 });
}
export async function orderStatus(env: Env, id: string, access: string) {
  const order = await env.DB.prepare("SELECT * FROM assessment_orders WHERE id=?").bind(id).first<Order>();
  if (!order || !access || await digest(access) !== order.access_hash || !order.session_id) throw new VillageError("NOT_FOUND", "No such order", 404);
  const session = await ambasada(env).getCheckout(order.session_id);
  if (session.status !== "paid") return { paid: false, status: "unpaid" };
  await startPaidOrder(env, session.id);
  const job = await jobState(env, `checkout:${session.id}`);
  if (job?.status === "done") return { paid: true, status: "delivered", ...(job.result as AssessmentResult) };
  if (job?.status === "failed") return { paid: true, status: "failed", error: "Assessment failed. Check your purchase for refund status." };
  return { paid: true, status: "working" };
}
