# Piggy Arcade

**Integration disconnected on 14 November 2026.** All marketplace offerings are
paused, both Codex grants and the CLI authorization were revoked, and the local
MCP configuration was removed. The app's custom secrets were removed from
Ambasada. Vercel's Ambasada key and URL were removed; the internal assessment
secret was replaced with a new Vercel-only secret. The production website runs
local demos only and paid Vercel endpoints return 410. No unrelated provider
credentials or browser login sessions were removed. The source below is retained
as an archive; do not reconnect or redeploy the marketplace without authorization.

The hosted agent is platform-enforced `always_on`; its tool list was cleared and
its prompt replaced with a withdrawal of authorization. Final company server-key
rotation must be performed by the signed-in user under My team → More → For
developers → Server key → New key. That rotates the old server key immediately;
do not share the replacement with this project. Named developer sessions can be
revoked separately via their Log out → Tap to confirm controls.

Live at **https://demolari.vercel.app** — the same Vercel domain as before.

Three animated games using Hack A Ton **event TON play credits**:

- **Piggy Derby:** four pigs race; each has 25% chance, winning return 3.8×.
- **Hog Crossing:** survive road crossings and cash out, up to eight hops.
- **Truffle Trouble:** a 25-tile Mines board, three mines, up to eight safe picks.

Free demos use the same rules locally and never transfer TON. Paid entries use
Ambasada Checkout; payouts go to the original payer. Returns include stake,
are rounded down to 0.01 TON, and have 95% expected return before rounding.
There are no blockchain deposits, cash withdrawals or guaranteed profits.

## Architecture

- `public/`: responsive website, SVG characters and animated games.
- `marketplace/lib/arcade-engine.ts`: seeded outcomes and payout math.
- `marketplace/src/arcade-bank.ts`: persistent, serialized game state, treasury
  reservations, payment verification and idempotent payout retries.
- `marketplace/api/arcade.ts`: game API and signed marketplace play passes.
- `marketplace/agent/`: hosted Piggy Arcade sales-agent prompt and settings.
- `docs/arcade.md`: rules, settlement and operational details.

The website remains on Vercel. The existing Ambasada backend supplies durable
state and event-credit settlement at https://demolatorii-hackathon.ambasada.dev.
Former assessment products are paused; their source and records are retained
for historical orders. The Python assessment code is not used by the arcade.

## Develop and test

```powershell
cd marketplace
npm ci
npm run typecheck
npm test
npx ambasada dev
```

Generate the browser game engine from the repository root:

```powershell
marketplace/node_modules/.bin/esbuild.cmd marketplace/lib/arcade-engine.ts --format=esm --outfile=public/arcade-engine.js --target=es2022
```

Serve `public/` with a static web server. The production page calls the live
backend. The local village mock uses fake balances for end-to-end tests.
Keep credentials in the hosts or ignored environment files, never browser code.

## Deploy

```powershell
# Website, from repository root:
npx vercel deploy --prod --yes --scope demolatorii
# Backend, from marketplace/:
npx ambasada deploy --yes
```

Preserve the team's live model, mode and spending settings when syncing the
sales-agent files. Never remove or rewrite applied Durable Object migrations.

**Current platform issue:** Cloudflare has applied migration `v3` and serves the
arcade, but Ambasada's deploy API reports old tag `v2` versus expected `v3` on
subsequent uploads. The platform rejects code-only recovery. Organizer support
must reconcile that metadata before future backend updates. The live game API
responds successfully; the final local capacity guard is not yet deployed.

Browser visual QA was unavailable. Engine, TypeScript, signed fake-money
checkout, cash-out replay and payout tests passed. The first live external
player's payout has not been independently witnessed.
