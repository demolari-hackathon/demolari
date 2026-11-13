# Agent Checkup

An app on ambasada, one bare Cloudflare Worker (template `worker`). The page is a Hello, world, with no look and no
layout: build yours. Behind it: sign-in with ambasada ID, a database, key-value, files and live rooms, ready to use;
a mini app inside the ambasada app if you want one.

```
ambasada.config.ts          id, name, one-line description, where the app runs
src/worker.ts               the Worker: /api/<name> → api/<name>.ts, the rest from web/
api/auth.ts                 Sign in with ambasada (login, callback, logout, me, shell)
api/ambasada-webhook.ts     the ambasada app's events (notifications on/off); lib/notifications.ts sends pushes
api/notes.ts, api/files.ts  env.DB + env.KV, uploads to env.FILES
lib/ambasada.ts             the SDK client from the Worker's env
lib/db.ts, kv.ts, files.ts  env.DB, env.KV, env.FILES; db/migrations/ the tables
src/realtime/room.ts        the live room (a Durable Object)
web/                        the page (web/index.html: Hello, world), privacy, static assets
wrangler.jsonc              one Worker + assets, nodejs_compat, the storage bindings
examples/                   copy in what you want: sign-in/ (the button), notes/, room/ (a live room page), agent/
.claude/skills/             docs your coding agent reads (ambasada-product)
```

## 1. Run it (2 min)

Needs Node ≥ 22.

```sh
npm install
npm run dev                # `ambasada dev`: the mock ambasada API on :8788 + `wrangler dev` on http://localhost:3000
```

Open http://localhost:3000: Hello, world. Edit `web/index.html` and reload.
http://127.0.0.1:8788 is the mock's page (sign-ins, notifications, the store). `ambasada dev` points your app at the
mock whatever `.env` says.

## 2. Make it yours

- `ambasada.config.ts`: name and description.
- Your pages in `web/`, with your own look. Want the ambasada app's look? One `<link rel="stylesheet"
  href="https://unpkg.com/@ambasada/ui@0.8/dist/ambasada-ui.css" />` (optional).
- A new endpoint: `api/<name>.ts` (and a line in `src/worker.ts`). Data goes in `env.DB` (a migration in `db/migrations/`), `env.KV` or `env.FILES`.
- Ask your coding agent: it has the ambasada-product skill (stack, storage, sign-in, mini app, deploy).

No framework, no build step: `wrangler` bundles `src/worker.ts`, and `web/` is served as is.

## 3. Go live (1 min)

```sh
npx ambasada login         # once per laptop: opens your browser, sign in with ambasada ID and allow
npx ambasada deploy        # the first time it creates the app (asked; --yes without a terminal), then
                           # build, smoke test, host at https://demolatorii-hackathon.ambasada.dev
npx ambasada db migrate    # db/migrations → the app's database
npx ambasada logs          # the last deploy and recent errors
```

Sign-in, notifications and the storage are set up by the deploy; nothing to configure. Your own secrets:
`npx ambasada env set NAME value`. Hosting elsewhere: `npx wrangler deploy`, then `npx ambasada link https://…`.

**Sign in with ambasada**: the routes are in `api/auth.ts`; `examples/sign-in/` is the button. In the Worker,
`ambasada(env).auth.user(req)` gives `{ id, name, avatar_url, builder, pass }` or null; the browser asks `/api/auth/me`.

## Storage and realtime

Every app gets these, provisioned at the first `ambasada deploy`; locally wrangler keeps them in `.wrangler/state`.

| Binding | For | Here |
|---|---|---|
| `env.DB` | SQLite: anything relational | `lib/db.ts`, tables in `db/migrations/`, example `api/notes.ts` (a page for it: `examples/notes/`) |
| `env.KV` | sessions, caches, flags | `lib/kv.ts` (the notes cache) |
| `env.FILES` | uploads, generated files; public at `/files/<key>` | `lib/files.ts`, upload `api/files.ts` |
| `env.ROOMS` | live state shared between people (Durable Object) | `src/realtime/room.ts`, a page in `examples/room/` |

```sh
npx wrangler d1 migrations apply DB --local   # db/migrations → the local database (ambasada dev)
npx ambasada db migrate                       # … → the app's database online
npx ambasada db shell "SELECT * FROM notes"   # or `ambasada db shell` for a prompt
npx ambasada kv list | get <key> | put <key> <value> | delete <key>
npx ambasada files put <file> | list | url <key> | delete <key>
```

## Examples

Not part of the app until you copy them in; each README says where.

| | |
|---|---|
| `examples/sign-in/` | "Sign in with ambasada", or the person's name, avatar and "Sign out" |
| `examples/notes/` | `/notes`, a form and a list on `/api/notes` (`env.DB` + `env.KV`) |
| `examples/room/` | `/room`, a live room between tabs (`env.ROOMS`) |
| `examples/agent/` | an agent with the Agents SDK (`npm i agents` and four lines to wire it) |

## In the ambasada app (optional)

Off by default: this is a website. `npx ambasada miniapp enable` adds a mini app at `/app` (`--entry /` for the whole
site): `miniapp: { entry: "/app" }` in `ambasada.config.ts`, web/app.html (in the ambasada app's look, `@ambasada/ui`)
and web/in-app.js, a placeholder
`web/icon.png`, and the manifest `ambasada dev` and `deploy` serve at `/.well-known/ambasada.json`. Then
`http://localhost:3000/app?ambasada_shell=mock` pretends to be inside the ambasada app. With `--entry /` your own
pages are the mini app; inside the ambasada app the in-app code pads the page clear of the app's bar (on the web,
nothing changes). The ambasada-product skill: reference/mini-app.md.

## Rules worth knowing

- State lives in `env.DB`, `env.KV`, `env.FILES` or a Durable Object, never in module variables: a Worker has many instances.
- Secrets only in `.env` locally and `ambasada env set` online; never in the code or `wrangler.jsonc` vars.
- `npx ambasada check` runs the checks (https, no redirects, speed; the mini-app rules when it is on); `npx ambasada upgrade` after a new devkit.

For the Hack A Ton: `npx ambasada add village` (the add-on).

Built by [CENTYSO](https://centyso.com) for [ambasada](https://ambasada.id).

## The village

This app is also a Hack A Ton company (`@ambasada/village`): TON payments, offerings and an agent. See [VILLAGE.md](VILLAGE.md).
