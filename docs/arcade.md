# Piggy Arcade

Website: https://demolari.vercel.app (same Vercel project and domain).
Settlement backend: https://demolatorii-hackathon.ambasada.dev.

TON is the Hack A Ton event's play currency. No blockchain deposit or cash
withdrawal is offered. Games have a disclosed 95% expected return before
rounding; an entry can be lost in full. Profit is not guaranteed for players
or the operator on any particular round.

## Games

- Piggy Derby: four equally likely pigs, eight-second animated race, 3.8× return
  including stake on a correct pick, zero otherwise.
- Hog Crossing: independently survive each hop with probability 0.8. Cash out
  after a safe hop, up to eight. Return is `floor(stake_cents * .95 / .8^steps)`.
  Car timing is animation, not a skill input.
- Truffle Trouble: three mines among 25 tiles. Reveal up to eight safe cells;
  cash out after any safe pick. Return uses exact cumulative survival probability.

Website entries are 0.5 or 1 TON. Marketplace passes cost 1 TON and return a
private browser play URL, not an immediate win. Legacy security offerings are
paused; their routes/data remain to support past orders.

## Money and state

`ArcadeBank` is a single persistent Durable Object (`ARCADE`, migration v3).
Requests are serialized, amounts stored in integer hundredths of TON, and the
maximum possible return reserved before an entry is accepted. A 20 TON treasury
buffer is retained. Unpaid entries are limited per IP hash. Only the server
decides outcomes. An access token controls a round; payouts go only to the
verified original payer. Nickname leaderboard participation is opt-in.

Checkout payment is verified from the village's authoritative session and signed
webhook. Outcomes and payout liabilities are saved before transferring credits.
The transfer key is `arcade:payout:<round_id>`, reused on every retry. A failed
transfer remains visibly pending and retains its reservation; a durable alarm
retries it. Duplicate action IDs cannot advance a round or pay twice.

After one hour, unfinished paid road/Mines games cash out their safe progress;
paid games with no moves refund the entry. Pig races settle automatically. An
expired unpaid checkout is not counted as a played round. Alarm maintenance
works in batches; records are event-lifetime storage.

Fairness: a 256-bit server seed is committed by SHA-256 before play. Draws are
SHA-256 of `seed:client_seed:counter`; the first six digest bytes interpreted as
an unsigned integer divided by 2^48. First draw selects the pig, next eight
draws select road hazards, then a Fisher–Yates shuffle picks three Mines cells.
The seed and algorithm are revealed only after a round ends. The commitment
supports checking the recorded outcome; it is not third-party certification.

## Development and deployment

```powershell
cd marketplace
npm ci
npm run typecheck
npm test
npx ambasada dev
```

`public/arcade-engine.js` is generated from `marketplace/lib/arcade-engine.ts`:

```powershell
marketplace/node_modules/.bin/esbuild.cmd marketplace/lib/arcade-engine.ts --format=esm --outfile=public/arcade-engine.js --target=es2022
npx vercel deploy --prod --yes --scope demolatorii
```

From `marketplace/`, `npx ambasada deploy --yes` deploys the backend, adds the
Durable Object migration, syncs listings and updates the hosted sales prompt.
Snapshot/preserve the live agent settings before deployment if the team changed
them on the platform. Existing platform model, mode and spending limits are
authoritative. `--no-smoke` is appropriate only after a passing smoke check when
Windows fails to remove the smoke test's locked temporary files.

The website is buildless HTML/CSS/JS. It calls the backend directly with CORS
restricted to the production Vercel origin and localhost. The old Python
assessment endpoint is not used by the arcade. Browser demos run the same engine
locally and never spend or pay TON, publish scores, or create payout liabilities.

API: `GET /api/arcade/config`, `GET /api/arcade/feed`, `POST /api/arcade/start`,
`GET /api/arcade/state?id=...` with bearer round access, and `POST /api/arcade/action`.
Marketplace endpoints: `/api/pig_race`, `/api/road_run`, `/api/mines_game` verify
village receipts. Never put account keys in the frontend.
