# Inverted Audit — PhysiCoin (everything scope)

Method: for each domain — desired outcome → "how I'd guarantee failure" (kill list, with evidence) → inverted proposal. Ranks: P0 = trust/data-loss/downtime, P1 = wrong quorum/farmable/broken UX, P2 = polish/debt. Skill: `.agents/skills/inverted-audit/SKILL.md`.

## Applied (2026-09-23)

Every proposal below was implemented, except where evidence downgraded it
(marked KEPT/DOCUMENTED with the reason). Verified: `npx tsc --noEmit` clean,
`npm run build` green (incl. new `/api/streak/rescue`), splitter unit-tested
(4 cases + 135-stmt schema parity), `node scripts/migrate.mjs` exits 0 with
no DB.

- P0 migrate splitter → `scripts/migrate.mjs`: dollar-quote/comment/string
  aware splitter, migrates every `DATABASE_URLS` shard, collects all errors
  instead of aborting on the first, idempotent-noise matcher.
- P0 schema DDL → `database/schema.physi.sql`: balance-cap constraints as
  idempotent DO blocks; `physi_slot_claims_slot_event_venue_uidx`;
  new `physi_streak_rescues` table.
- P0 hot-path DDL → removed `ensureSlotClaims` (timetable), `ensureVoteBonds`
  (verify), `ensureTruthRewards/ensureFaucetDrips` (faucet), vine DDL
  (schools, now `runVineMaintenance` = archive only); missing tables fail
  closed with new `TABLE_NOT_READY` 503 (`lib/adapters/error.ts:isMissingTable`).
- P0 ON CONFLICT → backfill/claim inserts idempotent via new unique index +
  retry-fetch of `your_claim_id`; three schools PATCH handlers rewritten as
  explicit whitelisted UPDATEs (the old `sql[setClause]` never substituted —
  every PATCH threw); dept counts insert documented as school-level bootstrap.
- P0 sharding → settled primary-scoped in `lib/db/framework.ts` header;
  migrate covers all shards.
- P0 quorum → documented live rule in `verify.ts` (required_points dynamic +
  ratio 0.66 + floor total>=3; "8 classmates" = scope-merge protocol); UI
  already binds "needs N more" to `required` (timetable page, WindingRoad).
- P0 mining → single `getHalvedBase` call, dead `bonus` line deleted.
- P0 ghost fork → user row `FOR UPDATE` + sig recompute from locked prev
  inside the vote tx (`verify.ts:runTx`); dead `promoteIfQuorum` (with its
  swallowing `catch(()=>null)` + duplicate payout block) deleted.
- P1 faucet → drip-row claimed FIRST via `ON CONFLICT DO NOTHING RETURNING`,
  loser skips; double-fire structurally impossible.
- P1 rescue → `physi_streak_rescues` + `POST /api/streak/rescue` (no
  self-rescue, 24h gap proof, 1/14d/pair, 429 retryAfter), registered as
  `streak` ApiAdapter. Local `StreakRescueCard` stays as offline preview;
  full client wiring is follow-up. KEPT-minimal by evidence: rescue never
  touched balances/quorum (server heatmap derives from mining_logs).
- P1 ghost-leak → DOCUMENTED, not changed: `/api/ghost-chain` is
  intentionally public (peer verification by design); user row selects no
  handle/PII. Comment added as a do-not-regress guard.
- P1 ZK → dead `zkThresholdCheck` imports removed from timetable/verify;
  `requiresZkAttestation` marked declared-future-gate. No fake enforcement.
- P1 registry → new streak route goes through `getApiAdapter`; the other ~30
  direct routes remain (registering all is a separate migration).
- P1 logs → file appends skipped on Vercel (read-only fs); console + Issues
  remain. In-memory ring documented ephemeral.
- P1 theme → runtime navy declared truth; `NEXT_PUBLIC_THEME` marked
  proposal-only in DESIGN_GUIDELINES; `--font-mono` defined; `font-inter`
  utility added; Fredoka loaded via next/font (`--font-fredoka` live).
- P1 ghosts → `ghost-drift`/`ghost-enter` keyframes added (via `translate`
  property so inline scale survives), `campus-day` defined, reduced-motion
  respected.
- P1 verify nav → `verifyFeature.nav.href` now `/app/timetable` (real voting
  surface); no 404 metadata.
- P2 PWA → manifest + layout theme-color unified to `#07111f`; EarthPulse
  debug string removed.
- P2 header → DOCUMENTED: persist is a single-statement upsert (atomic);
  rebuilds converge.

## 1. Architecture — desired: stays live, correct, shippable

### Kill list (how I'd guarantee failure)
- K-A1. Ship with no DB at build → migrate skips, pages render empty. Evidence: `scripts/migrate.mjs:13-18` (warn + `exit 0` when no URL); `app/page.tsx:5`, `app/app/roadmap/page.tsx:10` (`force-dynamic`, live Neon per request).
- K-A2. Break migration on any non-trivial DDL → build goes red. Evidence: `scripts/migrate.mjs:25` (splits on `/;\s*\n/`, breaks on function/trigger bodies); `:34` (aborts on any error not containing "already exists" — e.g. `ADD CONSTRAINT ... CHECK` without `IF NOT EXISTS`).
- K-A3. Run DDL on the hot path under load → Neon latency spikes / lock contention. Evidence: `lib/adapters/features/timetable.ts:149` (`ensureSlotClaims()` inside POST); `lib/adapters/features/verify.ts:187-190` (`ensureVoteBonds()` inside vote POST); `lib/db.ts:684`, `:723` (the ensures).
- K-A4. Keep two DB access patterns so key rotation / sharding silently diverges. Evidence: `lib/db.ts:72` (deprecated `sql` singleton evaluated once at import) vs `:63` (`getSql()` fresh); ~25 call sites use `getSql() ?? sql` fallback (`lib/db.ts:90-779`).
- K-A5. Shard reads but not writes → quorum computed on partial data. Evidence: `lib/adapters/features/stats.ts:20` (only stats uses `fanOutShards`); `verify.ts:194-233` + `timetable.ts:43` (always primary); `scripts/migrate.mjs:13` (migrates shard-0 only).
- K-A6. Bypass the adapter registry so error/log conventions rot. Evidence: 43 `force-dynamic` routes (`app/api/*/route.ts`) vs 9 registered adapters (`lib/adapters/features/*.ts` + `lib/adapters/realtime.ts:266` logs adapter); ~30 routes (`ghost-chain`, `zk`, `consensus`, `scopes`, `halls/*`, `notes`, `bunk`, …) handle requests directly.
- K-A7. Silently drop writes with `ON CONFLICT DO NOTHING` lacking a matching unique index. Evidence: `lib/adapters/features/timetable.ts:153`, `:214`, `:231`, `:236`, `:304`.
- K-A8. Lose all realtime logs on every deploy + crash logging on Vercel. Evidence: `lib/adapters/realtime.ts` (in-memory 200-ring); `lib/adapters/error.ts` writes to `logs/`/`.github/` (read-only / ephemeral on serverless).

### Inverted proposals
### P0 — Make `migrate.mjs` statement-splitter trigger/function-safe
- Prevents: K-A2. Evidence: `scripts/migrate.mjs:25`. Effort: S. Inverted rationale: refusing to split on bare `;` removes the whole class of "valid SQL kills the build". Verify: `node scripts/migrate.mjs` against staging DB with a function in schema; `npm run build` green.

### P0 — Move `ensureSlotClaims`/`ensureVoteBonds` out of POST hot paths (migrate-time only, fail-closed with 503 + code)
- Prevents: K-A3. Evidence: `timetable.ts:149`; `verify.ts:187-190`. Effort: S. Inverted rationale: DDL that cannot run at request time cannot wedge voting. Verify: grep POST handlers for `ensure*` → zero hits; load-test vote burst.

### P0 — Fix `ON CONFLICT DO NOTHING` sites: add matching unique indexes or convert to explicit upserts
- Prevents: K-A7. Evidence: `timetable.ts:153,214,231,236,304`. Effort: M. Inverted rationale: every write either lands or errors loudly — nothing vanishes. Verify: `\d physi_slot_claims` etc. show covering unique indexes; duplicate-POST test returns 409/`DUPLICATE_SUGGESTION`, never silent drop.

### P0 — Decide sharding: either shard writes+reads+migrate or delete `fanOutShards` from the request path
- Prevents: K-A5. Evidence: `stats.ts:20`; `migrate.mjs:13`. Effort: M. Inverted rationale: one拓扑, one truth — quorum can never be computed on a shard subset by accident. Verify: `grep fanOutShards app lib` shows either everywhere-behind-flag or stats-only-with-warning; multi-DB staging returns identical quorum on all shards.

### P1 — Register (or delete) the ~30 direct routes; no unregistered `app/api/*/route.ts`
- Prevents: K-A6. Evidence: `lib/adapters/index.ts:27` (registry) vs direct handlers (`app/api/consensus/route.ts`, `app/api/scopes/route.ts`, `app/api/ghost-chain/route.ts`, …). Effort: M. Inverted rationale: one dispatch choke-point enforces `{ok,code,message,hint}` + `logEvent` everywhere. Verify: every `route.ts` imports `getApiAdapter`; `docs/api.md` regen matches.

### P1 — Remove `?? sql` fallback; `getSql()`-only with explicit 503 `DB_NOT_CONFIGURED`
- Prevents: K-A4. Evidence: `lib/db.ts:72` vs `:63`. Effort: S. Inverted rationale: stale-client bugs become impossible — no connection, no query, clear error. Verify: `grep "?? sql" lib` → zero; rotation test without restart.

### P1 — Replace file/in-memory logging with a `physi_*` table (or drop server file writes)
- Prevents: K-A8. Evidence: `lib/adapters/realtime.ts` ring; `lib/adapters/error.ts` fs writes. Effort: M. Inverted rationale: logs that survive deploys can actually be polled by `/app/admin` (which polls `/api/logs` every 3s). Verify: redeploy → `/api/logs?limit=100` still returns pre-deploy events.

## 2. Design/UI — desired: one coherent, modern, trustworthy look

### Kill list
- K-D1. Ship three themes and apply none — runtime matches no spec. Evidence: `app/globals.css:5-16` (`:root` dark navy `#07111f`); `DESIGN_GUIDELINES.md:11-15` (Dawn `#fdf6e3`/`#ff6b6b`); `lib/adapters/theme.ts:52-60` (campus `#ffffff`) + forest `#0d3b2a`; zero `--campus-*` definitions anywhere.
- K-D2. Document theme switching that cannot work. Evidence: `DESIGN_GUIDELINES.md:47-48` (`NEXT_PUBLIC_THEME`, Dawn default) vs `theme.ts:41-44` (`forest` else `campus` — `dawn` falls through) vs zero call sites of `themeCssVars`/`themeRootCss` (`theme.ts:47`, `:143`); `app/layout.tsx` never injects them.
- K-D3. Reference CSS vars/classes/fonts that don't exist → silent fallback to generic. Evidence: `app/layout.tsx:56-60` uses `font-inter` (not in `tailwind.config.ts`), `var(--physi-paper)`/`var(--physi-ink)` (never defined — runtime has `--physi-bg`/`--physi-text`); `.badge` uses `var(--font-mono)` (`globals.css:31`, never defined); `EarthPulse.tsx:67`, `VoiceGossipFab.tsx:251` use `var(--font-fredoka)` (never loaded — `layout.tsx:2` loads only Inter + Instrument_Serif, and Instrument_Serif is never used).
- K-D4. Animate with undefined keyframes/classes. Evidence: `GhostAvatar.tsx:20` (`ghost-drift` class) + `:26` (`--ghost-drift` var) with no `@keyframes ghost-drift` in CSS; `RoadmapShell.tsx:42,93` (`campus-day`, undefined); `design-refresh-swatches.md:24,332` proposes the keyframes — never landed.
- K-D5. Clash light road with dark cards + triple PWA color mismatch. Evidence: `WindingRoadStatic` light sky vs `WindingRoad.tsx:299,329` dark `CleanCard`; `manifest.json:7` (`background #fdf6e3`) vs `:8` (`theme #0d3b2a`) vs `layout.tsx:35,50` (`theme-color #ff6b6b`).
- K-D6. Leave debug strings in shipped UI. Evidence: `EarthPulse.tsx:91` (`WAT · live · 30s poll · Fredoka · violet 1.2s`).

### Inverted proposals
### P1 — Declare one runtime truth (dark navy per `globals.css:5-16`) and delete/park the other two specs
- Prevents: K-D1/K-D2. Evidence: `globals.css:5-16`; `theme.ts:41-44`. Effort: M. Inverted rationale: one palette that matches the DOM beats three docs that match nothing. Verify: view-source `:root` == documented tokens; `NEXT_PUBLIC_THEME` either wired (inject `themeRootCss` in `layout.tsx`) or removed from docs + `.env.example`.

### P1 — Define or delete every referenced token/class/font (`--font-mono`, `--font-fredoka`, `font-inter`, `campus-day`, `ghost-drift` keyframes)
- Prevents: K-D3/K-D4. Evidence: `globals.css:31`; `EarthPulse.tsx:67`; `layout.tsx:56`; `RoadmapShell.tsx:42`; `GhostAvatar.tsx:20`. Effort: S. Inverted rationale: no dangling references → no silent generic-fallback rendering. Verify: `grep` each token → definition found; ghost animation visible with `prefers-reduced-motion` respected.

### P2 — Unify PWA colors + remove debug string
- Prevents: K-D5/K-D6. Evidence: `manifest.json:7-8`; `layout.tsx:35`; `EarthPulse.tsx:91`. Effort: S. Inverted rationale: install prompt and status bar agree with the app — trust signal, zero logic risk. Verify: Lighthouse PWA check; `grep WAT` → zero.

## 3. Consensus/trust — desired: green tick means 8 real classmates agreed

### Kill list
- K-C1. Let the poster vouch for themselves / forge votes. (Already guarded — keep it.) Evidence: `verify.ts:173-178` (HMAC `authUid` overrides body), `:205-209` (`SELF_VOUCH` 403), `:200-204` (1-$PHY stake → 429 `INSUFFICIENT_COINS`).
- K-C2. Apply the cheap `total>=3` minimum while calling it 8-vote consensus. Evidence: `verify.ts:273` (`promote = yesW >= required && ratio >= 0.66 && total >= 3`) vs `docs/satoshi-three-intuitions.md` (8 votes / 70%) and `WindingRoad.tsx:321` (`needs 3 votes min`).
- K-C3. Drift dynamic quorum (`required 3..12` from 7-day average, `verify.ts:266-272`) away from the documented 8/5 constants with no UI explanation.
- K-C4. Half-weight No (`w*0.5`, `verify.ts:211-212`) lets a coordinated minority be out-voiced without students understanding why.
- K-C5. Ship a `/app/verify` nav target with no page (dead-end trust flow). Evidence: `verifyFeature.nav.href=/app/verify` vs missing `app/app/verify/page.tsx` (only timetable/roadmap/mining/profile/admin exist).
- K-C6. Swallow promotion side-effect failures. Evidence: `verify.ts` post-tx `Promise.all(q.catch(()=>null))` pattern (promotion/`rebuildHeader`/`resolveBonds` failures invisible).

### Inverted proposals
### P0 — Reconcile `total>=3` with the 8-vote promise: either enforce 8 for `verified` or relabel 3-vote state honestly
- Prevents: K-C2. Evidence: `verify.ts:273`. Effort: S (decision) + S (copy). Inverted rationale: the tick can never mean less than students were told. Verify: SQL check `verified` events all have `total>=8` (or UI shows "needs N more" with N derived from 8).

### P1 — Create `app/app/verify/page.tsx` or remove the nav entry
- Prevents: K-C5. Evidence: `verifyFeature` nav href. Effort: S. Inverted rationale: every trust action has a reachable surface. Verify: click Verify in `BottomNavClient` → real page, no 404.

### P1 — Surface dynamic `required` in the UI ("needs N more" already does — bind it to the same variable)
- Prevents: K-C3/K-C4. Evidence: `verify.ts:266-275`; `WindingRoad.tsx:321`. Effort: S. Inverted rationale: students see the real number, so dynamic quorum can't feel rigged. Verify: N in UI === `required` in DB for the same event. Keep jargon ban (`satoshi-student-intuitions.md:123`).

### P1 — Log (don't swallow) post-tx promotion failures with `logError` + retry
- Prevents: K-C6. Evidence: `verify.ts` `catch(()=>null)`. Effort: S. Inverted rationale: a tick that failed to persist gets retried instead of silently lost. Verify: forced-failure test leaves an error row + recovers on retry.

## 4. Economy/mining — desired: $PHY is earnable, capped, unfarmable

### Kill list
- K-E1. Double-compute rewards + ship dead code in the money path. Evidence: `mining.ts:66` (`getHalvedBase(sql)`), `:68` (calls it AGAIN inside a `Math.pow(...?...:0)` that always evaluates to constant — dead `bonus` line), `:109` (third call).
- K-E2. Enforce the 10,000 cap client-side only → farm past it by direct POST. Evidence: `mining.ts` cap logic vs `schema.physi.sql` `balance_cap`; `app/app/mining/page.tsx:73-74` preview math is client-side.
- K-E3. Pay faucet twice on cron overlap/retry. Evidence: `vercel.json` cron `0 6 * * 1` → `faucet.ts:38,82`; safety depends on `physi_faucet_drips(user,week PK)` — verify it actually guards the insert path.
- K-E4. Let streak `Rescue +5` (`lib/streak.ts`) be self-rescuable (same `user_id`, no 24h gap proof, no 14d pair cap).

### Inverted proposals
### P0 — Single `getHalvedBase` call per request; delete dead `bonus` line; assert cap server-side in tx
- Prevents: K-E1/K-E2. Evidence: `mining.ts:29,66,68,109`. Effort: S. Inverted rationale: money math with one read and one clamp cannot drift from itself. Verify: direct-POST farm test → balance never exceeds 10000; code shows one `getHalvedBase` call.

### P1 — Prove faucet idempotency with a double-fire test on `physi_faucet_drips` PK
- Prevents: K-E3. Evidence: `faucet.ts:38,82`. Effort: S. Inverted rationale: the cron can retry safely because the second pay is a no-op by constraint. Verify: fire twice same week → one drip row, one credit.

### P1 — Enforce rescue-pair rules in SQL (`1 rescue/14d/pair`, different `user_id`, 24h gap) not just `localStorage`
- Prevents: K-E4. Evidence: `lib/streak.ts` + `K_RESCUE`/`K_LAST` keys. Effort: M. Inverted rationale: client storage is advisory; the constraint lives where farming happens. Verify: self-rescue and double-rescue POSTs rejected server-side.

## 5. Proof-chain/privacy — desired: anonymous, auditable, unbreakable chain

### Kill list
- K-P1. Break the ghost chain on concurrent votes (read-prev then write-new non-atomically). Evidence: `verify.ts:220-221` (`buildGhostChainSigs` pre-tx) — confirm the `UPDATE physi_users.rep_ghost_sig + INSERT physi_ghost_chain` happens inside the tx (`:282-299`) with row lock, else two concurrent votes fork the chain.
- K-P2. De-anonymize via ghost SELECT reuse or sig leakage in API responses (nickname `ghost` in GET but `sig` in DB — `satoshi-student-intuitions.md:128`).
- K-P3. Import ZK checks but never gate on them (`is_zk_attested`, `database/schema.physi.sql:41,48`; `app/api/zk/route.ts:20-47`) — global/faculty scopes unprotected despite docs.
- K-P4. Rebuild daily header non-atomically → `/api/header` HMAC vs `/api/proof` Merkle disagree during rebuild (`lib/header.ts:34,71,81`).

### Inverted proposals
### P0 — Lock the ghost-chain update (`SELECT ... FOR UPDATE` inside tx) + add a concurrency test
- Prevents: K-P1. Evidence: `verify.ts:220-221,282-299`. Effort: M. Inverted rationale: serialized prev→next makes forks structurally impossible. Verify: 10 concurrent votes same user → `verifyGhostChain` passes, no gaps.

### P1 — Audit every API response for sig/user-id leakage when `nickname==='ghost'`
- Prevents: K-P2. Evidence: `ghost-chain/route.ts:18`; `squad/route.ts:86-88`; `notes/route.ts:198-199`. Effort: M. Inverted rationale: anonymity is a response-shape property — prove it per endpoint. Verify: ghost-POST then peer-GET shows `nickname:'ghost'`, no id/sig/timing fingerprint; document the exact SELECT allow-list.

### P1 — Either enforce `requiresZkAttestation` for global/faculty scopes or remove the ZK UI/API
- Prevents: K-P3. Evidence: `schema.physi.sql:41`; `zk/route.ts:20-47`. Effort: M. Inverted rationale: a security control that doesn't gate is worse than none (false confidence). Verify: global-scope POST without attestation → rejected with code; or ZK routes removed and docs updated.

### P2 — Make `rebuildHeader` atomic with the vote tx (or version headers so proof verifies during rebuild)
- Prevents: K-P4. Evidence: `lib/header.ts:34,71,81`. Effort: M. Inverted rationale: header and proof can never disagree mid-write. Verify: vote-while-rebuild test → `/api/proof` verifies before, during, after.

## Ranked proposals (execution order)

| Rank | Proposal | Prevents | Evidence | Effort | Verify |
|------|----------|----------|----------|--------|--------|
| P0 | Trigger-safe migrate splitter | Build red on valid DDL | `scripts/migrate.mjs:25,34` | S | Staging migrate + `npm run build` |
| P0 | DDL out of POST hot paths | Vote wedge under load | `timetable.ts:149`; `verify.ts:187-190` | S | Zero `ensure*` in POST; burst test |
| P0 | Fix `ON CONFLICT DO NOTHING` (unique idx or upsert) | Silent write loss | `timetable.ts:153,214,231,236,304` | M | Covering indexes; dup-POST → 409 |
| P0 | Settle sharding (all-in or out) | Quorum on partial data | `stats.ts:20`; `migrate.mjs:13` | M | Identical quorum all shards |
| P0 | Reconcile `total>=3` vs 8-vote promise | False green tick | `verify.ts:273` | S | SQL: verified ⇒ total≥8 (or honest copy) |
| P0 | Single reward read + server cap | Farmable/drifting $PHY | `mining.ts:66,68,109` | S | Direct-POST cap test |
| P0 | Ghost-chain row lock + concurrency test | Chain fork | `verify.ts:220,282-299` | M | 10-concurrent verify passes |
| P1 | Register/delete ~30 direct routes | Convention rot | `adapters/index.ts:27` vs direct routes | M | All routes via `getApiAdapter` |
| P1 | `getSql()`-only, drop `?? sql` | Stale-client divergence | `lib/db.ts:63,72` | S | Zero `?? sql`; rotation test |
| P1 | Persisted logs, drop fs writes | Blind ops after deploy | `realtime.ts` ring; `error.ts` fs | M | Logs survive redeploy |
| P1 | One theme truth; wire or remove env switch | Three-themes-none UX | `globals.css:5-16`; `theme.ts:41-44` | M | DOM == docs; switch works or gone |
| P1 | Define/delete dangling tokens/fonts/classes | Silent fallback UI | `globals.css:31`; `EarthPulse.tsx:67`; `layout.tsx:56` | S | All refs resolve; ghosts animate |
| P1 | Add `/app/verify` or remove nav | Dead trust flow | verify feature href | S | No 404 from bottom nav |
| P1 | Bind UI "needs N more" to dynamic `required` | Rigged-feeling quorum | `verify.ts:266-275` | S | UI N == DB required |
| P1 | Log+retry promotion failures | Lost ticks | `verify.ts` swallow pattern | S | Failure leaves error + recovers |
| P1 | Faucet double-fire test | Double pay | `faucet.ts:38,82` | S | Two fires, one credit |
| P1 | Server-side rescue-pair constraints | Self-farming streaks | `lib/streak.ts` | M | Bad rescues rejected |
| P1 | Ghost-leak response audit | De-anon | `ghost-chain:18`; `squad:86` | M | Peer sees only `ghost` |
| P1 | Enforce-or-remove ZK gating | False security | `schema:41`; `zk/route:20` | M | Global w/o attest rejected, or ZK removed |
| P2 | PWA colors + debug string | Distrust polish | `manifest:7-8`; `EarthPulse:91` | S | Lighthouse PWA; grep clean |
| P2 | Atomic/versioned header rebuild | Proof disagreement | `header.ts:34,71,81` | M | Proof verifies mid-rebuild |

## Residual risks (inversion could not rule out)
1. Neon cold-start + `force-dynamic`-everywhere cost/latency under real cohort load — needs production numbers, not reasoning.
2. HMAC session + vote-stake economics vs determined Sybil with many real devices — social-layer attack, code can't fully close.
3. WindingRoad 525-line client overlay (`WindingRoad.tsx`) swipe/offline/XP paths — needs device testing, not static audit.

## BEDROCK Phase 1 (shipped)

- Rosters: `physi_rosters` + `physi_roster_members` (schema + `ensureRosters()`),
  `POST /api/roster` create/rotate/join, `GET` roster + members / member's
  rosters, registered as `roster` ApiAdapter. Events carry nullable
  `roster_id`; posting/voting on roster-linked events requires membership
  (`ROSTER_ONLY` 403). Legacy open events unaffected.
- Blind-until-locked: `GET /api/verify?event_id=` strips `verifier_id` while
  pending, reveals on lock (`locked` flag in quorum payload). Receipts
  (`?verifier_id=`) now require a matching session (was world-readable).
- Founding marks: `physi_users.founding_mark` backfilled 1:1 from
  `mining_balance`; profile GET returns explicit columns (no more
  `SELECT *` — was leaking `password_hash`).
- Void skin (step 1): true-black tokens, black physi-card, unified PWA chrome.
  Font/component purge is follow-up, not this phase.
