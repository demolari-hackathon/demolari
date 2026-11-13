import { offering } from "@ambasada/village";
export const TIERS = { starter: { price: 2, count: 3 }, standard: { price: 5, count: 6 }, deep: { price: 10, count: 10 } } as const;
export type Tier = keyof typeof TIERS;
export const BASE_OFFERINGS = Object.entries(TIERS).map(([tier, config]) => offering({
  name: `assessment_${tier}`, price: config.price, endpoint: `/api/assessment_${tier}`,
  description: `${config.count}-scenario authorized AI-agent security assessment. Supply intake JSON with agent_id, authorization_reference, configuration {system_prompt,business_rules,tools}. Evidence and Markdown; isolated replica, not a live website audit.`,
  input: { intake: "object" }, output: { report: "object", markdown: "string" },
  async: true, max_wait_s: 180, timeout_ms: 10000,
}));
export const PARTNER_PRICES = { standard: 4, deep: 8 } as const;
export default [offering({
  name:"self_test_kit",price:2,endpoint:"/api/self_test_kit",
  description:"Keep your prompt and code private. Six agent security test scenarios, expected behavior, a local Python runner and results template. Run on your own authorized sandbox. Materials only, not a completed audit or certificate. Input {service_type, goals?}. Optional redacted evidence review sold separately.",
  input:{service_type:"string",goals:"string?"},output:{kit:"object",markdown:"string",runner_python:"string"},timeout_ms:10000,
}),offering({
  name:"evidence_review",price:3,endpoint:"/api/evidence_review",
  description:"Automated review of six redacted results from your purchased self_test_kit. Returns findings, limitations and an optional public evidence-review record. Owner-supplied execution, not independently witnessed; no secure certification. Input {kit_id,agent_version,results,publish?}.",
  input:{kit_id:"string",agent_version:"string",results:"array",publish:"boolean?"},output:{report:"object",markdown:"string"},async:true,max_wait_s:180,timeout_ms:10000,
}),...BASE_OFFERINGS, ...Object.entries(PARTNER_PRICES).map(([tier, price]) => offering({
  name: `assessment_${tier}_partner`, price, endpoint: `/api/assessment_${tier}_partner`,
  description: `Partner ${tier} assessment. Requires an active buyer-specific quote from our sales agent before buying. Same coverage as ${tier}.`,
  input: { intake: "object" }, output: { report: "object", markdown: "string" }, async: true, max_wait_s: 180, timeout_ms: 10000,
}))];
