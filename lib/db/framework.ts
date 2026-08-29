/**
 * lib/db/framework.ts — env-light, provider-agnostic DB adapter
 *
 * Modular: providers are plug-ins (DbAdapter) auto-registered by URL pattern.
 * No hard-coded if-else per provider — just registerAdapter().
 * Single DATABASE_URL works for any Postgres; sharding via DATABASE_URLS.
 *
 * ## Scaling path
 * ```
 * Phase 0  (pilot)              Single Postgres via DATABASE_URL (auto-detected)
 * Phase 1  (growth)             Pooled URL — same adapter, 0 code changes
 * Phase 2  (sharded)            DATABASE_URLS=postgres://... , postgres://...
 *                                shard by scope_type/scope_value via shardKey()
 * Phase 3  (cache)              withCache(key, ttl, fn) — Redis/Upstash
 * ```
 */

import { neon } from "@neondatabase/serverless";

// ---------------------------------------------------------------------------
// Modular provider adapters
// ---------------------------------------------------------------------------

/** SQL client type (neon fetch tag). Keep as any for ergonomic `sql`...`` usage. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type NeonSql = any;

/** Generic provider id — open string so new providers need no enum change. */
export type DbProvider = string;

/** Plug-in contract: match URL pattern + create client. */
export interface DbAdapter {
  /** Provider id, e.g. "neon" | "supabase" | "vercel" | "postgres" */
  id: DbProvider;
  /** Return true if this adapter handles the URL */
  match: (url: string) => boolean;
  /** Create a SQL client for the URL */
  getSql: (url: string) => NeonSql;
}

// Registry — order matters, first match wins (catch-all last)
const adapters: DbAdapter[] = [];

/** Register a provider adapter. Inserts before catch-all "postgres" if present. */
export function registerAdapter(adapter: DbAdapter): void {
  const catchAllIdx = adapters.findIndex((a) => a.id === "postgres");
  if (catchAllIdx !== -1) adapters.splice(catchAllIdx, 0, adapter);
  else adapters.push(adapter);
}

/** List all registered adapters (read-only snapshot). */
export function listAdapters(): readonly DbAdapter[] {
  return adapters;
}

/** Find adapter for a URL (first match). */
export function getAdapterForUrl(url: string): DbAdapter | null {
  for (const a of adapters) if (a.match(url)) return a;
  return null;
}

/** Detect provider id from URL via adapter registry (no if-else). */
export function detectProvider(url?: string | null): DbProvider {
  if (!url) return "unknown";
  return getAdapterForUrl(url)?.id ?? "unknown";
}

/**
 * Active provider — auto-detected from primary URL via registry.
 * Backward compat: explicit DB_PROVIDER env is still respected if set.
 */
export function getProvider(): DbProvider {
  const override = (process.env.DB_PROVIDER ?? "").toLowerCase().trim();
  if (override) {
    // legacy values map to registry ids
    if (override === "neon-multi" || override === "multi") {
      const primary = getPrimaryUrl();
      return detectProvider(primary);
    }
    if (adapters.some((a) => a.id === override)) return override;
  }
  return detectProvider(getPrimaryUrl());
}

// --- built-in adapters (auto-registered by URL pattern) ---

const neonAdapter: DbAdapter = {
  id: "neon",
  match: (url) => /neon\.tech/i.test(url),
  getSql: (url) => neon(url) as unknown as NeonSql,
};

const supabaseAdapter: DbAdapter = {
  id: "supabase",
  match: (url) => /supabase\.co|supabase\.com/i.test(url),
  getSql: (url) => neon(url) as unknown as NeonSql,
};

const vercelAdapter: DbAdapter = {
  id: "vercel",
  match: (url) => /vercel/i.test(url) || /postgres\.vercel/i.test(url),
  getSql: (url) => neon(url) as unknown as NeonSql,
};

// catch-all — must stay last, matches anything (generic Postgres)
const postgresAdapter: DbAdapter = {
  id: "postgres",
  match: () => true,
  getSql: (url) => neon(url) as unknown as NeonSql,
};

// auto-register built-ins (pattern-based, no if-else)
registerAdapter(neonAdapter);
registerAdapter(supabaseAdapter);
registerAdapter(vercelAdapter);
registerAdapter(postgresAdapter);

// ---------------------------------------------------------------------------
// Env-light URL resolution
// ---------------------------------------------------------------------------

/** Primary URL: DATABASE_URLS[0] or DATABASE_URL */
export function getPrimaryUrl(): string | null {
  const urls = listShardUrls();
  return urls[0] ?? null;
}

/** How many shards — derived from URL list, no hard-coded env count. */
export function getShardCount(): number {
  return listShardUrls().length || 1;
}

/**
 * Collect shard URLs.
 * - Primary: DATABASE_URLS (comma-separated)
 * - Fallback: DATABASE_URL (single, backward compat)
 * - Legacy fallback (deprecated): DATABASE_URL_SHARD_* / DATABASE_URL_2 — kept for compat
 */
export function listShardUrls(): string[] {
  const rawMulti = (process.env.DATABASE_URLS ?? "").trim();
  if (rawMulti) {
    const parts = rawMulti.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0) return parts;
  }
  const primary = (process.env.DATABASE_URL ?? "").trim();
  const shards: string[] = primary ? [primary] : [];

  // legacy fallbacks (deprecated)
  const entries: [number, string][] = [];
  for (const [k, v] of Object.entries(process.env)) {
    const m = k.match(/^DATABASE_URL_SHARD_(\d+)$/);
    if (m && v) entries.push([parseInt(m[1], 10), (v as string).trim()]);
  }
  if (entries.length > 0) {
    entries.sort((a, b) => a[0] - b[0]);
    for (const [, v] of entries) if (v && !shards.includes(v)) shards.push(v);
  }
  for (let i = 2; i <= 8; i++) {
    const v = process.env[`DATABASE_URL_${i}` as keyof NodeJS.ProcessEnv] as string | undefined;
    const url = (v ?? "").trim();
    if (url && !shards.includes(url)) shards.push(url);
  }
  return shards.filter(Boolean);
}

// ── lazy client cache (one per URL) ────────────────────────────────────────
// Delegates to the matched adapter's getSql(url)
const clientCache = new Map<string, NeonSql>();

function getOrCreateClient(url: string): NeonSql {
  const hit = clientCache.get(url);
  if (hit) return hit;
  const adapter = getAdapterForUrl(url) ?? postgresAdapter;
  const c = adapter.getSql(url);
  clientCache.set(url, c);
  return c;
}

/**
 * Main entry: return SQL client for primary shard.
 * Reads DATABASE_URL or DATABASE_URLS[0] — no provider enum.
 */
export function getSql(): NeonSql | null {
  const urls = listShardUrls();
  if (urls.length === 0) return null;
  return getOrCreateClient(urls[0]!);
}

/** Client for a specific shard index (modulo shard count). */
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

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function shardKey(scope_type: string, scope_value?: string | null): string {
  const t = (scope_type ?? "global").toLowerCase().trim() || "global";
  const v = (scope_value ?? "").toLowerCase().trim();
  if (t === "global" || !v) return t;
  return `${t}:${v}`;
}

export function shardIndexForKey(key: string, shardCount?: number): number {
  const n = shardCount ?? getShardCount();
  if (n <= 1) return 0;
  return hashString(key) % n;
}

export function shardIndexForScope(
  scope_type: string,
  scope_value?: string | null,
  shardCount?: number
): number {
  return shardIndexForKey(shardKey(scope_type, scope_value), shardCount);
}

export function getShardSql(scope_type: string, scope_value?: string | null): NeonSql | null {
  const idx = shardIndexForScope(scope_type, scope_value);
  return getSqlForShardIndex(idx);
}

export async function fanOutShards<T>(fn: (sql: NeonSql, shardIndex: number) => Promise<T[]>): Promise<T[]> {
  const urls = listShardUrls();
  if (urls.length <= 1) {
    const c = getSql();
    if (!c) return [];
    return fn(c, 0);
  }
  const results = await Promise.all(urls.map((u, i) => fn(getOrCreateClient(u), i)));
  return results.flat();
}

// ---------------------------------------------------------------------------
// Cache hook (Phase 3 placeholder)
// ---------------------------------------------------------------------------

export async function withCache<T>(_key: string, _ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
  return fn();
}

export function __clearClientCache(): void {
  clientCache.clear();
}
