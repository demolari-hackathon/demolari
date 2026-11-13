// POST /api/ambasada/webhook: the ambasada app's events for this mini app (docs/MINI-APPS.md §7), signed with
// AMBASADA_APP_SECRET (injected on ambasada.dev; `ambasada dev` plays the hub and sends a ping and
// notifications_enabled here when it starts). The manifest points here: notifications.webhook.
import { isAmbasadaError } from "@ambasada/sdk";
import { ambasada, type Env } from "../lib/ambasada.ts";
import { forgetToken, saveToken } from "../lib/notifications.ts";

export default async function appWebhook(req: Request, env: Env): Promise<Response> {
  const app = ambasada(env);
  try {
    const event = await app.apps.verifyWebhook(req); // throws if forged or stale
    switch (event.event) {
      case "notifications_enabled":
      case "app_added":
        if (event.token) await saveToken(app, event.user, event.token);
        break;
      case "notifications_disabled":
      case "app_removed":
        await forgetToken(app, event.user);
        break;
      case "ping": // `ambasada check` and the registry: answer 200
        break;
    }
    return new Response("ok");
  } catch (error) {
    if (isAmbasadaError(error)) return error.toResponse();
    throw error;
  }
}
