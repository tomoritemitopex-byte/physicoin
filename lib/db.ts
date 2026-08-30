/**
 * lib/db.ts — Physicoin DB layer (env-light, modular)
 *
 * ## Scaling path
 *
 * ```
 * Phase 0 (pilot, now)       Single Postgres via DATABASE_URL — provider
 *                             auto-detected via adapter registry (neon /
 *                             supabase / vercel / postgres). Just swap the URL.
 * Phase 1 (growth)           Same code, pooled URL — no changes.
 * Phase 2 (sharded)          DATABASE_URLS=postgres://...,postgres://... — comma-
 *                             separated. Shard via getShardSql(scope) / fanOutShards.
 * Phase 3 (cache layer)      withCache(key, ttl, fn) — Redis/Upstash, opt-in.
 * ```
 *
 * Env: DATABASE_URL (single) or DATABASE_URLS (comma-separated) — no DB_PROVIDER enum.
 * Provider is plug-in: see lib/db/framework.ts DbAdapter registry.
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
  detectProvider,
  getAdapterForUrl,
  listAdapters,
  registerAdapter,
  listShardUrls,
  getSqlForShardIndex,
  getPrimaryUrl,
} from "./db/framework";
import type { DbAdapter, DbProvider, NeonSql } from "./db/framework";

// Re-export adapter & sharding helpers (additive, modular)
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
  detectProvider,
  getAdapterForUrl,
  listAdapters,
  registerAdapter,
  listShardUrls,
  getSqlForShardIndex,
  getPrimaryUrl,
};
export type { DbAdapter, DbProvider, NeonSql };

/** Adapter entry — reads DATABASE_URL / DATABASE_URLS. */
export function getSql(): any {
  return _getSql();
}

// ---------------------------------------------------------------------------
// Backward-compat `sql` singleton — evaluated once at import
// ---------------------------------------------------------------------------

/** @deprecated prefer getSql() for fresh resolution; kept for compat */
export const sql: any = _getSql();

const hasDbEnv = () => !!(process.env.DATABASE_URL || process.env.DATABASE_URLS);
if (!hasDbEnv()) console.warn("[db] DATABASE_URL/DATABASE_URLS unset — /api/* → 503");

export const isDbConfigured = (): boolean => hasDbEnv() && !!sql;

export function dbNotConfigured() {
  return {
    ok: false as const,
    code: "DB_NOT_CONFIGURED" as const,
    error: "DATABASE_URL not configured. Set in .env.local or Vercel env.",
    hint: "Vercel → Settings → Environment Variables → DATABASE_URL (all envs) → Redeploy. For sharding use DATABASE_URLS (comma-separated).",
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
      severity TEXT NOT NULL DEFAULT 'move' CHECK (severity IN ('move','shift','cancelled')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  // additive columns for existing DBs
  try { await c`ALTER TABLE physi_events ADD COLUMN IF NOT EXISTS severity TEXT NOT NULL DEFAULT 'move' CHECK (severity IN ('move','shift','cancelled'))`; } catch {}
  try { await c`ALTER TABLE physi_events ADD COLUMN IF NOT EXISTS prev_venue TEXT`; } catch {}
  try { await c`ALTER TABLE physi_events ADD COLUMN IF NOT EXISTS prev_event_time TIME`; } catch {}
  try { await c`ALTER TABLE physi_events ADD COLUMN IF NOT EXISTS prev_event_date DATE`; } catch {}
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
  // additive columns for proof receipts (witness/squad/presence)
  try { await c`ALTER TABLE physi_verifications ADD COLUMN IF NOT EXISTS is_witness BOOLEAN NOT NULL DEFAULT false`; } catch {}
  try { await c`ALTER TABLE physi_verifications ADD COLUMN IF NOT EXISTS squad_boost BOOLEAN NOT NULL DEFAULT false`; } catch {}
  try { await c`ALTER TABLE physi_verifications ADD COLUMN IF NOT EXISTS award NUMERIC(3,2) NOT NULL DEFAULT 0.3`; } catch {}
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

export async function ensureEventHistory(): Promise<void> {
  const c = getSql() ?? sql;
  if (!c) return;
  await ensureEvents();
  await c`
    CREATE TABLE IF NOT EXISTS physi_event_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id UUID NOT NULL REFERENCES physi_events(id) ON DELETE CASCADE,
      prev_venue TEXT,
      prev_event_date DATE,
      prev_event_time TIME,
      new_venue TEXT NOT NULL,
      new_event_date DATE NOT NULL,
      new_event_time TIME NOT NULL,
      changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      changed_by UUID REFERENCES physi_users(id) ON DELETE SET NULL
    )`;
  await c`CREATE INDEX IF NOT EXISTS physi_event_hist_event_idx ON physi_event_history (event_id, changed_at DESC)`;
}

/**
 * Idempotent bootstrap — safe to call on every request.
 * Parallel leaves, ordered root; single retry for cold start (500ms wake).
 */
export async function ensureAllTables(): Promise<void> {
  const c = getSql() ?? sql;
  if (!c) return;
  const run = async () => {
    await ensureUsers();
    await ensureEvents();
    await Promise.all([ensureVerifications(), ensureMiningLogs(), ensureCanonicalLog(), ensureEventHistory()]);
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
export const ensureEventHistoryTable = ensureEventHistory;
export const ensureTables = ensureAllTables;
export const dbUnavailableResponse = dbNotConfigured;
