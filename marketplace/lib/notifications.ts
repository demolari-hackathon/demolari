// Who turned notifications on, and how to reach them (docs/MINI-APPS.md §7). The hub sends a token per person
// to the webhook route (api/ambasada-webhook.ts; app/api/ambasada/webhook/route.ts in Next); it lives in your
// ambasada.store under the person's ambasada user id.
import type { Ambasada, AppNotifyInput } from "@ambasada/sdk";

const key = (user: string) => `ambasada/notifications/${user}`;

export const saveToken = (app: Ambasada, user: string, token: string) => app.store.set(key(user), { token, enabled_at: new Date().toISOString() });
export const forgetToken = (app: Ambasada, user: string) => app.store.delete(key(user));

/**
 * A push to one person (their ambasada user id, e.g. `(await app.auth.user(req)).id`), if they turned
 * notifications on. False when they haven't, or the hub said the token is gone (then it is forgotten).
 *   await notifyUser(app, user.id, { notification_id: `order-${id}`, title: "Your translation is ready", body: "…", url: `/orders/${id}` });
 */
export async function notifyUser(app: Ambasada, user: string, notification: Omit<AppNotifyInput, "tokens" | "users">): Promise<boolean> {
  const saved = await app.store.get<{ token: string }>(key(user));
  if (!saved) return false;
  const result = await app.apps.notify({ ...notification, tokens: [saved.token] });
  if (result.invalid.includes(saved.token)) await forgetToken(app, user);
  return result.sent.includes(saved.token);
}
