/**
 * Work that outlives a request (Durable Object `Jobs`, bound as env.JOBS): one object per job, named by whoever starts
 * it (`checkout:cs_…`), run from an alarm with the object's own limits (minutes of wall time, not a request's 30 s or a
 * webhook's 10 s), retried with backoff when it throws.
 *
 *   startJob(env, "checkout:cs_…", "deliver-checkout", { session: "cs_…" })   lib/jobs.ts: answers at once
 *   startJob(env, `story:${call.call_id}`, "story", input, { deadline: call.deadline })   an async offering's: tried until then
 *   jobState(env, "checkout:cs_…")   → { status: "queued" | "working" | "retrying" | "done" | "failed", attempts, error, result }
 *
 * A 401 from the API within 5 minutes of a deploy is retried on a short clock (15 s … 2 min) without counting as an
 * attempt: the deploy's new version reaches running objects with a lag (src/jobs/types.ts nextRetry).
 *
 * Each failed attempt is kept on the job (`failures`: when, the error, its stack's first frames) and reported to
 * `ambasada logs` (`job <name>`): a job runs from an alarm, outside any request, so its console.error lines go nowhere
 * you can read them online.
 *
 * What each kind does: src/jobs/handlers.ts. Starting a job again under the same name is a no-op (a webhook retried,
 * the thanks page opened first), so name a job after the thing it is for.
 */
import { DurableObject } from "cloudflare:workers";
import { createAmbasada } from "@ambasada/sdk";
import { HANDLERS } from "./handlers.ts";
import { deadlineMs, isUnauthorized, MAX_FAILURES, nextRetry, stackHead, type JobEnv, type JobOptions, type JobState } from "./types.ts";

interface Stored extends JobState {
  input: unknown;
  name?: string;
  lag_retries?: number;
  unauthorized_since?: number | null;
}

export class Jobs extends DurableObject<JobEnv> {
  /** Starts the job unless this object has one already; the first attempt runs right after this answers. */
  async start(kind: string, input: unknown, options: JobOptions = {}): Promise<JobState> {
    const current = await this.ctx.storage.get<Stored>("job");
    if (current) return view(current);
    if (!HANDLERS[kind]) throw new Error(`no job kind "${kind}" in src/jobs/handlers.ts`);
    const now = Date.now();
    const job: Stored = { kind, input, status: "queued", attempts: 0, error: null, result: null, next_attempt_at: now, deadline: deadlineMs(options.deadline), failures: [], name: options.name, updated_at: now };
    await this.ctx.storage.put("job", job);
    await this.ctx.storage.setAlarm(now);
    return view(job);
  }

  async state(): Promise<JobState | null> {
    const job = await this.ctx.storage.get<Stored>("job");
    return job ? view(job) : null;
  }

  async alarm(): Promise<void> {
    const job = await this.ctx.storage.get<Stored>("job");
    if (!job || job.status === "done" || job.status === "failed") return;
    const handler = HANDLERS[job.kind];
    if (!handler) return void (await this.save(job, { status: "failed", error: `no job kind "${job.kind}" in src/jobs/handlers.ts` }));
    if (job.deadline && Date.now() >= job.deadline) {
      const error = job.error ?? "Assessment deadline exceeded";
      await this.save(job, { status: "failed", error });
      await handler.failed?.(job.input, this.env, error);
      return;
    }
    await this.save(job, { status: "working", attempts: job.attempts + 1, next_attempt_at: null });
    try {
      const result = await handler.run(job.input, this.env, { attempt: job.attempts });
      await this.save(job, { status: "done", result: result ?? null, error: null });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      console.error(`job ${job.kind} attempt ${job.attempts} failed:`, e);
      const now = Date.now();
      const stack = stackHead(e);
      job.failures = [...(job.failures ?? []), { at: now, attempt: job.attempts, error, stack }].slice(-MAX_FAILURES);
      await this.report(job, `attempt ${job.attempts}: ${error}`, stack);
      const plan = nextRetry(job, e, now, Number(this.env.AMBASADA_DEPLOYED_AT) || undefined);
      if (isUnauthorized(e)) job.unauthorized_since ??= now;
      if (plan.lag) job.lag_retries = (job.lag_retries ?? 0) + 1;
      const retryInMs = plan.retryInMs;
      if (retryInMs === null) {
        await this.save(job, { status: "failed", error: plan.why ? `${error} (${plan.why})` : error });
        await handler.failed?.(job.input, this.env, error).catch((f) => console.error(`job ${job.kind}: failed() threw`, f));
        return;
      }
      await this.save(job, { status: "retrying", error, next_attempt_at: Date.now() + retryInMs });
      await this.ctx.storage.setAlarm(Date.now() + retryInMs);
      await handler.retrying?.(job.input, this.env, { attempt: job.attempts, error, retryInMs }).catch((f) => console.error(`job ${job.kind}: retrying() threw`, f));
    }
  }

  /** A failed attempt in `ambasada logs` (through the AMBASADA_API binding online, the mock under `ambasada dev`). */
  private async report(job: Stored, message: string, stack: string | null): Promise<void> {
    try {
      await createAmbasada({ env: this.env as Record<string, unknown> }).logs.report({ level: "error", message: `${job.kind} ${message}`, stack, job: job.name ?? job.kind });
    } catch (e) {
      console.warn(`job ${job.kind}: could not report to ambasada logs:`, e instanceof Error ? e.message : e);
    }
  }

  private async save(job: Stored, change: Partial<Stored>): Promise<void> {
    Object.assign(job, change, { updated_at: Date.now() });
    await this.ctx.storage.put("job", job);
  }
}

function view({ input: _input, name: _name, lag_retries: _lag, unauthorized_since: _since, ...state }: Stored): JobState {
  return state;
}
