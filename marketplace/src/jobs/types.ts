/** The job runner's shapes (src/jobs/jobs.ts runs jobs, lib/jobs.ts starts them, src/jobs/handlers.ts says what they do). */

export type JobStatus = "queued" | "working" | "retrying" | "done" | "failed";

export interface JobState {
  kind: string;
  status: JobStatus;
  /** Attempts started so far. */
  attempts: number;
  /** What the last failed attempt threw (`retrying`, `failed`). */
  error: string | null;
  /** What `run` returned (`done`), as JSON. */
  result: unknown;
  /** When the next attempt starts (`queued`, `retrying`), ms since the epoch. */
  next_attempt_at: number | null;
  /** An async offering's: the buyer's max_wait_s runs out then (ms); retried until it, never after. */
  deadline?: number | null;
  /** Each failed attempt (the last 10): when, what it threw and where (also in `ambasada logs`). */
  failures?: JobFailure[];
  updated_at: number;
}

export interface JobFailure {
  at: number;
  attempt: number;
  error: string;
  /** The stack's first frames, down to the first one in a file (`ambasada logs` maps it to your source). */
  stack: string | null;
}

/** Failed attempts a job keeps. */
export const MAX_FAILURES = 10;

/** An error's stack down to its first frame in a file (past built-ins like `at JSON.parse (<anonymous>)`), or null. */
export function stackHead(error: unknown): string | null {
  if (!(error instanceof Error) || !error.stack) return null;
  const frames = error.stack.split("\n").map((line) => line.trim()).filter((line) => line.startsWith("at "));
  const inFile = frames.findIndex((line) => /:\d+:\d+\)?$/.test(line));
  const head = frames.slice(0, inFile < 0 ? 1 : Math.min(inFile + 1, 3));
  return head.length ? head.join("\n") : null;
}

/**
 * What an async offering's `GET <endpoint>/jobs/<id>` answers for this job (`village.jobStatus`): done, failed, or
 * working with the attempts that failed so far, which the buyer sees as "working (attempt 2, last error: …)".
 */
export function jobAnswer(job: JobState): { status: "working"; attempts: { at: string; error: string }[] } | { status: "done"; output: unknown } | { status: "failed"; error: string } {
  if (job.status === "done") return { status: "done", output: job.result };
  if (job.status === "failed") return { status: "failed", error: job.error ?? "failed" };
  return { status: "working", attempts: (job.failures ?? []).map((f) => ({ at: new Date(f.at).toISOString(), error: f.error })) };
}

/** What `startJob` may say besides the input. */
export interface JobOptions {
  /** An async offering's job passes `call.deadline` (the receipt's, unix seconds; ms work too): the Gateway refunds the buyer then. */
  deadline?: number | null;
  /** The job's name (lib/jobs.ts passes it): how `ambasada logs` names its failed attempts. */
  name?: string;
}

/** A deadline in ms since the epoch (seconds, as a receipt has it, are converted). */
export function deadlineMs(deadline: number | null | undefined): number | null {
  if (!deadline || !Number.isFinite(deadline)) return null;
  return deadline < 1e12 ? deadline * 1000 : deadline;
}

/** The Worker's env as the job sees it (its bindings and vars). */
export type JobEnv = Record<string, unknown>;

export interface JobHandler {
  /** Does the work: may take minutes, may throw (then it is tried again). Make it safe to run twice. */
  run(input: unknown, env: JobEnv, info: { attempt: number }): Promise<unknown>;
  /** An attempt failed and another follows in `retryInMs`: say so somewhere, if you like. */
  retrying?(input: unknown, env: JobEnv, info: { attempt: number; error: string; retryInMs: number }): Promise<void>;
  /** The last attempt failed: the job is over. */
  failed?(input: unknown, env: JobEnv, error: string): Promise<void>;
}

/** After a failed attempt, wait this long and try again; after the last one the job has failed (6 attempts, ~43 min). */
export const RETRY_AFTER_MS = [10_000, 30_000, 2 * 60_000, 10 * 60_000, 30 * 60_000];

/**
 * A 401 from the API within this long of a deploy (or of the job's first 401) is the new version still on its way, not
 * a bad key: retried on its own short clock and not counted (village dry run 5 #2: retries failed "a valid company API
 * key is required" for minutes after a deploy).
 */
export const DEPLOY_LAG_MS = 5 * 60_000;
export const LAG_RETRY_MS = [15_000, 30_000, 60_000, 120_000];

/** What a job remembers between attempts to plan the next one. */
export interface RetryState {
  attempts: number;
  /** Retries after a 401 in the deploy window (not counted against RETRY_AFTER_MS). */
  lag_retries?: number;
  /** The first 401 of this job (ms). */
  unauthorized_since?: number | null;
  deadline?: number | null;
}

/** The API refused the app's key (401): the SDK's error has status 401 / code UNAUTHORIZED. */
export function isUnauthorized(e: unknown): boolean {
  const x = e as { status?: unknown; code?: unknown; message?: unknown } | null;
  return x?.status === 401 || x?.code === "UNAUTHORIZED" || /valid company API key is required/.test(String(x?.message ?? ""));
}

/**
 * After a failed attempt: when to try again, or `retryInMs: null` when the job has failed. `deployedAt`: the app's
 * last deploy (`AMBASADA_DEPLOYED_AT`). With a deadline the job is tried until it and never after (the buyer is
 * refunded then, so more attempts would be work nobody pays for).
 */
export function nextRetry(job: RetryState, error: unknown, now: number, deployedAt?: number): { retryInMs: number | null; lag: boolean; why?: string } {
  const lag = isUnauthorized(error) && (now - (job.unauthorized_since ?? now) < DEPLOY_LAG_MS || (deployedAt !== undefined && now - deployedAt >= 0 && now - deployedAt < DEPLOY_LAG_MS));
  let retryInMs: number | undefined = lag
    ? LAG_RETRY_MS[Math.min(job.lag_retries ?? 0, LAG_RETRY_MS.length - 1)]
    : RETRY_AFTER_MS[job.attempts - 1 - (job.lag_retries ?? 0)];
  if (job.deadline !== null && job.deadline !== undefined) {
    const left = job.deadline - now;
    if (left < 3_000) return { retryInMs: null, lag, why: "the buyer's max_wait_s is over (refunded)" };
    // Never give up before the deadline, and never wait past it.
    retryInMs = Math.min(retryInMs ?? RETRY_AFTER_MS[RETRY_AFTER_MS.length - 1]!, left - 2_000);
  }
  return { retryInMs: retryInMs ?? null, lag };
}
