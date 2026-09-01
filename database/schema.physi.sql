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
  status TEXT NOT NULL DEFAULT 'pending',
  authority_points NUMERIC(10,2) NOT NULL DEFAULT 0,
  required_points NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_by UUID REFERENCES physi_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- mempool/RBF: slot expiry (24h) + severity + prev diff + prof
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
  severity TEXT NOT NULL DEFAULT 'move' CHECK (severity IN ('move','shift','cancelled')),
  prev_venue TEXT,
  prev_event_time TIME,
  prev_event_date DATE,
  prof_name TEXT,
  is_zk_attested BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS physi_events_date_time_idx ON physi_events (event_date DESC, event_time DESC);
CREATE INDEX IF NOT EXISTS physi_events_status_idx ON physi_events (status);
CREATE UNIQUE INDEX IF NOT EXISTS physi_events_title_venue_date_uidx ON physi_events (lower(title), lower(venue), event_date);
CREATE INDEX IF NOT EXISTS physi_events_expires_idx ON physi_events (expires_at) WHERE status='pending';
CREATE INDEX IF NOT EXISTS physi_events_prof_idx ON physi_events (lower(prof_name));
CREATE INDEX IF NOT EXISTS physi_events_zk_idx ON physi_events (is_zk_attested);

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

-- Scope Merge Protocol Tables (Satoshi's Peer Resolution)
CREATE TABLE IF NOT EXISTS physi_scope_votes (
  voter_id UUID REFERENCES physi_users(id) ON DELETE CASCADE,
  scope_a TEXT NOT NULL,
  scope_b TEXT NOT NULL,
  vote_value SMALLINT CHECK (vote_value IN (-1, 1)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (voter_id, scope_a, scope_b)
);

CREATE TABLE IF NOT EXISTS physi_scope_resolution (
  scope_a TEXT,
  scope_b TEXT,
  merged_into TEXT,
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolution TEXT CHECK (resolution IN ('merged', 'separate')),
  PRIMARY KEY (scope_a, scope_b)
);

CREATE INDEX IF NOT EXISTS physi_scope_votes_voter_idx ON physi_scope_votes (voter_id);
CREATE INDEX IF NOT EXISTS physi_scope_votes_scope_idx ON physi_scope_votes (scope_a, scope_b);
CREATE INDEX IF NOT EXISTS physi_scope_votes_time_idx ON physi_scope_votes (created_at);

-- Ghost Witness Protocol — SHA256 signature chain for reputation
ALTER TABLE physi_users ADD COLUMN IF NOT EXISTS rep_ghost_sig TEXT;
ALTER TABLE physi_users ADD COLUMN IF NOT EXISTS ghost_sig_updated_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS physi_ghost_chain (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES physi_users(id) ON DELETE CASCADE,
  prev_sig TEXT NOT NULL,
  new_sig TEXT NOT NULL,
  action TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS physi_ghost_chain_user_idx ON physi_ghost_chain (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS physi_ghost_chain_new_sig_idx ON physi_ghost_chain (new_sig);

-- Scope Value Mining — Rep rewards for scope voting
ALTER TABLE physi_scope_votes ADD COLUMN IF NOT EXISTS rep_earned NUMERIC(5,2) NOT NULL DEFAULT 0;

-- ZK-Proof Authority — Privacy-preserving credentials
ALTER TABLE physi_events ADD COLUMN IF NOT EXISTS is_zk_attested BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS physi_events_zk_idx ON physi_events (is_zk_attested);

-- Hall Deduper — peer voting on canonical hall name
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
);
CREATE INDEX IF NOT EXISTS physi_hall_aliases_status_idx ON physi_hall_aliases (status);
CREATE INDEX IF NOT EXISTS physi_hall_aliases_alias_idx ON physi_hall_aliases (lower(alias));
CREATE INDEX IF NOT EXISTS physi_hall_aliases_canonical_idx ON physi_hall_aliases (lower(canonical));
CREATE INDEX IF NOT EXISTS physi_hall_aliases_group_idx ON physi_hall_aliases (hall_group_key);
CREATE UNIQUE INDEX IF NOT EXISTS physi_hall_aliases_pair_uidx ON physi_hall_aliases (lower(alias), lower(canonical), COALESCE(hall_group_key,''));
CREATE TABLE IF NOT EXISTS physi_hall_alias_votes (
  alias_id UUID NOT NULL REFERENCES physi_hall_aliases(id) ON DELETE CASCADE,
  voter_id UUID NOT NULL REFERENCES physi_users(id) ON DELETE CASCADE,
  vote_value SMALLINT NOT NULL CHECK (vote_value IN (-1, 1)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (alias_id, voter_id)
);
CREATE INDEX IF NOT EXISTS physi_hall_alias_votes_voter_idx ON physi_hall_alias_votes (voter_id);

-- Prof Deduper — peer voting on canonical prof name (missing from original schema)
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
);
CREATE INDEX IF NOT EXISTS physi_prof_aliases_status_idx ON physi_prof_aliases (status);
CREATE INDEX IF NOT EXISTS physi_prof_aliases_alias_idx ON physi_prof_aliases (lower(alias));
CREATE INDEX IF NOT EXISTS physi_prof_aliases_canonical_idx ON physi_prof_aliases (lower(canonical));
CREATE INDEX IF NOT EXISTS physi_prof_aliases_group_idx ON physi_prof_aliases (prof_group_key);
CREATE UNIQUE INDEX IF NOT EXISTS physi_prof_aliases_pair_uidx ON physi_prof_aliases (lower(alias), lower(canonical), COALESCE(prof_group_key,''));
CREATE UNIQUE INDEX IF NOT EXISTS physi_prof_aliases_group_canonical_uidx ON physi_prof_aliases (prof_group_key, lower(canonical));
CREATE TABLE IF NOT EXISTS physi_prof_alias_votes (
  alias_id UUID NOT NULL REFERENCES physi_prof_aliases(id) ON DELETE CASCADE,
  voter_id UUID NOT NULL REFERENCES physi_users(id) ON DELETE CASCADE,
  vote_value SMALLINT NOT NULL CHECK (vote_value IN (-1, 1)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (alias_id, voter_id)
);
CREATE INDEX IF NOT EXISTS physi_prof_alias_votes_voter_idx ON physi_prof_alias_votes (voter_id);

-- N+1 query bomb fix: cached vote weight + cohort pattern
ALTER TABLE physi_users ADD COLUMN IF NOT EXISTS vote_count_total INT NOT NULL DEFAULT 0;
ALTER TABLE physi_users ADD COLUMN IF NOT EXISTS vote_weight_cached NUMERIC(3,2) NOT NULL DEFAULT 1.00;
ALTER TABLE physi_users ADD COLUMN IF NOT EXISTS cohort_pattern_cached JSONB;
ALTER TABLE physi_users ADD COLUMN IF NOT EXISTS cohort_pattern_updated_at TIMESTAMPTZ;

-- Mempool expiry index already added above (physi_events_expires_idx)
-- Status default is 'pending' (canonical) — 'personal' was legacy drift, now unified.

-- Existing verifications extra columns (ensure idempotent)
ALTER TABLE physi_verifications ADD COLUMN IF NOT EXISTS is_witness BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE physi_verifications ADD COLUMN IF NOT EXISTS squad_boost BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE physi_verifications ADD COLUMN IF NOT EXISTS award NUMERIC(3,2) NOT NULL DEFAULT 0.3;


