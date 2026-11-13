import { createVillage, type Village } from "@ambasada/village";
import type { Jobs } from "../src/jobs/jobs.ts";
import type { Room } from "../src/realtime/room.ts";
import type { ArcadeBank } from "../src/arcade-bank.ts";

/** The Worker's env: `.env` locally (`ambasada dev` points it at the mock), secrets injected at deploy. */
export interface Env {
  ASSETS: Fetcher;
  /** The app's SQLite database (lib/db.ts), key-value (lib/kv.ts), files (lib/files.ts) and live rooms (src/realtime/room.ts). */
  DB: D1Database;
  KV: KVNamespace;
  FILES: R2Bucket;
  ROOMS: DurableObjectNamespace<Room>;
  /** Work that outlives a request (src/jobs/jobs.ts, lib/jobs.ts). */
  JOBS: DurableObjectNamespace<Jobs>;
  ARCADE: DurableObjectNamespace<ArcadeBank>;
  /** On ambasada.dev: a service binding to the API, which the SDK uses for its calls (set by `ambasada deploy`). */
  AMBASADA_API?: Fetcher;
  AMBASADA_API_KEY?: string;
  AMBASADA_COMPANY?: string;
  AMBASADA_VILLAGE_API_URL?: string;
  AMBASADA_WEBHOOK_SECRET?: string;
  AMBASADA_MCP_TOKEN?: string;
  ASSESSMENT_ACCESS_TOKEN?: string;
  ASSESSMENT_URL?: string;
  /** Set by `ambasada deploy` and `ambasada dev`; the SDK defaults to https://api.ambasada.dev. */
  AMBASADA_API_URL?: string;
  AMBASADA_APP_ID?: string;
  /** Sign in with ambasada (api/auth.ts): set by `ambasada deploy` on ambasada.dev, and by `ambasada dev`. */
  AMBASADA_AUTH_CLIENT_ID?: string;
  AMBASADA_AUTH_CLIENT_SECRET?: string;
  AMBASADA_AUTH_ISSUER?: string;
  /** Mini-app notifications (api/ambasada-webhook.ts, lib/notifications.ts): set on ambasada.dev and by `ambasada dev`. */
  AMBASADA_APP_SECRET?: string;
  AMBASADA_HUB_URL?: string;
  /** This app's origin, set by `ambasada deploy` and `ambasada dev`: use `appOrigin(env, req)`. */
  AMBASADA_APP_ORIGIN?: string;
}

/**
 * This app's own origin (https://<slug>.ambasada.dev online, the dev server locally): AMBASADA_APP_ORIGIN, which
 * `ambasada deploy` and `ambasada dev` set, else the request's (a call the platform forwards may carry another host).
 */
export function appOrigin(env: Env, req: Request): string {
  return env.AMBASADA_APP_ORIGIN ?? new URL(req.url).origin;
}

let client: Village | undefined;

/** One client per isolate: it caches the API's signing keys. */
export function ambasada(env: Env): Village {
  return (client ??= createVillage({ env: env as unknown as Record<string, unknown> }));
}
