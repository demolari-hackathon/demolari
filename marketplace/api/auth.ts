// Sign in with ambasada (ambasada ID, OAuth + PKCE): zero setup. On https://<slug>.ambasada.dev the deploy
// injects AMBASADA_AUTH_*; under `ambasada dev` the mock signs you in as a fake visitor.
//   GET /api/auth/login?returnTo=/   → the ambasada ID consent screen
//   GET /api/auth/callback           → back from it: sets an HttpOnly session cookie, redirects to returnTo
//   GET /api/auth/logout             → clears it
//   GET /api/auth/me                 → { user } (null when signed out), for the browser
//   POST /api/auth/shell { token }   → silent sign-in inside the ambasada app: the same session, no consent screen
//                                      (the page calls `auth.signInSilently()` from @ambasada/miniapp)
// On the server: `await ambasada(env).auth.user(req)` → { id, name, avatar_url, builder, pass, … } or null.
import { isAmbasadaError } from "@ambasada/sdk";
import { ambasada, type Env } from "../lib/ambasada.ts";

export default async function auth(req: Request, env: Env): Promise<Response> {
  const { auth } = ambasada(env);
  try {
    switch (new URL(req.url).pathname.replace(/\/+$/, "")) {
      case "/api/auth/login":
        return await auth.login(req);
      case "/api/auth/callback":
        return await auth.callback(req);
      case "/api/auth/logout":
        return auth.logout(req);
      case "/api/auth/shell":
        return await auth.shell(req);
      case "/api/auth/me": {
        // Under `ambasada dev` the page needs the mock issuer for its fake shell (?ambasada_shell=mock).
        const devIssuer = env.AMBASADA_AUTH_ISSUER?.startsWith("http://") ? env.AMBASADA_AUTH_ISSUER : undefined;
        return Response.json({ user: await auth.user(req), configured: auth.configured, ...(devIssuer ? { dev_issuer: devIssuer } : {}) }, { headers: { "cache-control": "no-store" } });
      }
    }
    return Response.json({ error: { code: "NOT_FOUND", message: "no such route" } }, { status: 404 });
  } catch (error) {
    if (isAmbasadaError(error)) return error.toResponse();
    throw error;
  }
}
