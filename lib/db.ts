import { neon } from "@neondatabase/serverless";

// Neon HTTP driver — no pool, no TCP, one fetch per query.
// Cold start ~300-800ms after scale-to-zero; driver auto-handles fetch.

const connStr = process.env.DATABASE_URL ?? "";

if (!connStr) console.warn("[db] DATABASE_URL unset — /api/* → 503");

export const sql = connStr ? neon(connStr) : null;

export const isDbConfigured = (): boolean => !!connStr && !!sql;

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
  if (!sql) return;
  try {
    const hit = await sql`SELECT 1 AS ok FROM pg_extension WHERE extname='pgcrypto' LIMIT 1`;
    if (Array.isArray(hit) && hit.length > 0) return;
  } catch {}
  try {
    await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`;
  } catch (e) {
    console.warn("[db] pgcrypto unavailable:", (e as Error).message);
  }
}

export async function ensureUsers(): Promise<void> {
  if (!sql) return;
  await ensurePgcrypto();
  await sql`
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
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS physi_users_nick_uidx ON physi_users (lower(nickname))`;
}

export async function ensureEvents(): Promise<void> {
  if (!sql) return;
  await ensureUsers();
  await sql`
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
  await sql`CREATE INDEX IF NOT EXISTS physi_events_dt_idx ON physi_events (event_date DESC, event_time DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS physi_events_status_idx2 ON physi_events (status)`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS physi_events_tvd_uidx ON physi_events (lower(title), lower(venue), event_date)`;
}

export async function ensureVerifications(): Promise<void> {
  if (!sql) return;
  await sql`
    CREATE TABLE IF NOT EXISTS physi_verifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      verifier_id UUID NOT NULL REFERENCES physi_users(id) ON DELETE CASCADE,
      event_id UUID NOT NULL REFERENCES physi_events(id) ON DELETE CASCADE,
      vote TEXT NOT NULL CHECK (vote IN ('YES','NO','CANCEL')),
      authority_weight NUMERIC(3,2) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS physi_verifs_pair_uidx ON physi_verifications (verifier_id, event_id)`;
  await sql`CREATE INDEX IF NOT EXISTS physi_verifs_event_idx2 ON physi_verifications (event_id)`;
  await sql`CREATE INDEX IF NOT EXISTS physi_verifs_verifier_idx2 ON physi_verifications (verifier_id)`;
}

export async function ensureMiningLogs(): Promise<void> {
  if (!sql) return;
  await ensureUsers();
  await sql`
    CREATE TABLE IF NOT EXISTS physi_mining_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES physi_users(id) ON DELETE CASCADE,
      base_reward NUMERIC(14,2) NOT NULL,
      authority_multiplier NUMERIC(3,2) NOT NULL,
      earned_amount NUMERIC(14,2) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  await sql`CREATE INDEX IF NOT EXISTS physi_mining_user_ts_idx ON physi_mining_logs (user_id, created_at DESC)`;
}

export async function ensureCanonicalLog(): Promise<void> {
  if (!sql) return;
  await sql`
    CREATE TABLE IF NOT EXISTS physi_canonical_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id UUID NOT NULL REFERENCES physi_events(id) ON DELETE CASCADE,
      promoted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      yes_weight NUMERIC(10,2) NOT NULL,
      total_weight NUMERIC(10,2) NOT NULL,
      yes_ratio NUMERIC(5,3) NOT NULL,
      promoted_by UUID REFERENCES physi_users(id) ON DELETE SET NULL
    )`;
  await sql`CREATE INDEX IF NOT EXISTS physi_canonical_event_idx2 ON physi_canonical_log (event_id)`;
}

// Parallel leaves, ordered root; single retry for Neon cold start (500ms wake).
export async function ensureAllTables(): Promise<void> {
  if (!sql) return;
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
