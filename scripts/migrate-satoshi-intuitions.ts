// scripts/migrate-satoshi-intuitions.ts — idempotent migration for 3 intuitions
import { getSql } from "../lib/db/framework";

async function run() {
  const sql = getSql();
  if (!sql) { console.error("DATABASE_URL not configured"); process.exit(1); }
  console.log("[migrate] Starting Satoshi 3 intuitions migration...");

  // Ghost Witness
  try {
    await sql`ALTER TABLE physi_users ADD COLUMN IF NOT EXISTS rep_ghost_sig TEXT`;
    await sql`ALTER TABLE physi_users ADD COLUMN IF NOT EXISTS ghost_sig_updated_at TIMESTAMPTZ`;
    await sql`CREATE TABLE IF NOT EXISTS physi_ghost_chain (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES physi_users(id) ON DELETE CASCADE, prev_sig TEXT NOT NULL, new_sig TEXT NOT NULL, action TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
    await sql`CREATE INDEX IF NOT EXISTS physi_ghost_chain_user_idx ON physi_ghost_chain (user_id, created_at DESC)`;
    console.log("[migrate] Ghost Witness OK");
  } catch (e) { console.error("[migrate] Ghost error", (e as Error).message); }

  // Scope Mining
  try {
    await sql`ALTER TABLE physi_scope_votes ADD COLUMN IF NOT EXISTS rep_earned NUMERIC(5,2) NOT NULL DEFAULT 0`;
    console.log("[migrate] Scope Mining OK");
  } catch (e) { console.error("[migrate] Mining error", (e as Error).message); }

  // ZK
  try {
    await sql`ALTER TABLE physi_events ADD COLUMN IF NOT EXISTS is_zk_attested BOOLEAN NOT NULL DEFAULT false`;
    await sql`CREATE INDEX IF NOT EXISTS physi_events_zk_idx ON physi_events (is_zk_attested)`;
    console.log("[migrate] ZK Authority OK");
  } catch (e) { console.error("[migrate] ZK error", (e as Error).message); }

  console.log("[migrate] Done");
  process.exit(0);
}
run();
