# Satoshi Three Intuitions — Implementation ( + Student Reframe )

> **Students see:** Ghost Mode 👻 · Where's Class? 📍 · Keep The Fire 🔥  
> **Devs see:** Ghost Witness · Scope Mining · ZK Authority (Satoshi P2)  
> Full student-friendly spec: [`./satoshi-student-intuitions.md`](./satoshi-student-intuitions.md) — no jargon, real pain points, ship in <1 week.

This doc covers Ghost Witness, Scope Mining, ZK Authority (Satoshi P2).

## 1. Ghost Witness Protocol — SHA256 Signature Chain

**DB:**
- `physi_users.rep_ghost_sig TEXT` — current tip of chain (64 hex)
- `physi_users.ghost_sig_updated_at TIMESTAMPTZ`
- `physi_ghost_chain(id UUID, user_id UUID, prev_sig TEXT, new_sig TEXT, action TEXT, created_at)` — audit trail

**Logic (`lib/ghostWitness.ts`):**
- `sha256Hex(input)` — Node `crypto.createHash("sha256")`
- `ghostNextSig(prevSig, action, userId, timestamp)` → `SHA256(prevSig|action|userId|timestamp)` hex (64 chars)
- Genesis = 64 zeros
- `verifyGhostLink(prev, action, userId, ts, newSig)` / `verifyGhostChain(chain)`
- `appendGhostChain(tx, userId, action)` — transactional: fetch prev → compute → update users → insert chain

**Actions:** `verify:yes/no/cancel`, `mining:checkin`, `scope:yes/no`, `profile:create`

**Wiring:**
- `POST /api/profile` — genesis sig
- `POST /api/verify` (transaction) — extends chain
- `POST /api/mining` — extends chain
- `POST /api/scopes` (transaction) — extends chain
- `GET /api/ghost-chain?user_id=UUID&verify=1` — fetch + optional verify

**Hook:** `hooks/useGhostWitness.ts`

## 2. Scope Value Mining — Rep Rewards

**DB:** `physi_scope_votes.rep_earned NUMERIC(5,2) DEFAULT 0`

**Rewards (`lib/scopeMining.ts`):**
- Quorum: 8 votes, 70% ratio (same as merge protocol)
- Majority voters: +0.1 Rep (`SCOPE_REWARD_MAJORITY`)
- Quorum reacher (triggering voter who tips quorum): +0.5 bonus (`SCOPE_REWARD_QUORUM_BONUS`) → total 0.6 for that voter
- Awarded transactionally via `awardScopeRewards(tx, scopeA, scopeB, triggeringVoterId)` — updates `rep_earned`, `physi_users.mining_balance`, inserts `physi_mining_logs`

**API:** `POST /api/scopes` now runs in `sql.transaction`, returns `mining_rewards` + `ghost_sig`; `GET /api/scopes?a=&b=` returns `rep_earned` sum.

**Hook:** `hooks/useScopeMining.ts`

## 3. ZK-Proof Authority — Privacy Threshold Checks

**DB:** `physi_events.is_zk_attested BOOLEAN DEFAULT false` + index

**Logic (`lib/zkAuthority.ts`):**
- `zkThresholdCheck(authorityFinal, requiredPoints, isZkAttested)` → `{passed, threshold, proof}` — proof token `zk:<hash>` hides raw authority, only boolean leaked
- `zkVerifyAuthority(auth, req)` → `{verified, proof}`
- `requiresZkAttestation(scopeType)` — global/university/faculty need ZK
- Cap via `clampAuthorityFinal` (max 1.10)

**API:**
- `GET/POST /api/zk?user_id=UUID&event_id=UUID` — threshold check
- `POST /api/timetable` (via `/api/events`) accepts `is_zk_attested` boolean on create
- Verify adapter imports `zkThresholdCheck` for future quorum gating

**Hook:** `hooks/useZkAuthority.ts`

## Migrations

- `database/schema.physi.sql` — added 3 blocks idempotently
- `lib/db.ts` — `ensureGhostWitness()`, `ensureScopeMiningColumns()`, `ensureZkAuthority()` + `ensureAllTables()` parallel+retry
- `lib/ensure.ts` — re-exports
- `scripts/migrate-satoshi-intuitions.ts` — manual run `node --loader tsx scripts/migrate-satoshi-intuitions.ts`

## Testing

- Real Neon DB tests with 8 UUID voters: Ghost chain SHA256 length 64, zk boolean hidden, rep_earned 0.60/0.10 distribution verified.
- `npx tsc --noEmit --skipLibCheck` passes.
- Vercel: `ensureAllTables()` auto-migrates on cold start.

## Frontend

- `hooks/useGhostWitness.ts` — fetch `/api/ghost-chain`
- `hooks/useScopeMining.ts` — fetch `/api/scopes` + vote
- `hooks/useZkAuthority.ts` — fetch `/api/zk`
- Existing `hooks/useScopeMerge.ts` refactored to plain fetch (no tanstack dep).

## Satoshi P2 Compliance

Zero officials: all three protocols are peer-verifiable, no trusted third party, deterministic, auditable via SQL.
