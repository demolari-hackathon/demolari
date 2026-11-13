/**
 * The app: one Cloudflare Worker (`wrangler dev`, or `ambasada dev` with the mock API).
 *
 *   /api/<name>  → api/<name>.ts (fetch handlers; add yours to API below)
 *   /api/auth/*  → api/auth.ts: Sign in with ambasada (login, callback, logout, me, shell)
 *   /api/ambasada/webhook → api/ambasada-webhook.ts: the ambasada app's events (notifications on/off, ping)
 *   /api/notes, /api/files → api/notes.ts (env.DB + env.KV), api/files.ts (uploads to env.FILES)
 *   /api/rooms/<id>/ws → the live room <id> (src/realtime/room.ts, a Durable Object); a page for it in examples/room/
 *   /files/*     → files from env.FILES (lib/files.ts)
 *   the rest     → static files from web/ (wrangler.jsonc → assets): / is web/index.html
 */
import appWebhook from "../api/ambasada-webhook.ts";
import auth from "../api/auth.ts";
import files from "../api/files.ts";
import notes from "../api/notes.ts";
import assessment from "../api/assessment.ts";
import arcade,{arcadeTicket} from "../api/arcade.ts";
import selfTestKit from "../api/self-test-kit.ts";
import evidenceReview from "../api/evidence-review.ts";
import checkout from "../api/checkout.ts";
import receipt from "../api/receipt.ts";
import webhook from "../api/webhook.ts";
import mcp from "../api/mcp.ts";
import { asyncJobRoute, offeringJob } from "../lib/offering-jobs.ts";
import type { Env } from "../lib/ambasada.ts";
import { FILES_PATH, serveFile } from "../lib/files.ts";
import { serverError, withRequestLog } from "../lib/errors.ts";

export { Room } from "./realtime/room.ts";
export { Jobs } from "./jobs/jobs.ts";
export { ArcadeBank } from "./arcade-bank.ts";

type Handler = (req: Request, env: Env) => Promise<Response>;
const API: Record<string, Handler> = { checkout, receipt, webhook,
  pig_race:arcadeTicket,road_run:arcadeTicket,mines_game:arcadeTicket,
  self_test_kit:selfTestKit,evidence_review:evidenceReview,
  assessment_starter: assessment, assessment_standard: assessment, assessment_deep: assessment,
  assessment_standard_partner: assessment, assessment_deep_partner: assessment };

export default {
  async fetch(req, env) {
    // A failing request's console.error lines and error go to `ambasada logs` (lib/errors.ts).
    const origin = req.headers.get("Origin");
    const allowed = origin === "https://demolari.vercel.app" || origin === "http://localhost:8000";
    if (req.method === "OPTIONS") return new Response(null, { status: allowed ? 204 : 403, headers: allowed ? {
      "Access-Control-Allow-Origin": origin!, "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type,Authorization", "Vary": "Origin"
    } : {} });
    const response = await withRequestLog(() => handle(req, env));
    if (!allowed) return response;
    const answer = new Response(response.body, response);
    answer.headers.set("Access-Control-Allow-Origin", origin!);
    answer.headers.set("Vary", "Origin");
    answer.headers.set("Cache-Control", "no-store");
    return answer;
  },
} satisfies ExportedHandler<Env>;

/** Every route; a throw anywhere answers 500 and is logged with its stack. */
async function handle(req: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(req.url);
  try {
    if (pathname === "/health") return Response.json({ ok: true });
    if(pathname.startsWith('/api/arcade/'))return arcade(req,env);
    if(req.method==="GET" && /^\/verify\/call_[a-zA-Z0-9_-]+$/.test(pathname)) {
      const row=await env.DB.prepare("SELECT public_record FROM evidence_reviews WHERE id=?").bind(pathname.split('/').pop()).first<{public_record:string|null}>();
      if(!row?.public_record)return new Response("No public review at this address",{status:404});
      const data=JSON.parse(row.public_record) as Record<string,unknown>;
      if(req.headers.get('Accept')?.includes('application/json'))return Response.json(data);
      const esc=(v:unknown)=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
      return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Agent Checkup evidence record</title><body><main><h1>Agent Checkup</h1><h2>${esc(data.label)}</h2><p>${esc(data.provenance)}</p><dl><dt>Company</dt><dd>${esc(data.company)}</dd><dt>Version</dt><dd>${esc(data.agent_version)}</dd><dt>Date</dt><dd>${esc(data.created_at)}</dd></dl><p>Scope: ${esc((data.scope as string[]).join(', '))}</p><p>Findings: ${esc(JSON.stringify(data.counts))}</p><p>${esc(data.limitations)}</p><p>This record was published at the buyer's request. Private transcripts are not displayed.</p><a href="https://demolari.vercel.app">Agent Checkup</a></main></body></html>`,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; base-uri 'none'; frame-ancestors 'none'",'X-Content-Type-Options':'nosniff'}});
    }
    if (pathname === "/mcp") return await mcp(req, env);
    const jobRoute = asyncJobRoute(pathname);
    if (jobRoute) return await offeringJob(jobRoute.offering, req, env);
    if (pathname.startsWith("/api/auth/")) return await auth(req, env);
    if (pathname === "/api/ambasada/webhook") return await appWebhook(req, env);
    const room = /^\/api\/rooms\/([^/]+)\/ws$/.exec(pathname);
    if (room) return await env.ROOMS.getByName(decodeURIComponent(room[1]!)).fetch(req);
    if (pathname.startsWith(FILES_PATH)) return await serveFile(env.FILES, req);
    const api = /^\/api\/([^/]+)\/?$/.exec(pathname);
    if (api) {
      const handler = API[api[1]!];
      return handler ? await handler(req, env) : Response.json({ error: { code: "NOT_FOUND", message: "no such route" } }, { status: 404 });
    }
    return env.ASSETS.fetch(req);
  } catch (error) {
    return serverError(error);
  }
}
