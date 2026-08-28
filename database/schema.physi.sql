-- PHYSI isolated tables — shared Neon DB, zero collision with legacy tables
-- All IF NOT EXISTS, single source; runtime DDL lives in lib/ensure.ts
CREATE EXTENSION IF NOT EXISTS pgcrypto;

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
CREATE UNIQUE INDEX IF NOT EXISTS physi_users_nickname_lower_uidx ON physi_users (lower(nickname));

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
CREATE INDEX IF NOT EXISTS physi_events_date_time_idx ON physi_events (event_date DESC, event_time DESC);
CREATE INDEX IF NOT EXISTS physi_events_status_idx ON physi_events (status);
CREATE UNIQUE INDEX IF NOT EXISTS physi_events_title_venue_date_uidx ON physi_events (lower(title), lower(venue), event_date);

CREATE TABLE IF NOT EXISTS physi_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  verifier_id UUID NOT NULL REFERENCES physi_users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES physi_events(id) ON DELETE CASCADE,
  vote TEXT NOT NULL CHECK (vote IN ('YES','NO','CANCEL')),
  authority_weight NUMERIC(3,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS physi_verifications_verifier_event_uidx ON physi_verifications (verifier_id, event_id);
CREATE INDEX IF NOT EXISTS physi_verifications_event_idx ON physi_verifications (event_id);
CREATE INDEX IF NOT EXISTS physi_verifications_verifier_idx ON physi_verifications (verifier_id);

CREATE TABLE IF NOT EXISTS physi_mining_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES physi_users(id) ON DELETE CASCADE,
  base_reward NUMERIC(14,2) NOT NULL,
  authority_multiplier NUMERIC(3,2) NOT NULL,
  earned_amount NUMERIC(14,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS physi_mining_logs_user_created_idx ON physi_mining_logs (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS physi_canonical_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES physi_events(id) ON DELETE CASCADE,
  promoted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  yes_weight NUMERIC(10,2) NOT NULL,
  total_weight NUMERIC(10,2) NOT NULL,
  yes_ratio NUMERIC(5,3) NOT NULL,
  promoted_by UUID REFERENCES physi_users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS physi_canonical_log_event_idx ON physi_canonical_log (event_id);
