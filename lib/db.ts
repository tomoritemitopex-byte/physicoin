/**
 * lib/db.ts — Physicoin DB layer (Bitcoin-scale small core)
 *
 * ## Scaling path
 *
 * ```
 * Phase 0 (pilot, now)       Single Neon HTTP DB — one DATABASE_URL.  `sql` is a
 *                             fetch-based client; no TCP pool needed. Cold start
 *                             300-800ms after scale-to-zero — handled by retry in
 *                             ensureAllTables().
 * Phase 1 (growth)           Same code, pooled URL: set DATABASE_URL to
 *                             `*-pooler.*.neon.tech` or add PgBouncer. Adapter
 *                             unchanged; only env changes. See pooling notes below.
 * Phase 2 (multi-branch)     DB_PROVIDER=neon-multi → N Neon branches sharded by
 *                             shardKey(scope_type, scope_value). Call
 *                             getShardSql(scope_type, scope_value) for routed writes;
 *                             fanOutShards() for cross-shard reads. 0 app rewrite.
 * Phase 3 (cache layer)      Wrap hot reads with withCache(key, ttl, fn) from
 *                             ./db/framework — Redis/Upstash write-through. Adapter
 *                             unchanged; opt-in per query.
 * ```
 *
 * ## Connection pooling notes
 *
 * - Neon serverless driver is HTTP/fetch, not pg TCP → no `pg.Pool`. Each query is
 *   a fetch; `neon(url)` just creates a fetch wrapper (cached per URL in
 *   lib/db/framework.ts). Reusing that wrapper avoids re-parsing; Vercel will reuse
 *   the Lambda between invocations (keep-alive).
 * - For pooled TCP (high concurrency), use Neon's pooled endpoint:
 *   `DATABASE_URL=postgres://...@ep-xxx-pooler...neon.tech/neondb?sslmode=require`
 *   No code change — same `sql` tag works, but Neon routes via PgBouncer.
 * - If you later need real pooling (e.g. self-hosted Postgres), swap only
 *   lib/db/framework.ts: replace `neon()` with `new Pool()` and keep this file's
 *   exports stable. Callers never import the driver directly.
 *
 * ## Backward compat
 *
 * All previous exports are preserved (`sql`, `isDbConfigured`, `ensure*`, aliases).
 * New exports (`getSql`, `getShardSql`, `shardKey`, …) are additive.
 */

import {
  getSql as _getSql,
  getShardSql,
  shardKey,
  shardIndexForKey,
  shardIndexForScope,
  getShardCount,
  hashString,
  fanOutShards,
  withCache,
  getProvider,
  listShardUrls,
  getSqlForShardIndex,
} from "./db/framework";

// Re-export adapter & sharding helpers (additive, no breaking change)
export {
  getShardSql,
  shardKey,
  shardIndexForKey,
  shardIndexForScope,
  getShardCount,
  hashString,
  fanOutShards,
  withCache,
  getProvider,
  listShardUrls,
  getSqlForShardIndex,
};

/**
 * Adapter entry — reads DB_PROVIDER env (neon | neon-multi).
 * Use this instead of the bare `sql` const when you need fresh resolution
 * (e.g. tests that mutate env, or per-request shard routing).
 */
export function getSql(): any {
  return _getSql();
}

// ---------------------------------------------------------------------------
// Backward-compat `sql` singleton — evaluated once at import
// ---------------------------------------------------------------------------

/** @deprecated prefer getSql() for provider-aware resolution; kept for compat */
export const sql: any = _getSql();

if (!process.env.DATABASE_URL) console.warn("[db] DATABASE_URL unset — /api/* → 503");

export const isDbConfigured = (): boolean => !!process.env.DATABASE_URL && !!sql;

export function dbNotConfigured() {
  return {
    ok: false as const,
    code: "DB_NOT_CONFIGURED" as const,
    error: "DATABASE_URL not configured. Set in .env.local or Vercel env.",
    hint: "Vercel → Settings → Environment Variables → DATABASE_URL (all envs) → Redeploy",
  };
}

// pgcrypto: needs no superuser failure. Guard via pg_extension first.
async function ensurePgcrypto(): Promise<void> {
  const c = getSql() ?? sql;
  if (!c) return;
  try {
    const hit = await c`SELECT 1 AS ok FROM pg_extension WHERE extname='pgcrypto' LIMIT 1`;
    if (Array.isArray(hit) && hit.length > 0) return;
  } catch {}
  try {
    await c`CREATE EXTENSION IF NOT EXISTS pgcrypto`;
  } catch (e) {
    console.warn("[db] pgcrypto unavailable:", (e as Error).message);
  }
}

export async function ensureUsers(): Promise<void> {
  const c = getSql() ?? sql;
  if (!c) return;
  await ensurePgcrypto();
  await c`
    CREATE TABLE IF NOT EXISTS physi_users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      full_name TEXT NOT NULL,
      nickname TEXT NOT NULL,
      programme TEXT NOT NULL,
      level TEXT NOT NULL,
      statuses JSONB NOT NULL DEFAULT '[]'::jsonb,
      authority_base NUMERIC(3,2) NOT NULL DEFAULT 1.00,
      authority_final NUMERIC(3,2) NOT NULL DEFAULT 1.00,
      mining_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  await c`CREATE UNIQUE INDEX IF NOT EXISTS physi_users_nick_uidx ON physi_users (lower(nickname))`;
}

export async function ensureEvents(): Promise<void> {
  const c = getSql() ?? sql;
  if (!c) return;
  await ensureUsers();
  await c`
    CREATE TABLE IF NOT EXISTS physi_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title TEXT NOT NULL,
      venue TEXT NOT NULL,
      event_date DATE NOT NULL,
      event_time TIME NOT NULL,
      scope_type TEXT NOT NULL,
      scope_value TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      authority_points NUMERIC(10,2) NOT NULL DEFAULT 0,
      required_points NUMERIC(10,2) NOT NULL DEFAULT 0,
      created_by UUID REFERENCES physi_users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  await c`CREATE INDEX IF NOT EXISTS physi_events_dt_idx ON physi_events (event_date DESC, event_time DESC)`;
  await c`CREATE INDEX IF NOT EXISTS physi_events_status_idx2 ON physi_events (status)`;
  await c`CREATE UNIQUE INDEX IF NOT EXISTS physi_events_tvd_uidx ON physi_events (lower(title), lower(venue), event_date)`;
}

export async function ensureVerifications(): Promise<void> {
  const c = getSql() ?? sql;
  if (!c) return;
  await c`
    CREATE TABLE IF NOT EXISTS physi_verifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      verifier_id UUID NOT NULL REFERENCES physi_users(id) ON DELETE CASCADE,
      event_id UUID NOT NULL REFERENCES physi_events(id) ON DELETE CASCADE,
      vote TEXT NOT NULL CHECK (vote IN ('YES','NO','CANCEL')),
      authority_weight NUMERIC(3,2) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  await c`CREATE UNIQUE INDEX IF NOT EXISTS physi_verifs_pair_uidx ON physi_verifications (verifier_id, event_id)`;
  await c`CREATE INDEX IF NOT EXISTS physi_verifs_event_idx2 ON physi_verifications (event_id)`;
  await c`CREATE INDEX IF NOT EXISTS physi_verifs_verifier_idx2 ON physi_verifications (verifier_id)`;
}

export async function ensureMiningLogs(): Promise<void> {
  const c = getSql() ?? sql;
  if (!c) return;
  await ensureUsers();
  await c`
    CREATE TABLE IF NOT EXISTS physi_mining_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES physi_users(id) ON DELETE CASCADE,
      base_reward NUMERIC(14,2) NOT NULL,
      authority_multiplier NUMERIC(3,2) NOT NULL,
      earned_amount NUMERIC(14,2) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  await c`CREATE INDEX IF NOT EXISTS physi_mining_user_ts_idx ON physi_mining_logs (user_id, created_at DESC)`;
}

export async function ensureCanonicalLog(): Promise<void> {
  const c = getSql() ?? sql;
  if (!c) return;
  await c`
    CREATE TABLE IF NOT EXISTS physi_canonical_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id UUID NOT NULL REFERENCES physi_events(id) ON DELETE CASCADE,
      promoted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      yes_weight NUMERIC(10,2) NOT NULL,
      total_weight NUMERIC(10,2) NOT NULL,
      yes_ratio NUMERIC(5,3) NOT NULL,
      promoted_by UUID REFERENCES physi_users(id) ON DELETE SET NULL
    )`;
  await c`CREATE INDEX IF NOT EXISTS physi_canonical_event_idx2 ON physi_canonical_log (event_id)`;
}

/**
 * Idempotent bootstrap — all DDL uses IF NOT EXISTS / IF NOT EXISTS indexes,
 * so concurrent cold starts and retries are safe. Safe to call on every request
 * (cheap when tables exist: each CREATE is a catalog lookup). For high-traffic
 * phases, gate with withCache("ddl:ensured", 300, ensureAllTables) or a startup flag.
 *
 * Parallel leaves, ordered root; single retry for Neon cold start (500ms wake).
 */
export async function ensureAllTables(): Promise<void> {
  const c = getSql() ?? sql;
  if (!c) return;
  const run = async () => {
    await ensureUsers();
    await ensureEvents();
    await Promise.all([ensureVerifications(), ensureMiningLogs(), ensureCanonicalLog()]);
  };
  try {
    await run();
  } catch (e) {
    console.warn("[db] cold-start retry:", (e as Error).message);
    await new Promise((r) => setTimeout(r, 350));
    await run();
  }
}

// Compat aliases — old imports keep working
export const ensureUsersTable = ensureUsers;
export const ensureEventsTable = ensureEvents;
export const ensureVerificationsTable = ensureVerifications;
export const ensureMiningLogsTable = ensureMiningLogs;
export const ensureMiningTable = ensureMiningLogs;
export const ensureCanonicalLogTable = ensureCanonicalLog;
export const ensureTables = ensureAllTables;
export const dbUnavailableResponse = dbNotConfigured;
