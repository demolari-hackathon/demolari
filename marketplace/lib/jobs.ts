/**
 * Start work that outlives the request (src/jobs/jobs.ts, a Durable Object per job) and ask how it is going.
 *
 *   await startJob(env, "report:42", "send-report", { id: 42 })   // answers at once; the same name again is a no-op
 *   await jobState(env, "report:42")                                // { status: "working" | "done" | …, result, error, failures }
 *   jobAnswer(job)                                                  // what an async offering's GET …/jobs/<id> answers
 */
import type { Env } from "./ambasada.ts";
import type { JobOptions, JobState } from "../src/jobs/types.ts";

export { jobAnswer } from "../src/jobs/types.ts";
export type { JobOptions, JobState };

/** `options.deadline`: an async offering's job passes `call.deadline`, and is tried until then (never after). */
export async function startJob(env: Env, name: string, kind: string, input: unknown, options: JobOptions = {}): Promise<JobState> {
  return (await env.JOBS.getByName(name).start(kind, input, { ...options, name })) as JobState;
}

export async function jobState(env: Env, name: string): Promise<JobState | null> {
  return (await env.JOBS.getByName(name).state()) as JobState | null;
}
