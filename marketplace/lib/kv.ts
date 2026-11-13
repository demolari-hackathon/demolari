/**
 * env.KV: this app's key-value store (Cloudflare KV). Fast reads everywhere, writes visible within about a
 * minute, at most one write per second per key. Good for sessions, caches and feature flags; not for counters
 * or anything two people change at once (use env.DB, or a Durable Object for live state).
 *
 *   await putJson(env.KV, `session:${id}`, { user }, { ttl: 60 * 60 * 24 });
 *   const session = await getJson<{ user: string }>(env.KV, `session:${id}`);
 *   const page = await cached(env.KV, "home:stats", 60, () => computeStats());
 */

/** What this file needs from a KV binding (env.KV satisfies it). */
export interface KeyValue {
  get(key: string, type: "text"): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

/** The value saved under `key`, parsed; null when there is none (or it expired). */
export async function getJson<T>(kv: KeyValue, key: string): Promise<T | null> {
  const text = await kv.get(key, "text");
  return text === null ? null : (JSON.parse(text) as T);
}

/** Saves `value` as JSON. `ttl`: seconds until it disappears (at least 60). */
export function putJson(kv: KeyValue, key: string, value: unknown, options: { ttl?: number } = {}): Promise<void> {
  return kv.put(key, JSON.stringify(value), options.ttl ? { expirationTtl: Math.max(60, options.ttl) } : undefined);
}

export function remove(kv: KeyValue, key: string): Promise<void> {
  return kv.delete(key);
}

/** `load()`'s result, kept for `ttl` seconds: a cache in front of something slow. */
export async function cached<T>(kv: KeyValue, key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const hit = await getJson<T>(kv, key);
  if (hit !== null) return hit;
  const value = await load();
  await putJson(kv, key, value, { ttl });
  return value;
}
