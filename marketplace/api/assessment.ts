import { isVillageError } from "@ambasada/village";
import { ambasada, type Env } from "../lib/ambasada.ts";
import { assess, normalizeIntake } from "../lib/assessment.ts";
import { startJob } from "../lib/jobs.ts";
import { TIERS, PARTNER_PRICES, type Tier } from "../offerings.ts";
export default async function assessment(req: Request, env: Env): Promise<Response> {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const name = new URL(req.url).pathname.replace("/api/", "");
  const partner = name.endsWith("_partner");
  const tier = name.replace("assessment_", "").replace(/_partner$/, "") as Tier;
  if (!Object.hasOwn(TIERS, tier)) return new Response("Not found", { status: 404 });
  try {
    return await ambasada(env).sell<{ intake: unknown }>(name, async (input, call) => {
      const price = partner && tier !== "starter" ? PARTNER_PRICES[tier] : TIERS[tier].price;
      if (call.amount !== price) throw new Error("Receipt amount does not match the tier price");
      if (partner) {
        const quote = await env.DB.prepare("SELECT price FROM partner_quotes WHERE buyer=? AND tier=?").bind(call.buyer, tier).first<{price:number}>();
        if (!quote || quote.price !== price) throw new Error("An active partner quote is required for this buyer");
      }
      const intake = normalizeIntake(input.intake, tier, price);
      await assess(env, intake, true, price);
      const id = `assessment:${call.call_id}`;
      await startJob(env, id, "assessment", { intake, price }, { deadline: call.deadline });
      return ambasada(env).deferred(id);
    })(req);
  } catch (error) { if (isVillageError(error)) return error.toResponse(); throw error; }
}
