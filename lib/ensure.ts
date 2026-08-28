import { sql } from '@/lib/db';

/**
 * Centralized DDL — single source of truth for PHYSI schema.
 * All CREATEs are IF NOT EXISTS so calls are idempotent and safe
 * to run at the start of every API handler (serverless-friendly).
 * Guards on `!sql` so health / mock paths work without DATABASE_URL.
 */

export async function ensureUsersTable(): Promise<void> {
  if (!sql) return;
  await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto;`;
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
    );
  `;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS physi_users_nickname_lower_uidx ON physi_users (lower(nickname));`;
}

export async function ensureEventsTable(): Promise<void> {
  if (!sql) return;
  await ensureUsersTable();
  await sql`
    CREATE TABLE IF NOT EXISTS physi_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title TEXT NOT NULL,
      venue TEXT NOT NULL,
      event_date DATE NOT NULL,
      event_time TIME NOT NULL,
      scope_type TEXT NOT NULL,
      scope_value TEXT,
      status TEXT NOT NULL DEFAULT 'personal',
      authority_points NUMERIC(10,2) NOT NULL DEFAULT 0,
      required_points NUMERIC(10,2) NOT NULL DEFAULT 0,
      created_by UUID REFERENCES physi_users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS physi_events_date_time_idx ON physi_events (event_date DESC, event_time DESC);`;
  await sql`CREATE INDEX IF NOT EXISTS physi_events_status_idx ON physi_events (status);`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS physi_events_title_venue_date_uidx ON physi_events (lower(title), lower(venue), event_date);`;
}

export async function ensureCanonicalLogTable(): Promise<void> {
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
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS physi_canonical_log_event_idx ON physi_canonical_log (event_id);`;
}

export async function ensureMiningLogsTable(): Promise<void> {
  if (!sql) return;
  await ensureUsersTable();
  await sql`
    CREATE TABLE IF NOT EXISTS physi_mining_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES physi_users(id) ON DELETE CASCADE,
      base_reward NUMERIC(14,2) NOT NULL,
      authority_multiplier NUMERIC(3,2) NOT NULL,
      earned_amount NUMERIC(14,2) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS physi_mining_logs_user_created_idx ON physi_mining_logs (user_id, created_at DESC);`;
}

export async function ensureVerificationsTable(): Promise<void> {
  if (!sql) return;
  await sql`
    CREATE TABLE IF NOT EXISTS physi_verifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      verifier_id UUID NOT NULL REFERENCES physi_users(id) ON DELETE CASCADE,
      event_id UUID NOT NULL REFERENCES physi_events(id) ON DELETE CASCADE,
      vote TEXT NOT NULL CHECK (vote IN ('YES','NO','CANCEL')),
      authority_weight NUMERIC(3,2) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS physi_verifications_verifier_event_uidx ON physi_verifications (verifier_id, event_id);`;
  await sql`CREATE INDEX IF NOT EXISTS physi_verifications_event_idx ON physi_verifications (event_id);`;
  await sql`CREATE INDEX IF NOT EXISTS physi_verifications_verifier_idx ON physi_verifications (verifier_id);`;
}

/**
 * Ensure every PHYSI table/index exists. Use for stats / admin routes
 * that touch all tables. For isolated routes prefer the narrow helper
 * above to minimize cold-start DDL.
 */
export async function ensureAllTables(): Promise<void> {
  if (!sql) return;
  await ensureUsersTable();
  await ensureEventsTable();
  await ensureVerificationsTable();
  await ensureMiningLogsTable();
  await ensureCanonicalLogTable();
}

// Back-compat aliases — existing routes called these names
export const ensureMiningTable = ensureMiningLogsTable;
export const ensureTables = ensureAllTables;
