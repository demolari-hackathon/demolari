# Live marketplace integration

- Website and Python assessment API: https://demolari.vercel.app
- Paid endpoints, checkout, jobs, webhook and agent MCP: https://demolatorii-hackathon.ambasada.dev
- Company: `demolatorii-hackathon`.

Regular offerings are `assessment_starter` (2 TON), `assessment_standard` (5 TON),
and `assessment_deep` (10 TON). `assessment_standard_partner` (4 TON) and
`assessment_deep_partner` (8 TON) require a buyer-specific quote created by the
authenticated `app__create_partner_quote` tool. Every offering accepts
`{"intake": <configuration JSON>}`. See `public/example-intake.json`.

The village SDK verifies the signed receipt, raw request hash, seller, offering,
expiry and replay checks. Durable jobs are keyed by receipt call ID. The gateway
holds payment until a valid report is delivered, or refunds the buyer on failure.
Checkout confirms paid status server-side; report links use private capability
tokens with hashes stored in D1. Failed checkout fulfillment schedules an
idempotent refund job. Reports contain customer data and must stay private.

The Python runner uses village model access when `AMBASADA_API_KEY` is configured,
or OpenAI otherwise. Vercel's `ASSESSMENT_ACCESS_TOKEN` must match the worker's.
Model calls and agent thinking cost TON independently of sales. A completed
assessment can include inconclusive checks; it is not a security certification.

## Deploy

Vercel deploys the repository root (`public/` and `api/assess.py`). Its secrets are
`AMBASADA_API_KEY` and `ASSESSMENT_ACCESS_TOKEN`; `MARKETPLACE_URL` is the worker
origin. These are configured in the host, never committed. Git pushes may trigger
Vercel deployment but do not deploy the worker.

From `marketplace/`:

```powershell
npm ci
npm run typecheck
npx ambasada login
npx ambasada deploy --yes
npx ambasada db migrate
npx ambasada village mcp test app
npx ambasada village webhook test
```

Worker settings include `ASSESSMENT_ACCESS_TOKEN` and `ASSESSMENT_URL` (the Vercel
origin). The platform injects village and webhook credentials. Deploying also
syncs offerings and `marketplace/agent/`. Keep settings aligned with live changes
before redeploying. The sales prompt originates in `prompts/security_closer.md`;
`marketplace/agent/agent.md` includes additional integration instructions.

## Verification performed

Python unit/HTTP tests, worker TypeScript checks, local signed async purchases,
idempotent retries, fake-visitor checkout and private report delivery, a real
10-scenario model assessment on Vercel, live checkout creation, unsigned-request
rejection, database migrations, MCP discovery and webhook delivery all passed.
The first external customer's paid delivery has not yet been verified.
