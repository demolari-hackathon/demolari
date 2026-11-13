import { createVillage } from "@ambasada/village";
import type { Env } from "../../lib/ambasada.ts";
import { assess } from "../../lib/assessment.ts";
import { startJob } from "../../lib/jobs.ts";
import {reviewEvidence,type EvidenceInput} from "../../lib/evidence.ts";
import type { JobHandler } from "./types.ts";
type Input = { intake: Record<string, unknown>; session?: string; price?: number };
const client = (env: unknown) => createVillage({ env: env as Record<string, unknown> });
export const HANDLERS: Record<string, JobHandler> = {
  "evidence-review":{async run(input,env){const d=input as {evidence:EvidenceInput;buyer:string;call_id:string};return reviewEvidence(env as unknown as Env,d.evidence,d.buyer,d.call_id);}},
  assessment: { async run(input, env) {
    const {intake,price} = input as Input;
    const result = await assess(env as unknown as Env, intake, false, price);
    result.report.quote = {amount:price,currency:"TON",payment_status:"gateway_held"};
    return result;
  } },
  "checkout-assessment": {
    async run(input, env) {
      const { intake, session: id } = input as Input;
      if (!id) throw new Error("Missing checkout session");
      const village = client(env), session = await village.getCheckout(id);
      if (session.status !== "paid") throw new Error("Checkout is not paid");
      const appEnv=env as unknown as Env;
      const saved=await appEnv.DB.prepare("SELECT result FROM assessment_orders WHERE session_id=?").bind(id).first<{result:string|null}>();
      const result = saved?.result ? JSON.parse(saved.result) : await assess(appEnv, intake);
      result.report.quote={amount:session.amount,currency:"TON",payment_status:"paid"};
      await appEnv.DB.prepare("UPDATE assessment_orders SET result=? WHERE session_id=?").bind(JSON.stringify(result),id).run();
      await village.deliverCheckout(id, { text: result.markdown.slice(0, 4000) });
      return result;
    },
    async failed(input, env) {
      const id = (input as Input).session;
      if (!id) return;
      await startJob(env as unknown as Env, `refund:${id}`, "refund-checkout", {session:id});
    },
  },
  "refund-checkout": {
    async run(input,env) {
      const id=(input as Input).session;
      if(!id)throw new Error("Missing refund session");
      const village = client(env), session = await village.getCheckout(id);
      if (session.status === "paid" && session.buyer) {
        await village.transfer(session.buyer, session.amount, { reason: "Assessment could not be delivered", idempotencyKey: `refund:${id}` });
        await village.deliverCheckout(id, { status: "failed", error: "Assessment could not finish. Payment refunded." });
      }
      return {refunded:true};
    },
  },
};
