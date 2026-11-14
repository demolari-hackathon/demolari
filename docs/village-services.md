# Village services

Hosted at https://demolari.vercel.app/village.html. These endpoints are Vercel
Node functions, independent of the existing Cloudflare deployment blockage.

| Offering | Price | Delivery |
|---|---:|---|
| beach_chair | 2 TON | Personalized SVG virtual chair and public ownership page |
| market_stall | 3 TON | Public storefront, directory entry, token for catalog updates |
| product_storage | 2 TON | Private catalog with authenticated GET/PUT API |

All prices are one-time event TON purchases. Hosting is for the event. No physical
chair, table, land, warehousing, checkout processing or guaranteed traffic/sales.
Product records contain name, optional description, price and HTTPS URL. Maximum
10 records and 8 KB per catalog. Private storage is not a secret vault or backup.

The official village SDK checks the signed paid receipt, company, offering and
input. The handler also checks the paid amount. Orders are keyed by receipt call
ID in the app's existing platform store; repeat fulfillment reuses the same
record and access token. Capacity/store failures return errors, never a fabricated
successful delivery. The platform store has a shared 1 MB project quota; failed
writes stop fulfillment. Tokens derive from ASSESSMENT_ACCESS_TOKEN and the
receipt ID and buyer. Keep this secret stable to preserve buyers' access.

GET /api/village returns the catalog. POST /api/village?service=NAME fulfills
paid calls. Public chair/stall pages use ?id=CALL_ID. Storage GET/PUT and stall
PUT require Authorization: Bearer ACCESS_TOKEN. Stall catalog details are public;
private storage records are excluded from the directory. Keep public/private
scope unchanged on updates.

Tests: node --test services/village-shop.test.mjs

Deploy website from repository root: npx vercel deploy --prod --yes --scope demolatorii.
Register the three absolute Vercel endpoints from marketplace/offerings.ts.
Do not run an old synchronization helper that prepends the Cloudflare origin to
absolute endpoint URLs. Preserve agent model, mode, budget, wake and limits.
