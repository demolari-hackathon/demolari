/**
 * What `ambasada logs` shows for a request that failed: the request's console.error / console.warn lines, an error
 * with its message and where it was thrown. On a 5xx answer they ride in the `x-ambasada-error` header, which
 * ambasada.dev records for `ambasada logs` and the Developer app and takes off the response (visitors never see it).
 * A request that succeeded with a degraded answer says so with `village.warn(…)` (a `[village]` line): it rides in
 * `x-ambasada-warn` and shows in `ambasada logs` as a warning. Locally (`ambasada dev`) the headers are harmless; the
 * lines are in your terminal anyway.
 */
import { AsyncLocalStorage } from "node:async_hooks";

export const ERROR_HEADER = "x-ambasada-error";
/** What a 5xx carries at most: the last lines of the request's log. */
const MAX_CHARS = 1500;

const requestLog = new AsyncLocalStorage<string[]>();

/**
 * An error as one line plus where it was thrown: its stack down to the first frame in a file (`ambasada logs` maps
 * that one to your source), past built-ins like `at JSON.parse (<anonymous>)`; anything else as text.
 */
export function describeError(value: unknown): string {
  if (!(value instanceof Error)) return typeof value === "string" ? value : JSON.stringify(value) ?? String(value);
  const frames = (value.stack ?? "").split("\n").map((line) => line.trim()).filter((line) => line.startsWith("at "));
  const inFile = frames.findIndex((line) => /:\d+:\d+\)?$/.test(line));
  return [`${value.name}: ${value.message}`, ...frames.slice(0, inFile < 0 ? 1 : Math.min(inFile + 1, 3)).map((line) => `  ${line}`)].join("\n");
}

for (const level of ["error", "warn"] as const) {
  const print = console[level].bind(console);
  console[level] = (...args: unknown[]) => {
    requestLog.getStore()?.push(args.map(describeError).join(" "));
    print(...args);
  };
}

/** A request that did not fail but logged `[village]` lines (`village.warn`: a degraded answer) carries them here. */
export const WARN_HEADER = "x-ambasada-warn";
const WARN_PREFIX = "[village]";

/**
 * Runs one request keeping its console.error / console.warn lines; a 5xx answer carries them to `ambasada logs`, and
 * any other answer its `[village]` lines (ambasada.dev keeps at most 50 an hour).
 */
export async function withRequestLog(handle: () => Promise<Response>): Promise<Response> {
  const lines: string[] = [];
  const res = await requestLog.run(lines, handle);
  if (res.status < 500) {
    const warnings = lines.filter((line) => line.startsWith(WARN_PREFIX));
    if (!warnings.length || res.status === 101) return res;
    const answer = new Response(res.body, res);
    answer.headers.set(WARN_HEADER, encodeURIComponent(warnings.join("\n").slice(-MAX_CHARS)));
    return answer;
  }
  if (!lines.length) return res;
  const answer = new Response(res.body, res);
  answer.headers.set(ERROR_HEADER, encodeURIComponent(lines.join("\n").slice(-MAX_CHARS)));
  return answer;
}

/** The catch-all's answer: the error logged (message and stack, so `ambasada logs` has it), a 500 without details. */
export function serverError(error: unknown): Response {
  console.error(error);
  return Response.json({ error: { code: "INTERNAL", message: "internal error" } }, { status: 500 });
}
