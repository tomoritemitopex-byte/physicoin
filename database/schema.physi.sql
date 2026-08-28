-- PHYSI isolated tables (shared Neon DB - does not touch existing users/lessons tables)
-- Run against: postgresql://neondb_owner:***@ep-fancy-hall-al7yadmg.c-3.eu-central-1.aws.neon.tech/neondb
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

CREATE TABLE IF NOT EXISTS physi_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  verifier_id UUID NOT NULL REFERENCES physi_users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES physi_events(id) ON DELETE CASCADE,
  vote TEXT NOT NULL CHECK (vote IN ('YES', 'NO', 'CANCEL')),
  authority_weight NUMERIC(3,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS physi_mining_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES physi_users(id) ON DELETE CASCADE,
  base_reward NUMERIC(14,2) NOT NULL,
  authority_multiplier NUMERIC(3,2) NOT NULL,
  earned_amount NUMERIC(14,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
