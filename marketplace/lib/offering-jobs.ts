/**
 * The jobs route of every async offering in offerings.ts, wired to the Jobs object (src/jobs/jobs.ts) out of the box:
 *
 *   GET <endpoint>/jobs/<id>   e.g. /api/ideas/jobs/ideas:call_…   → done | failed | working with the attempts so far
 *
 * The Gateway polls it with a receipt naming the job (village.jobStatus checks it; anyone else gets 402). Your POST
 * handler starts the job: `startJob(env, `ideas:${call.call_id}`, "ideas", input, { deadline: call.deadline })`, then
 * `village.deferred(…)` (recipes/async-offerings.md in the ambasada-village skill).
 */
import type { OfferingDef } from "@ambasada/village";
import offerings from "../offerings.ts";
import { ambasada, type Env } from "./ambasada.ts";
import { jobAnswer, jobState } from "./jobs.ts";

/** The async offering a path asks about (`/api/ideas/jobs/<id>` → ideas), or null. */
export function asyncJobRoute(pathname: string, list: readonly OfferingDef[] = offerings): { offering: string } | null {
  const m = /^(\/.+)\/jobs\/[^/]+$/.exec(pathname);
  if (!m) return null;
  const o = list.find((x) => x.async && x.endpoint.replace(/\/+$/, "") === m[1]);
  return o ? { offering: o.name } : null;
}

/** Answers the Gateway's poll of an async offering's job from the Jobs object (null: 404). */
export function offeringJob(offering: string, req: Request, env: Env): Promise<Response> {
  return ambasada(env).jobStatus(offering, async (id) => {
    const job = await jobState(env, id);
    return job && jobAnswer(job);
  })(req);
}
