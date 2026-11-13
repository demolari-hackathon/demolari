import { VillageError } from "@ambasada/village";
import type { Env } from "./ambasada.ts";
import { TIERS, type Tier } from "../offerings.ts";
export interface AssessmentResult {
  report: { target_id: string; status: string; summary: Record<string, number>; checks: { status: string }[]; [key: string]: unknown };
  markdown: string;
}
export function normalizeIntake(raw: unknown, tier: Tier, price: number = TIERS[tier].price): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new VillageError("INVALID_REQUEST", "intake must be an object", 400);
  const input = raw as Record<string, unknown>;
  if (input.budget !== undefined && (typeof input.budget !== "number" || input.budget < price)) throw new VillageError("INVALID_REQUEST", "Selected tier exceeds declared budget", 400);
  const result = { ...input, schema_version: 1, tier, budget: input.budget ?? price, test_access: { mode: "local_replica" } };
  if (new TextEncoder().encode(JSON.stringify(result)).length > 32768) throw new VillageError("INVALID_REQUEST", "intake exceeds 32 KB", 400);
  return result;
}
export async function assess(env: Env, intake: Record<string, unknown>, validate = false, price?: number): Promise<AssessmentResult> {
  if (!env.ASSESSMENT_ACCESS_TOKEN) throw new Error("Assessment service is not configured");
  const response = await fetch(`${env.ASSESSMENT_URL ?? "https://demolari.vercel.app"}/api/assess${validate ? "?validate=1" : ""}`, {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${env.ASSESSMENT_ACCESS_TOKEN}`, ...(price === undefined ? {} : {"X-Assessment-Price": String(price)}) },
    body: JSON.stringify(intake), signal: AbortSignal.timeout(validate ? 10000 : 55000),
  });
  if (!response.ok) {
    if (response.status === 400) throw new VillageError("INVALID_REQUEST", "Invalid configuration. Use the intake example and include owner authorization.", 400);
    throw new Error(`Assessment backend unavailable (${response.status}); no report delivered`);
  }
  const result = await response.json() as AssessmentResult;
  if (!validate && (!result.report || typeof result.markdown !== "string" || !Array.isArray(result.report.checks) || result.report.checks.some(c => c.status === "error"))) throw new Error("Assessment returned an incomplete result");
  return result;
}
