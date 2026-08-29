/**
 * lib/db/framework.ts — Bitcoin-scale DB adapter
 *
 * ## Scaling path (small core → planetary scale)
 *
 * ```
 * Phase 0  (now, pilot)         Single Neon HTTP DB  — one DATABASE_URL, no pool
 * Phase 1  (100s-10k users)     Same adapter, optional PgBouncer / Neon pooled URL
 * Phase 2  (10k-100k users)     DB_PROVIDER=neon-multi — N Neon branches, shard by
 *                               scope_type/scope_value via shardKey(). No app rewrite,
 *                               only env flags. Cross-shard queries fan-out in adapter.
 * Phase 3  (100k+ users)        Add cache layer in front of adapter:
 *                               getCachedSql() / withCache(sql) — Redis/Upstash for
 *                               hot rows (leaderboards, event feeds). Adapter unchanged;
 *                               callers opt-in per query. Write-through on verified events.
 * ```
 *
 * Bitcoin analogy: tiny consensus core + pluggable layers. This file is the
 * "consensus" — ~150 LOC, no logic that forces a rewrite when you shard or cache.
 * Every table uses `IF NOT EXISTS`; shard helpers are pure functions.
 */

import { neon } from "@neondatabase/serverless";

// ---------------------------------------------------------------------------
// Provider / connection adapter
// ---------------------------------------------------------------------------

/** Supported DB providers. Extend without touching callers. */
export type DbProvider = "neon" | "neon-multi";

/** Neon SQL client — typed as any to keep callers ergonomic (array result vs FullResults union). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any  — driver generics vary across versions
export type NeonSql = any;

/**
 * Read active provider from env.
 * - `neon`        → single DATABASE_URL (default, pilot)
 * - `neon-multi`  → sharded: DATABASE_URL + DATABASE_URL_SHARD_* or second branch
 */
export function getProvider(): DbProvider {
  const raw = (process.env.DB_PROVIDER ?? "neon").toLowerCase().trim();
  if (raw === "neon-multi" || raw === "neon_multi" || raw === "multi") return "neon-multi";
  return "neon";
}

/** How many shards are configured. 1 = no sharding. */
export function getShardCount(): number {
  const n = parseInt(process.env.DB_SHARD_COUNT ?? "", 10);
  if (Number.isFinite(n) && n > 1 && n <= 64) return n;
  // infer from env: count DATABASE_URL_SHARD_* entries
  let inferred = 0;
  for (const k of Object.keys(process.env)) if (k.startsWith("DATABASE_URL_SHARD_")) inferred++;
  return inferred > 1 ? inferred : 1;
}

/** Collect shard URLs in order. Index 0 == primary DATABASE_URL. */
export function listShardUrls(): string[] {
  const primary = process.env.DATABASE_URL ?? "";
  if (getProvider() !== "neon-multi") return primary ? [primary] : [];
  const shards: string[] = primary ? [primary] : [];
  // DATABASE_URL_SHARD_1, _2, ...  — also accept _0
  const entries: [number, string][] = [];
  for (const [k, v] of Object.entries(process.env)) {
    const m = k.match(/^DATABASE_URL_SHARD_(\d+)$/);
    if (m && v) entries.push([parseInt(m[1], 10), v]);
  }
  entries.sort((a, b) => a[0] - b[0]);
  for (const [, v] of entries) if (!shards.includes(v)) shards.push(v);
  // fallback: DATABASE_URL_2, _3 legacy
  for (let i = 2; i <= 8; i++) {
    const v = process.env[`DATABASE_URL_${i}` as keyof NodeJS.ProcessEnv] as string | undefined;
    if (v && !shards.includes(v)) shards.push(v);
  }
  return shards.filter(Boolean);
}

// ── lazy client cache (one per URL) ────────────────────────────────────────
// Connection pooling notes (Neon HTTP driver):
// - Neon serverless uses HTTP fetch, not TCP sockets → no classic pg Pool.
// - Each `neon(url)` call creates a lightweight fetch wrapper; safe to cache
//   per-URL and reuse across requests (avoids re-parsing URL).
// - For pooled TCP (e.g. Vercel + Neon pooled URL `*-pooler.*.neon.tech`):
//   set DATABASE_URL to the pooled endpoint; same adapter, 0 code changes.
//   Future: swap to `neonConfig.poolQueryViaFetch` or `@neondatabase/serverless`
//   Pool class if Neon adds native pooling — only this cache changes.
// - Multi-shard: one cached client per shard, resolved by shardIndex().
const clientCache = new Map<string, ReturnType<typeof neon>>();

function getOrCreateClient(url: string): NeonSql {
  const hit = clientCache.get(url);
  if (hit) return hit as NeonSql;
  const c = neon(url) as unknown as NeonSql;
  clientCache.set(url, c as unknown as ReturnType<typeof neon>);
  return c;
}

/**
 * Main adapter entry: return a Neon SQL client for the current provider.
 *
 * - `neon`       → single client from DATABASE_URL
 * - `neon-multi` → primary shard client (use getShardSql() for routed queries)
 *
 * Backward-compat: existing `import { sql } from "@/lib/db"` keeps working because
 * lib/db.ts does `export const sql = getSql()`.
 */
export function getSql(): NeonSql | null {
  const urls = listShardUrls();
  if (urls.length === 0) return null;
  // Always return primary for generic queries; sharded queries should use getShardSql()
  return getOrCreateClient(urls[0]!);
}

/** Return client for a specific shard index (0-based, modulo shard count). */
export function getSqlForShardIndex(index: number): NeonSql | null {
  const urls = listShardUrls();
  if (urls.length === 0) return null;
  if (urls.length === 1) return getOrCreateClient(urls[0]!);
  const i = ((index % urls.length) + urls.length) % urls.length;
  return getOrCreateClient(urls[i]!);
}

// ---------------------------------------------------------------------------
// Sharding helpers — pure, deterministic, no I/O
// ---------------------------------------------------------------------------

/**
 * FNV-1a 32-bit hash — tiny, fast, deterministic across runtimes.
 * No crypto needed; shard routing is not security-sensitive.
 */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Derive a stable shard key from event/user scope.
 *
 * - `scope_type` examples: "global" | "programme" | "level" | "user"
 * - `scope_value` examples: "Computer Science" | "300L" | userId | ""
 *
 * Normalised: lowercased, trimmed, joined with ":".
 * Global scope hashes to a single value so all global events land together
 * (avoids cross-shard fan-out for the hottest query).
 */
export function shardKey(scope_type: string, scope_value?: string | null): string {
  const t = (scope_type ?? "global").toLowerCase().trim() || "global";
  const v = (scope_value ?? "").toLowerCase().trim();
  if (t === "global" || !v) return t;
  return `${t}:${v}`;
}

/** Map a shardKey to a shard index 0..(shardCount-1). */
export function shardIndexForKey(key: string, shardCount?: number): number {
  const n = shardCount ?? getShardCount();
  if (n <= 1) return 0;
  return hashString(key) % n;
}

/** Convenience: scope → shard index. */
export function shardIndexForScope(
  scope_type: string,
  scope_value?: string | null,
  shardCount?: number
): number {
  return shardIndexForKey(shardKey(scope_type, scope_value), shardCount);
}

/**
 * Route to the correct shard's SQL client by scope.
 * Falls back to primary when only one shard is configured.
 */
export function getShardSql(
  scope_type: string,
  scope_value?: string | null
): NeonSql | null {
  const idx = shardIndexForScope(scope_type, scope_value);
  return getSqlForShardIndex(idx);
}

/**
 * Fan-out helper: run `fn` on every shard and concat results.
 * Use for cross-scope queries (e.g. admin dashboards).
 */
export async function fanOutShards<T>(
  fn: (sql: NeonSql, shardIndex: number) => Promise<T[]>
): Promise<T[]> {
  const urls = listShardUrls();
  if (urls.length <= 1) {
    const c = getSql();
    if (!c) return [];
    return fn(c, 0);
  }
  const results = await Promise.all(
    urls.map((u, i) => fn(getOrCreateClient(u), i))
  );
  return results.flat();
}

// ---------------------------------------------------------------------------
// Cache-layer hook (Phase 3 placeholder — no runtime cost now)
// ---------------------------------------------------------------------------

/**
 * Phase 3 hook: wrap a query with an external cache (Redis/Upstash).
 * Currently a passthrough — keeps the interface stable so adding a cache
 * later requires no changes to callers:
 *
 *   const rows = await withCache("events:global", 30, () => sql`SELECT ...`);
 *
 * When CACHE_PROVIDER is unset, `fn` is called directly.
 */
export async function withCache<T>(
  _key: string,
  _ttlSeconds: number,
  fn: () => Promise<T>
): Promise<T> {
  // TODO Phase 3: if (process.env.CACHE_PROVIDER) check Redis first
  return fn();
}

/** For tests / HMR: clear cached clients so new env is picked up. */
export function __clearClientCache(): void {
  clientCache.clear();
}
