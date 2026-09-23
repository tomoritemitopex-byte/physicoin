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
  // N+1 fix: cached vote weight + cohort pattern (5min TTL via cohort_pattern_updated_at)
  try { await c`ALTER TABLE physi_users ADD COLUMN IF NOT EXISTS vote_count_total INT NOT NULL DEFAULT 0`; } catch {}
  try { await c`ALTER TABLE physi_users ADD COLUMN IF NOT EXISTS vote_weight_cached NUMERIC(3,2) NOT NULL DEFAULT 1.00`; } catch {}
  try { await c`ALTER TABLE physi_users ADD COLUMN IF NOT EXISTS cohort_pattern_cached JSONB`; } catch {}
  try { await c`ALTER TABLE physi_users ADD COLUMN IF NOT EXISTS cohort_pattern_updated_at TIMESTAMPTZ`; } catch {}
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
  try { await c`ALTER TABLE physi_events ADD COLUMN IF NOT EXISTS prof_name TEXT`; } catch {}
  try { await c`CREATE INDEX IF NOT EXISTS physi_events_prof_idx ON physi_events (lower(prof_name))`; } catch {}
  try { await c`ALTER TABLE physi_events ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours'`; } catch {}
  try { await c`CREATE INDEX IF NOT EXISTS physi_events_expires_idx ON physi_events (expires_at) WHERE status='pending'`; } catch {}
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

// Scope Merge Protocol Functions (Satoshi's Peer Resolution)
export async function ensureScopeVotes(): Promise<void> {
  const c = getSql() ?? sql;
  if (!c) return;
  await c`
    CREATE TABLE IF NOT EXISTS physi_scope_votes (
      voter_id UUID REFERENCES physi_users(id) ON DELETE CASCADE,
      scope_a TEXT NOT NULL,
      scope_b TEXT NOT NULL,
      vote_value SMALLINT CHECK (vote_value IN (-1, 1)),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (voter_id, scope_a, scope_b)
    )`;
  await c`CREATE INDEX IF NOT EXISTS physi_scope_votes_voter_idx ON physi_scope_votes (voter_id)`;
  await c`CREATE INDEX IF NOT EXISTS physi_scope_votes_scope_idx ON physi_scope_votes (scope_a, scope_b)`;
  await c`CREATE INDEX IF NOT EXISTS physi_scope_votes_time_idx ON physi_scope_votes (created_at)`;
}

export async function ensureScopeResolution(): Promise<void> {
  const c = getSql() ?? sql;
  if (!c) return;
  await c`
    CREATE TABLE IF NOT EXISTS physi_scope_resolution (
      scope_a TEXT,
      scope_b TEXT,
      merged_into TEXT,
      resolved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolution TEXT CHECK (resolution IN ('merged', 'separate')),
      PRIMARY KEY (scope_a, scope_b)
    )`;
}

export async function ensureHallAliases(): Promise<void> {
  const c = getSql() ?? sql;
  if (!c) return;
  await c`
    CREATE TABLE IF NOT EXISTS physi_hall_aliases (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      alias TEXT NOT NULL,
      canonical TEXT NOT NULL,
      programme TEXT,
      level TEXT,
      subject TEXT,
      hall_group_key TEXT,
      vote_count INT NOT NULL DEFAULT 0,
      votes_yes INT NOT NULL DEFAULT 0,
      votes_no INT NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','resolved','rejected')),
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  await c`CREATE INDEX IF NOT EXISTS physi_hall_aliases_status_idx ON physi_hall_aliases (status)`;
  await c`CREATE INDEX IF NOT EXISTS physi_hall_aliases_alias_idx ON physi_hall_aliases (lower(alias))`;
  await c`CREATE INDEX IF NOT EXISTS physi_hall_aliases_canonical_idx ON physi_hall_aliases (lower(canonical))`;
  await c`CREATE INDEX IF NOT EXISTS physi_hall_aliases_group_idx ON physi_hall_aliases (hall_group_key)`;
  await c`CREATE UNIQUE INDEX IF NOT EXISTS physi_hall_aliases_pair_uidx ON physi_hall_aliases (lower(alias), lower(canonical), COALESCE(hall_group_key,''))`;
  // per-voter votes
  await c`
    CREATE TABLE IF NOT EXISTS physi_hall_alias_votes (
      alias_id UUID NOT NULL REFERENCES physi_hall_aliases(id) ON DELETE CASCADE,
      voter_id UUID NOT NULL REFERENCES physi_users(id) ON DELETE CASCADE,
      vote_value SMALLINT NOT NULL CHECK (vote_value IN (-1, 1)),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (alias_id, voter_id)
    )`;
  await c`CREATE INDEX IF NOT EXISTS physi_hall_alias_votes_voter_idx ON physi_hall_alias_votes (voter_id)`;
  // additive migration for existing table per spec columns if table existed differently
  try { await c`ALTER TABLE physi_hall_aliases ADD COLUMN IF NOT EXISTS alias TEXT`; } catch {}
  try { await c`ALTER TABLE physi_hall_aliases ADD COLUMN IF NOT EXISTS canonical TEXT`; } catch {}
  try { await c`ALTER TABLE physi_hall_aliases ADD COLUMN IF NOT EXISTS vote_count INT DEFAULT 0`; } catch {}
  try { await c`ALTER TABLE physi_hall_aliases ADD COLUMN IF NOT EXISTS votes_yes INT DEFAULT 0`; } catch {}
  try { await c`ALTER TABLE physi_hall_aliases ADD COLUMN IF NOT EXISTS votes_no INT DEFAULT 0`; } catch {}
  try { await c`ALTER TABLE physi_hall_aliases ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ`; } catch {}
  try { await c`ALTER TABLE physi_hall_aliases ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending'`; } catch {}
}

export async function ensureProfAliases(): Promise<void> {
  const c = getSql() ?? sql;
  if (!c) return;
  await c`
    CREATE TABLE IF NOT EXISTS physi_prof_aliases (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      alias TEXT NOT NULL,
      canonical TEXT NOT NULL,
      prof_group_key TEXT NOT NULL DEFAULT '',
      programme TEXT,
      level TEXT,
      vote_count INT NOT NULL DEFAULT 0,
      votes_yes INT NOT NULL DEFAULT 0,
      votes_no INT NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','resolved','rejected')),
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  await c`CREATE INDEX IF NOT EXISTS physi_prof_aliases_status_idx ON physi_prof_aliases (status)`;
  await c`CREATE INDEX IF NOT EXISTS physi_prof_aliases_alias_idx ON physi_prof_aliases (lower(alias))`;
  await c`CREATE INDEX IF NOT EXISTS physi_prof_aliases_canonical_idx ON physi_prof_aliases (lower(canonical))`;
  await c`CREATE INDEX IF NOT EXISTS physi_prof_aliases_group_idx ON physi_prof_aliases (prof_group_key)`;
  await c`CREATE UNIQUE INDEX IF NOT EXISTS physi_prof_aliases_pair_uidx ON physi_prof_aliases (lower(alias), lower(canonical), COALESCE(prof_group_key,''))`;
  await c`CREATE UNIQUE INDEX IF NOT EXISTS physi_prof_aliases_group_canonical_uidx ON physi_prof_aliases (prof_group_key, lower(canonical))`;
  // per-voter votes
  await c`
    CREATE TABLE IF NOT EXISTS physi_prof_alias_votes (
      alias_id UUID NOT NULL REFERENCES physi_prof_aliases(id) ON DELETE CASCADE,
      voter_id UUID NOT NULL REFERENCES physi_users(id) ON DELETE CASCADE,
      vote_value SMALLINT NOT NULL CHECK (vote_value IN (-1, 1)),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (alias_id, voter_id)
    )`;
  await c`CREATE INDEX IF NOT EXISTS physi_prof_alias_votes_voter_idx ON physi_prof_alias_votes (voter_id)`;
}

export async function ensureGhostWitness(): Promise<void> {
  const c = getSql() ?? sql;
  if (!c) return;
  await ensureUsers();
  // rep_ghost_sig column on users
  try { await c`ALTER TABLE physi_users ADD COLUMN IF NOT EXISTS rep_ghost_sig TEXT`; } catch {}
  try { await c`ALTER TABLE physi_users ADD COLUMN IF NOT EXISTS ghost_sig_updated_at TIMESTAMPTZ`; } catch {}
  await c`
    CREATE TABLE IF NOT EXISTS physi_ghost_chain (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES physi_users(id) ON DELETE CASCADE,
      prev_sig TEXT NOT NULL,
      new_sig TEXT NOT NULL,
      action TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  await c`CREATE INDEX IF NOT EXISTS physi_ghost_chain_user_idx ON physi_ghost_chain (user_id, created_at DESC)`;
  await c`CREATE INDEX IF NOT EXISTS physi_ghost_chain_new_sig_idx ON physi_ghost_chain (new_sig)`;
}

export async function ensureScopeMiningColumns(): Promise<void> {
  const c = getSql() ?? sql;
  if (!c) return;
  await ensureScopeVotes();
  try { await c`ALTER TABLE physi_scope_votes ADD COLUMN IF NOT EXISTS rep_earned NUMERIC(5,2) NOT NULL DEFAULT 0`; } catch {}
}

export async function ensureZkAuthority(): Promise<void> {
  const c = getSql() ?? sql;
  if (!c) return;
  await ensureEvents();
  try { await c`ALTER TABLE physi_events ADD COLUMN IF NOT EXISTS is_zk_attested BOOLEAN NOT NULL DEFAULT false`; } catch {}
  await c`CREATE INDEX IF NOT EXISTS physi_events_zk_idx ON physi_events (is_zk_attested)`;
}

export async function ensureSchools(): Promise<void> {
  const c = getSql() ?? sql;
  if (!c) return;
  await ensureUsers();
  await c`
    CREATE TABLE IF NOT EXISTS physi_schools (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      created_by UUID REFERENCES physi_users(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','rejected')),
      verified_by UUID REFERENCES physi_users(id) ON DELETE SET NULL,
      verified_at TIMESTAMPTZ,
      rejection_reason TEXT,
      event_count INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  await c`CREATE INDEX IF NOT EXISTS physi_schools_status_idx ON physi_schools (status)`;
  await c`CREATE INDEX IF NOT EXISTS physi_schools_name_idx ON physi_schools (lower(name))`;
  await c`CREATE INDEX IF NOT EXISTS physi_schools_created_idx ON physi_schools (created_at DESC)`;
  await c`CREATE INDEX IF NOT EXISTS physi_schools_event_count_idx ON physi_schools (event_count DESC)`;
}

export async function ensureSchoolDepartments(): Promise<void> {
  const c = getSql() ?? sql;
  if (!c) return;
  await ensureSchools();
  await c`
    CREATE TABLE IF NOT EXISTS physi_school_departments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      school_id UUID NOT NULL REFERENCES physi_schools(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      years INT NOT NULL DEFAULT 4,
      created_by UUID REFERENCES physi_users(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','rejected')),
      verified_by UUID REFERENCES physi_users(id) ON DELETE SET NULL,
      verified_at TIMESTAMPTZ,
      rejection_reason TEXT,
      event_count INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  await c`CREATE INDEX IF NOT EXISTS physi_school_depts_school_idx ON physi_school_departments (school_id)`;
  await c`CREATE INDEX IF NOT EXISTS physi_school_depts_name_idx ON physi_school_departments (lower(name))`;
  await c`CREATE INDEX IF NOT EXISTS physi_school_depts_status_idx ON physi_school_departments (status)`;
  await c`CREATE INDEX IF NOT EXISTS physi_school_depts_event_count_idx ON physi_school_departments (event_count DESC)`;
  await c`CREATE UNIQUE INDEX IF NOT EXISTS physi_school_depts_school_name_uidx ON physi_school_departments (school_id, lower(name))`;
}

export async function ensureSchoolDisputes(): Promise<void> {
  const c = getSql() ?? sql;
  if (!c) return;
  await ensureSchools();
  await c`
    CREATE TABLE IF NOT EXISTS physi_school_disputes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      school_id_a UUID REFERENCES physi_schools(id) ON DELETE CASCADE,
      school_id_b UUID REFERENCES physi_schools(id) ON DELETE CASCADE,
      dept_id_a UUID REFERENCES physi_school_departments(id) ON DELETE CASCADE,
      dept_id_b UUID REFERENCES physi_school_departments(id) ON DELETE CASCADE,
      dispute_type TEXT NOT NULL CHECK (dispute_type IN ('school_name','department_name','same_school')),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','resolved_a_wins','resolved_b_wins','expired','creator_decided')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at TIMESTAMPTZ,
      resolved_by UUID REFERENCES physi_users(id) ON DELETE SET NULL,
      resolution_notes TEXT
    )`;
  await c`CREATE INDEX IF NOT EXISTS physi_school_disputes_status_idx ON physi_school_disputes (status)`;
  await c`CREATE INDEX IF NOT EXISTS physi_school_disputes_created_idx ON physi_school_disputes (created_at DESC)`;
  await c`CREATE INDEX IF NOT EXISTS physi_school_disputes_school_a_idx ON physi_school_disputes (school_id_a)`;
  await c`CREATE INDEX IF NOT EXISTS physi_school_disputes_school_b_idx ON physi_school_disputes (school_id_b)`;
}

export async function ensureCoinsBurned(): Promise<void> {
  const c = getSql() ?? sql;
  if (!c) return;
  await ensureSchoolDisputes();
  await c`
    CREATE TABLE IF NOT EXISTS physi_coins_burned (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      dispute_id UUID REFERENCES physi_school_disputes(id) ON DELETE SET NULL,
      loser_school_id UUID REFERENCES physi_schools(id) ON DELETE SET NULL,
      loser_dept_id UUID REFERENCES physi_school_departments(id) ON DELETE SET NULL,
      amount_burned NUMERIC(14,2) NOT NULL,
      creator_fee NUMERIC(14,2) NOT NULL DEFAULT 0,
      winner_gets NUMERIC(14,2) NOT NULL DEFAULT 0,
      burned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      burned_by UUID REFERENCES physi_users(id) ON DELETE SET NULL
    )`;
  await c`CREATE INDEX IF NOT EXISTS physi_coins_burned_dispute_idx ON physi_coins_burned (dispute_id)`;
  await c`CREATE INDEX IF NOT EXISTS physi_coins_burned_school_idx ON physi_coins_burned (loser_school_id)`;
  await c`CREATE INDEX IF NOT EXISTS physi_coins_burned_created_idx ON physi_coins_burned (burned_at DESC)`;
}

export async function ensureSchoolEventCounts(): Promise<void> {
  const c = getSql() ?? sql;
  if (!c) return;
  await ensureSchools();
  await ensureSchoolDepartments();
  await c`
    CREATE TABLE IF NOT EXISTS physi_school_event_counts (
      school_id UUID PRIMARY KEY REFERENCES physi_schools(id) ON DELETE CASCADE,
      dept_id UUID REFERENCES physi_school_departments(id) ON DELETE CASCADE,
      event_count INT NOT NULL DEFAULT 0,
      last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
}

// ── Vine autopilot: school/dept aggregation + vote + auto-archive ──
export async function ensureSchoolVotes(): Promise<void> {
  const c = getSql() ?? sql;
  if (!c) return;
  await ensureSchools();
  await ensureSchoolDepartments();
  await c`
    CREATE TABLE IF NOT EXISTS physi_school_votes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      voter_id UUID REFERENCES physi_users(id) ON DELETE CASCADE,
      normalized TEXT NOT NULL,
      school_id UUID REFERENCES physi_schools(id) ON DELETE CASCADE,
      vote_value SMALLINT NOT NULL CHECK (vote_value IN (-1, 1)),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  await c`CREATE UNIQUE INDEX IF NOT EXISTS physi_school_votes_voter_norm_uidx ON physi_school_votes (voter_id, lower(normalized))`;
  await c`CREATE INDEX IF NOT EXISTS physi_school_votes_norm_idx ON physi_school_votes (lower(normalized))`;
  await c`CREATE INDEX IF NOT EXISTS physi_school_votes_school_idx ON physi_school_votes (school_id)`;
  await c`
    CREATE TABLE IF NOT EXISTS physi_dept_votes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      voter_id UUID REFERENCES physi_users(id) ON DELETE CASCADE,
      dept_id UUID REFERENCES physi_school_departments(id) ON DELETE CASCADE,
      normalized TEXT NOT NULL,
      school_id UUID REFERENCES physi_schools(id) ON DELETE CASCADE,
      vote_value SMALLINT NOT NULL CHECK (vote_value IN (-1, 1)),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  await c`CREATE UNIQUE INDEX IF NOT EXISTS physi_dept_votes_voter_norm_uidx ON physi_dept_votes (voter_id, lower(normalized), COALESCE(school_id::text,''))`;
  await c`CREATE INDEX IF NOT EXISTS physi_dept_votes_norm_idx ON physi_dept_votes (lower(normalized))`;
  await c`CREATE INDEX IF NOT EXISTS physi_dept_votes_dept_idx ON physi_dept_votes (dept_id)`;
}

export async function ensureSchoolArchiveColumns(): Promise<void> {
  const c = getSql() ?? sql;
  if (!c) return;
  await ensureSchools();
  await ensureSchoolDepartments();
  try { await c`ALTER TABLE physi_schools ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`; } catch {}
  try { await c`ALTER TABLE physi_schools ADD COLUMN IF NOT EXISTS last_event_at TIMESTAMPTZ`; } catch {}
  try { await c`ALTER TABLE physi_schools ADD COLUMN IF NOT EXISTS canonical_name TEXT`; } catch {}
  try { await c`ALTER TABLE physi_school_departments ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`; } catch {}
  try { await c`ALTER TABLE physi_school_departments ADD COLUMN IF NOT EXISTS last_event_at TIMESTAMPTZ`; } catch {}
  try { await c`ALTER TABLE physi_school_departments ADD COLUMN IF NOT EXISTS canonical_name TEXT`; } catch {}
  await c`
    CREATE TABLE IF NOT EXISTS physi_school_historical_map (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      school_id UUID REFERENCES physi_schools(id) ON DELETE SET NULL,
      dept_id UUID REFERENCES physi_school_departments(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('school','department')),
      archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reason TEXT NOT NULL DEFAULT 'extinct_90d',
      snapshot JSONB
    )`;
  await c`CREATE INDEX IF NOT EXISTS physi_hist_map_kind_idx ON physi_school_historical_map (kind)`;
  await c`CREATE INDEX IF NOT EXISTS physi_hist_map_archived_idx ON physi_school_historical_map (archived_at DESC)`;
}

// Auto-archive extinct departments (0 events for 90 days) — called lazily from adapters
export async function archiveExtinctDepartments(): Promise<{ archivedSchools: number; archivedDepts: number }> {
  const c = getSql() ?? sql;
  if (!c) return { archivedSchools: 0, archivedDepts: 0 };
  try { await ensureSchoolArchiveColumns(); } catch {}
  let archivedDepts = 0;
  let archivedSchools = 0;
  try {
    // Departments: 0 events for 90 days since creation or last_event_at
    const res = await c`
      UPDATE physi_school_departments
      SET archived_at = NOW(), updated_at = NOW()
      WHERE archived_at IS NULL
        AND event_count = 0
        AND COALESCE(last_event_at, created_at) < NOW() - INTERVAL '90 days'
      RETURNING id, name, school_id`;
    archivedDepts = Array.isArray(res) ? res.length : 0;
    for (const r of (res as any[])) {
      try {
        await c`INSERT INTO physi_school_historical_map (school_id, dept_id, name, kind, reason, snapshot)
                VALUES (${r.school_id}, ${r.id}, ${r.name}, 'department', 'extinct_90d', ${JSON.stringify(r)}::jsonb)`;
      } catch {}
    }
  } catch {}
  try {
    const res2 = await c`
      UPDATE physi_schools
      SET archived_at = NOW(), updated_at = NOW()
      WHERE archived_at IS NULL
        AND event_count = 0
        AND COALESCE(last_event_at, created_at) < NOW() - INTERVAL '90 days'
      RETURNING id, name`;
    archivedSchools = Array.isArray(res2) ? res2.length : 0;
    for (const r of (res2 as any[])) {
      try {
        await c`INSERT INTO physi_school_historical_map (school_id, name, kind, reason, snapshot)
                VALUES (${r.id}, ${r.name}, 'school', 'extinct_90d', ${JSON.stringify(r)}::jsonb)`;
      } catch {}
    }
  } catch {}
  return { archivedSchools, archivedDepts };
}

// ── Student intuitions: Find My People (squad locator), Bunk Radar, Notes Drop ──
export async function ensureSquadTables(): Promise<void> {
  const c = getSql() ?? sql;
  if (!c) return;
  await ensureUsers();
  await ensureGhostWitness();
  await c`
    CREATE TABLE IF NOT EXISTS physi_squad_pings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES physi_users(id) ON DELETE CASCADE,
      programme TEXT NOT NULL DEFAULT 'PHYS',
      level TEXT NOT NULL DEFAULT '100L',
      building_id TEXT NOT NULL DEFAULT 'phys',
      lat DOUBLE PRECISION,
      lng DOUBLE PRECISION,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '12 minutes'
    )`;
  await c`CREATE INDEX IF NOT EXISTS physi_squad_pings_prog_idx ON physi_squad_pings (programme, level)`;
  await c`CREATE INDEX IF NOT EXISTS physi_squad_pings_building_idx ON physi_squad_pings (building_id)`;
  await c`CREATE INDEX IF NOT EXISTS physi_squad_pings_expires_idx ON physi_squad_pings (expires_at)`;
  await c`CREATE INDEX IF NOT EXISTS physi_squad_pings_user_idx ON physi_squad_pings (user_id, created_at DESC)`;
  // one active ping per user (upsert will delete old)
  await c`
    CREATE TABLE IF NOT EXISTS physi_squad_waves (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      from_user UUID NOT NULL REFERENCES physi_users(id) ON DELETE CASCADE,
      to_user UUID NOT NULL REFERENCES physi_users(id) ON DELETE CASCADE,
      message TEXT NOT NULL DEFAULT '👋',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '5 minutes'
    )`;
  await c`CREATE INDEX IF NOT EXISTS physi_squad_waves_to_idx ON physi_squad_waves (to_user, expires_at DESC)`;
  await c`CREATE INDEX IF NOT EXISTS physi_squad_waves_from_idx ON physi_squad_waves (from_user)`;
}

export async function ensureBunkTables(): Promise<void> {
  const c = getSql() ?? sql;
  if (!c) return;
  await ensureUsers();
  await ensureEvents();
  await c`
    CREATE TABLE IF NOT EXISTS physi_bunk_reports (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id UUID NOT NULL REFERENCES physi_events(id) ON DELETE CASCADE,
      reporter_id UUID REFERENCES physi_users(id) ON DELETE SET NULL,
      vote TEXT NOT NULL DEFAULT 'no_show' CHECK (vote IN ('no_show','happening')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  await c`CREATE UNIQUE INDEX IF NOT EXISTS physi_bunk_reports_pair_uidx ON physi_bunk_reports (event_id, reporter_id) WHERE reporter_id IS NOT NULL`;
  await c`CREATE INDEX IF NOT EXISTS physi_bunk_reports_event_idx ON physi_bunk_reports (event_id, created_at DESC)`;
  await c`CREATE INDEX IF NOT EXISTS physi_bunk_reports_time_idx ON physi_bunk_reports (created_at DESC)`;
}

export async function ensureNotesTables(): Promise<void> {
  const c = getSql() ?? sql;
  if (!c) return;
  await ensureUsers();
  await ensureGhostWitness();
  await c`
    CREATE TABLE IF NOT EXISTS physi_notes_drops (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      uploader_id UUID REFERENCES physi_users(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      building_id TEXT NOT NULL DEFAULT 'phys',
      level TEXT NOT NULL DEFAULT '100L',
      lat DOUBLE PRECISION,
      lng DOUBLE PRECISION,
      ocr_text TEXT NOT NULL DEFAULT '',
      image_data TEXT NOT NULL DEFAULT '',
      preview_blur TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  await c`CREATE INDEX IF NOT EXISTS physi_notes_drops_building_idx ON physi_notes_drops (building_id)`;
  await c`CREATE INDEX IF NOT EXISTS physi_notes_drops_level_idx ON physi_notes_drops (level)`;
  await c`CREATE INDEX IF NOT EXISTS physi_notes_drops_created_idx ON physi_notes_drops (created_at DESC)`;
  // unlock tracking: who paid to unblur
  await c`
    CREATE TABLE IF NOT EXISTS physi_notes_unlocks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      note_id UUID NOT NULL REFERENCES physi_notes_drops(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES physi_users(id) ON DELETE CASCADE,
      cost NUMERIC(5,2) NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(note_id, user_id)
    )`;
  await c`CREATE INDEX IF NOT EXISTS physi_notes_unlocks_user_idx ON physi_notes_unlocks (user_id)`;
  await c`CREATE INDEX IF NOT EXISTS physi_notes_unlocks_note_idx ON physi_notes_unlocks (note_id)`;
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

export async function ensureSlotClaims(): Promise<void> {
  const c = getSql() ?? sql;
  if (!c) return;
  await ensureEvents();
  await c`
    CREATE TABLE IF NOT EXISTS physi_slot_claims (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      slot_key TEXT NOT NULL,
      event_id UUID REFERENCES physi_events(id) ON DELETE CASCADE,
      claimer_id UUID REFERENCES physi_users(id) ON DELETE SET NULL,
      venue TEXT NOT NULL,
      event_time TIME NOT NULL,
      title TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      vote_weight_yes NUMERIC(10,2) NOT NULL DEFAULT 0,
      vote_weight_no NUMERIC(10,2) NOT NULL DEFAULT 0
    )`;
  await c`CREATE INDEX IF NOT EXISTS physi_slot_claims_slot_idx ON physi_slot_claims (slot_key)`;
  await c`CREATE INDEX IF NOT EXISTS physi_slot_claims_event_idx ON physi_slot_claims (event_id)`;
  // Inverted-audit P0 (K-A7): dedupe key — mirrors schema.physi.sql
  await c`CREATE UNIQUE INDEX IF NOT EXISTS physi_slot_claims_slot_event_venue_uidx ON physi_slot_claims (slot_key, event_id, lower(venue))`;
  try { await c`ALTER TABLE physi_events ADD COLUMN IF NOT EXISTS slot_key TEXT`; } catch {}
  try { await c`CREATE INDEX IF NOT EXISTS physi_events_slot_idx ON physi_events (slot_key) WHERE status='pending'`; } catch {}
}

export async function ensureHeaders(): Promise<void> {
  const c = getSql() ?? sql;
  if (!c) return;
  await c`
    CREATE TABLE IF NOT EXISTS physi_headers (
      date DATE PRIMARY KEY,
      merkle_root TEXT NOT NULL,
      ghost_tip_root TEXT NOT NULL,
      prev_hash TEXT NOT NULL,
      hmac TEXT NOT NULL,
      count INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  await c`CREATE INDEX IF NOT EXISTS physi_headers_created_idx ON physi_headers (created_at DESC)`;
}

export async function ensureVoteBonds(): Promise<void> {
  const c = getSql() ?? sql;
  if (!c) return;
  await c`
    CREATE TABLE IF NOT EXISTS physi_vote_bonds (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      verifier_id UUID NOT NULL REFERENCES physi_users(id) ON DELETE CASCADE,
      event_id UUID NOT NULL REFERENCES physi_events(id) ON DELETE CASCADE,
      stake NUMERIC(5,2) NOT NULL DEFAULT 1.00,
      status TEXT NOT NULL CHECK (status IN ('held','released','burned')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(verifier_id, event_id)
    )`;
  await c`CREATE INDEX IF NOT EXISTS physi_vote_bonds_event_idx ON physi_vote_bonds (event_id)`;
  await c`CREATE INDEX IF NOT EXISTS physi_vote_bonds_verifier_idx ON physi_vote_bonds (verifier_id)`;
}

export async function ensureRevokedTokens(): Promise<void> {
  const c = getSql() ?? sql;
  if (!c) return;
  await c`
    CREATE TABLE IF NOT EXISTS physi_revoked_tokens (
      jti TEXT PRIMARY KEY,
      user_id UUID REFERENCES physi_users(id) ON DELETE SET NULL,
      revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL
    )`;
  await c`CREATE INDEX IF NOT EXISTS physi_revoked_tokens_expires_idx ON physi_revoked_tokens (expires_at)`;
}

export async function ensureAuthColumns(): Promise<void> {
  const c = getSql() ?? sql;
  if (!c) return;
  await ensureUsers();
  try { await c`ALTER TABLE physi_users ADD COLUMN IF NOT EXISTS password_hash TEXT`; } catch {}
  // Inverted-audit P0 (K-A2): ADD CONSTRAINT has no IF NOT EXISTS — guard via
  // pg_constraint so repeated runs never throw. (Neon serverless client has no
  // .unsafe(), so guard with a SELECT + plain ALTER instead of a DO block.)
  const hasUnsafe = typeof (c as any).unsafe === "function";
  try {
    const cap = await c`SELECT 1 FROM pg_constraint WHERE conname = 'physi_users_balance_cap' LIMIT 1` as any[];
    if (!cap.length) {
      if (hasUnsafe) await (c as any).unsafe(`ALTER TABLE physi_users ADD CONSTRAINT physi_users_balance_cap CHECK (mining_balance <= 10000)`);
      else await c`ALTER TABLE physi_users ADD CONSTRAINT physi_users_balance_cap CHECK (mining_balance <= 10000)`;
    }
  } catch {}
  try {
    const nonneg = await c`SELECT 1 FROM pg_constraint WHERE conname = 'physi_users_balance_nonneg' LIMIT 1` as any[];
    if (!nonneg.length) {
      if (hasUnsafe) await (c as any).unsafe(`ALTER TABLE physi_users ADD CONSTRAINT physi_users_balance_nonneg CHECK (mining_balance >= 0)`);
      else await c`ALTER TABLE physi_users ADD CONSTRAINT physi_users_balance_nonneg CHECK (mining_balance >= 0)`;
    }
  } catch {}
}

export async function ensureTruthRewards(): Promise<void> {
  const c = getSql() ?? sql;
  if (!c) return;
  await c`
    CREATE TABLE IF NOT EXISTS physi_truth_rewards (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES physi_users(id) ON DELETE CASCADE,
      event_id UUID REFERENCES physi_events(id) ON DELETE SET NULL,
      kind TEXT NOT NULL CHECK (kind IN ('truth_poster','truth_voter','faucet')),
      amount NUMERIC(14,2) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  await c`CREATE INDEX IF NOT EXISTS physi_truth_rewards_user_idx ON physi_truth_rewards (user_id, created_at DESC)`;
}

export async function ensureFaucetDrips(): Promise<void> {
  const c = getSql() ?? sql;
  if (!c) return;
  await c`
    CREATE TABLE IF NOT EXISTS physi_faucet_drips (
      user_id UUID NOT NULL REFERENCES physi_users(id) ON DELETE CASCADE,
      week TEXT NOT NULL,
      amount NUMERIC(14,2) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, week)
    )`;
}

/**
 * Inverted-audit P1 (K-E4): server-authoritative streak-rescue ledger.
 * Mirrors database/schema.physi.sql. 1 rescue / 14d / pair is a policy
 * constant enforced by query in POST /api/streak/rescue, not by constraint.
 */
export async function ensureStreakRescues(): Promise<void> {
  const c = getSql() ?? sql;
  if (!c) return;
  await c`
    CREATE TABLE IF NOT EXISTS physi_streak_rescues (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      rescuer_id UUID NOT NULL REFERENCES physi_users(id) ON DELETE CASCADE,
      rescued_id UUID NOT NULL REFERENCES physi_users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (rescuer_id <> rescued_id)
    )`;
  await c`CREATE INDEX IF NOT EXISTS physi_streak_rescues_pair_idx ON physi_streak_rescues (rescuer_id, rescued_id, created_at DESC)`;
  await c`CREATE INDEX IF NOT EXISTS physi_streak_rescues_rescued_idx ON physi_streak_rescues (rescued_id, created_at DESC)`;
}

/**
 * BEDROCK Phase 1: class rosters + Founding marks. Mirrors
 * database/schema.physi.sql. Runtime safety net only — build-time migrate
 * is primary; never call on hot paths.
 */
export async function ensureRosters(): Promise<void> {
  const c = getSql() ?? sql;
  if (!c) return;
  await c`
    CREATE TABLE IF NOT EXISTS physi_rosters (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      class_code TEXT NOT NULL,
      term TEXT NOT NULL DEFAULT '',
      invite_code TEXT NOT NULL UNIQUE,
      created_by UUID REFERENCES physi_users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  await c`
    CREATE TABLE IF NOT EXISTS physi_roster_members (
      roster_id UUID NOT NULL REFERENCES physi_rosters(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES physi_users(id) ON DELETE CASCADE,
      enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (roster_id, user_id)
    )`;
  await c`CREATE INDEX IF NOT EXISTS physi_roster_members_user_idx ON physi_roster_members (user_id)`;
  try { await c`ALTER TABLE physi_events ADD COLUMN IF NOT EXISTS roster_id UUID REFERENCES physi_rosters(id) ON DELETE SET NULL`; } catch {}
  try { await c`ALTER TABLE physi_users ADD COLUMN IF NOT EXISTS founding_mark NUMERIC(14,2)`; } catch {}
  try { await c`UPDATE physi_users SET founding_mark = mining_balance WHERE founding_mark IS NULL`; } catch {}
}

/**
 * DEPRECATED — DDL moved to build-time migration.
 * Runtime DDL is forbidden on hot path (Vercel Edge timeout / Neon DDL locks).
 * Run `node scripts/migrate.mjs` locally or at build.
 */let _tablesEnsured = true; // force no-op; DDL no longer runs per-request
export async function ensureAllTables(): Promise<void> {
  if (process.env.PHYSI_MIGRATE === "1") {
    console.warn("[db] ensureAllTables called with PHYSI_MIGRATE=1 — use scripts/migrate.mjs instead");
  }
  return;
}

// Compat aliases — old imports keep working
export const ensureUsersTable = ensureUsers;
export const ensureEventsTable = ensureEvents;
export const ensureVerificationsTable = ensureVerifications;
export const ensureMiningLogsTable = ensureMiningLogs;
export const ensureMiningTable = ensureMiningLogs;
export const ensureCanonicalLogTable = ensureCanonicalLog;
export const ensureEventHistoryTable = ensureEventHistory;
export const ensureScopeVotesTable = ensureScopeVotes;
export const ensureScopeResolutionTable = ensureScopeResolution;
export const ensureHallAliasesTable = ensureHallAliases;
export const ensureProfAliasesTable = ensureProfAliases;
export const ensureGhostWitnessTable = ensureGhostWitness;
export const ensureZkAuthorityTable = ensureZkAuthority;
export const ensureScopeMiningColumnsTable = ensureScopeMiningColumns;
export const ensureSquadTablesTable = ensureSquadTables;
export const ensureBunkTablesTable = ensureBunkTables;
export const ensureNotesTablesTable = ensureNotesTables;
export const ensureTables = ensureAllTables;
export const dbUnavailableResponse = dbNotConfigured;
