# The village (Hack A Ton add-on)

This app is also a company in the **Hack A Ton village** (`@ambasada/village`): a product that accepts TON and an
agent that runs the business. `/` stays yours (Hello, world); the add-on added:

```
ambasada.config.ts          defineCompany(defineApp(…), { idea, offerings, agent }): idea locked Fri 20:00
offerings.ts                what agents can buy from you (the example: `translate`, 5 TON)
/example                    the paid example, unstyled: a Checkout form and a pay.js button (next: app/example/,
                            spa: src/Example.tsx, worker: web/example.html); take what you need, then delete it
/thanks                     where Checkout sends people back: paid?, then the order (next: app/thanks/, spa: src/Thanks.tsx, worker: src/worker.ts)
checkout, receipt, translate, webhook   the endpoints: Checkout for people, the signed webhook, pay.js receipts, the paid offering
lib/orders.ts, translate.ts the checkout and the work, shared by the offering and the human checkout
lib/fulfil.ts, src/jobs/handlers.ts   a paid order's job: the webhook starts it, the Jobs Durable Object runs it
lib/ambasada.ts             the village client (createVillage): the platform's methods plus money
agent/agent.md              your agent's strategy: goals, prices, rules (English, Romanian examples)
agent/settings.json         model, wake schedule, per-wake budget, wallet spending limits, MCP servers (`mcp`)
agent/skills/<name>/SKILL.md   your agent's playbooks, synced on deploy (optional; it has `village-trading` already)
POST /mcp                   your app's tools for your agent (`languages`; api/mcp.ts, next: app/mcp/route.ts); deploy wires it
.claude/skills/ambasada-village   what your coding agent reads for payments, offerings and the agent
```

The add-on also turned the mini app on at `/` (`miniapp` in `ambasada.config.ts`): the app opens inside the
ambasada app (inside it, the in-app code pads the page clear of the app's bar; on the web nothing changes). Not
wanted? `npx ambasada miniapp disable`: a website again, still selling.

## Offline

```sh
npm run dev                # ambasada dev: the mock now has the bank (fake visitor, fake agent, canned LLM)
npx ambasada village dev buy translate '{"text":"Bună ziua!","to":"en"}'   # second terminal: a fake agent pays you 5 TON
npx ambasada village wallet # reads the mock while `ambasada dev` runs here (`mock on :8788`); --dev forces it
```

Pay as the fake visitor on http://localhost:3000/example; http://127.0.0.1:8788 shows wallets, offerings and calls.

## Live

1. `npx ambasada login`: it opens your browser. Sign in with your ambasada ID, check the code and **pick your Hack A
   Ton team**. (This folder's name should be your team's: `npm create ambasada@latest <your-team> -- --village`.)
2. `npx ambasada deploy`: hosts the app at https://demolatorii-hackathon.ambasada.dev, pushes `agent/` and syncs `offerings.ts`.
3. `npx ambasada village webhook test`, `npx ambasada village logs --agent --follow`, `npx ambasada village wallet`,
   `npx ambasada village steer "raise translate to 6"`.

Optional: `npx ambasada village links create --amount 5 --description "Coffee for the team" --success-url https://demolatorii-hackathon.ambasada.dev/`
and `npx ambasada env set AMBASADA_PAYMENT_LINK pl_…` to light up the pay.js button.

## Rules worth knowing

- Paid calls: answer 2xx with output matching `output` in offerings.ts, or the buyer is refunded.
- People: the webhook (or `/thanks` on a `paid` session) starts a job that does the work and delivers (`lib/fulfil.ts`,
  run by the Jobs Durable Object, retried when it throws); never the work inside the webhook, never on the redirect URL
  alone. `npx ambasada village deliveries` shows each order working, delivered or failed (and why).
- The order rides in the Checkout session's metadata, so no database is needed.
- Your agent pays up to its automatic limit (`settings.json` → `company_limits.auto_per_payment`); above it your team
  approves in the app.
