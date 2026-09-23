# Inverted Audit — PhysiCoin Rebuild Plan (2026-09-23)

## Executive Summary
The "Signal Graph" rebuild promises to differentiate PhysiCoin from a generic timetable into a **campus signal instrument** by exposing change radar, confidence decay, and action-oriented next steps. This inverted audit stress-tests that promise across architecture, design, consensus, economy, and proof-chain domains.

**Finding**: The plan is sound in concept but **underspecifies trust-critical behavior**: confidence decay timing, decay halt conditions during ongoing votes, and how confidence interacts with authority rebasing. The design direction (navy/coral) is implemented but **unused in the Signal Radar component** (demo state only). Recommendations below.

---

## 1. Architecture Domain

### Desired Outcome
Signal Graph routes, components, and data adapters coexist cleanly with existing timetable, verify, and mining without breaking API contracts or introducing build-time DB dependencies.

### Kill List: How I'd Guarantee Failure

#### K-A1: Hot-path table DDL on page load (route.ts calls ensureAllTables)
- **Evidence**: `lib/ensure.ts` exports `ensureAllTables()` (deprecated); `app/app/*/page.tsx` could import it as RSC.
- **Failure mode**: Every Signal Graph fetch blocks on `ALTER TABLE` or `CREATE TABLE IF NOT EXISTS`, causing P50 latency spike, cascade to Neon connection exhaustion.

#### K-A2: Signal state lives in localStorage instead of server cache
- **Evidence**: `SignalRadar.tsx` uses `useState` + `setInterval` for demo rotation; no `/api/signals` endpoint exists.
- **Failure mode**: Signal state diverges across tabs/devices; refresh loses active index; no audit trail; cannot correlate signals to real timetable changes.

#### K-A3: Signal Radar subscribed to realtime events but no debounce
- **Evidence**: `lib/adapters/realtime.ts` exists (observability only); no `/api/realtime/signals` subscription handler.
- **Failure mode**: If signals ever connect to live Neon `LISTEN/NOTIFY`, each `timetable` or `verify` mutation fires 100+ signal recomputes; Neon connection pool exhausted; UI flickers.

#### K-A4: Confidence decay cron job never scheduled
- **Evidence**: `lib/adapters/features/faucet.ts` has `0 6 * * 1` example; Signal Graph mentions "decays in 18m" but no `cron` job written.
- **Failure mode**: Confidence stays at peak forever; users never see urgency; verification incentive collapses; timetable noise increases.

#### K-A5: Signal radar index state persisted in URL but not synced to DB
- **Evidence**: Plan says "action cards resolve into concrete next action" but no `/api/signal/{id}/action` POST exists.
- **Failure mode**: User taps "Leave now" on a stale signal (fetched 10m ago, now false); misses or leaves early; blames app.

### Inversions

#### P0 — No hot-path DDL on signal fetch
- **Prevents**: K-A1
- **Evidence**: `lib/ensure.ts` stays deprecated; all signal-related tables exist in `database/schema.physi.sql` build-time migrate; `/api/signals` is read-only.
- **Effort**: S (revert any accidental `ensureAllTables()` import in new code)
- **Inverted rationale**: Confidence in Neon schema is the bet; bet consistently and early.
- **Verify**: `npm run build` succeeds; no `await ensure*` in Signal Radar or `/api/signals` route.

#### P1 — Signal state lives on Neon, cached on client for 60s max
- **Prevents**: K-A2
- **Evidence**: New table `physi_signals` (build-time DDL); `/api/signals?since=<timestamp>` returns changes since last check; `SignalRadar.tsx` fetches on mount + 60s polling.
- **Effort**: M (new table + API route + client polling)
- **Inverted rationale**: Single source of truth. Signals are derived from real timetable/verify mutations; query them, don't invent them.
- **Verify**: Two browsers open same URL, one taps action → other sees updated signal within 60s.

#### P2 — Realtime signals are soft-refresh (UI reorders, no full rebuild)
- **Prevents**: K-A3
- **Evidence**: If `/api/realtime/signals` ever added, it only updates `confidence` and `age` fields; does not trigger full component re-render or re-fetch of related data.
- **Effort**: M (soft-update utility in client hook)
- **Inverted rationale**: Micro-updates feel snappy without thrashing the connection pool or React tree.
- **Verify**: Open DevTools Network tab, trigger a vote on one tab, Signal Radar on another; see max 2 requests in 5s, not 50.

#### P1 — Confidence decay is deterministic, server-computed at fetch time
- **Prevents**: K-A4
- **Evidence**: `physi_signals.confidence_decay_at` timestamp stored; `/api/signals` returns `confidence_now = max(0, confidence_base - (now - created_at) / decay_rate)` without cron. Decay halts if verification count increases.
- **Effort**: S (add two fields to schema + compute in GET `/api/signals`)
- **Inverted rationale**: No cron job = no scheduled task failure. Decay is a property of time, not state. Compute on read.
- **Verify**: Fetch same signal ID 10m apart; confidence decreases; no cron logs in Vercel/Cloud Run.

#### P0 — Signal action intent is idempotent and server-authorized
- **Prevents**: K-A5
- **Evidence**: New `/api/signal/{id}/action` POST with `action=leave_now|verify_at_venue|ask_classmate|ignore` + idempotency key. Returns the real timetable event, not the signal age. User sees confirmation: "Based on [Anatomy 300L] verified 5m ago at [New LT]. Leave in [8 min]?"
- **Effort**: M (route + auth check + idempotency table)
- **Inverted rationale**: Signal is a UI affordance; the real intent (verify, ignore) binds to the event, not the signal's age.
- **Verify**: Tap "Leave now" twice rapidly; POST twice with same idempotency key; response is identical both times, action log shows one entry.

---

## 2. Design Domain

### Desired Outcome
Signal Graph visual language (radar, confidence bands, decay, action urgency) is distinctive, accessible, and integrated into both landing page and app dashboard without redeclaration of tokens.

### Kill List: How I'd Guarantee Failure

#### K-D1: Design tokens defined in DESIGN_GUIDELINES.md but never compiled to CSS
- **Evidence**: `DESIGN_GUIDELINES.md` prescribes "coral `#ff6b6b`" and "paper `#fdf6e3`"; `app/globals.css :root` still has `--physi-bg #07111f` (dark navy); `lib/adapters/theme.ts` registers only `campus` + `forest`, no `dawn`.
- **Failure mode**: Designer spec and runtime truth diverge; PRs land with "approved colors" that never appear; UI looks nothing like design doc.

#### K-D2: Signal Radar component ignores theme tokens, uses hardcoded colors
- **Evidence**: `components/road/SignalRadar.tsx` has `signal.tone='lime'|'amber'|'red'` but no CSS class mapping to `--physi-accent-*` tokens.
- **Failure mode**: Signal Radar colors don't respond to theme switch; in dark mode, red dot on dark blue background fails WCAG AA contrast.

#### K-D3: Ghost drift animation and building node styles missing from globals.css
- **Evidence**: `components/road/WindingRoad.tsx` references `className="ghost-drift"` and `className="building-node"`; `app/globals.css` has no `@keyframes ghost-drift` or `.building-node` rule.
- **Failure mode**: CSS-in-JS fallback or no animation; console warnings; layout shifts on production build.

#### K-D4: Light-mode card (white, coral accent) clashes with dark-mode radar (navy, cyan grid)
- **Evidence**: DESIGN_GUIDELINES.md proposes `#fdf6e3` background + white cards; current runtime is `#07111f` + dark glass. Signal Radar uses `{signal.tone='amber'}` which maps to a CSS class that never defined for light mode.
- **Failure mode**: If `NEXT_PUBLIC_THEME=dawn` ever set, Signal Radar renders unreadably (amber dot on white = invisible); landing page looks professional, app looks broken.

#### K-D5: Responsive layout breaks at 768px (Signal Radar grid too wide on mobile)
- **Evidence**: `SignalRadar.tsx` has `signal-radar__orbit` with `<i />` spacers for grid lines; no `@media (max-width: 768px)` rule to collapse to 2-column.
- **Failure mode**: On mobile, orbit SVG overflows; action button wraps onto 3 lines; user cannot tap it; feedback: "UI broken on my phone."

### Inversions

#### P0 — Design tokens are declarative and compile to CSS, not just docs
- **Prevents**: K-D1
- **Evidence**: `app/globals.css` :root contains `--physi-paper`, `--physi-card`, `--physi-accent` as the single source. DESIGN_GUIDELINES.md is a readable index, not the source.
- **Effort**: S (edit globals.css once; DESIGN_GUIDELINES.md stays as-is for reference)
- **Inverted rationale**: CSS is the contract; docs are the story. Move the truth to the code.
- **Verify**: `grep --physi-paper app/globals.css` returns one definition; `grep #fdf6e3 app/globals.css` returns zero (use var instead).

#### P1 — Signal Radar tone classes map to theme-aware colors
- **Prevents**: K-D2
- **Evidence**: `.signal-dot.lime { background: var(--physi-signal-yes, #34d399); }` + `.signal-dot.amber { background: var(--physi-signal-caution, #fbbf24); }` + `:root[data-theme="dawn"] --physi-signal-yes: #4ade80`.
- **Effort**: M (add 12 CSS variables + 2 data-theme rule sets)
- **Inverted rationale**: Consistency. If the app has theme switching, every color must respect it.
- **Verify**: Set `data-theme="dawn"` on `<html>`; Screenshot Signal Radar; amber dot is visible on white background.

#### P2 — Ghost drift and building-node are in globals.css with fallback for no-animation preference
- **Prevents**: K-D3
- **Evidence**: 
```css
@keyframes ghost-drift {
  0% { opacity: 0.3; transform: translateY(-8px); }
  50% { opacity: 0.7; }
  100% { opacity: 0.3; transform: translateY(8px); }
}
.ghost-drift {
  animation: ghost-drift 4s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  .ghost-drift { animation: none; opacity: 0.4; }
}
```
- **Effort**: S (copy-paste animation rules)
- **Inverted rationale**: CSS rules belong in one stylesheet. No surprises at build time.
- **Verify**: `npm run build` emits no CSS warnings; `grep "ghost-drift" app/globals.css` returns the @keyframes rule.

#### P1 — Light-mode Signal Radar is readable via sufficient contrast and card borders
- **Prevents**: K-D4
- **Evidence**: In `dawn` theme, Signal Radar orbit uses `stroke: var(--physi-border, #ddd)` (not cyan); action button has `background: var(--physi-accent, #ff6b6b)` + `color: white` for 7:1 contrast ratio.
- **Effort**: M (add `data-theme` CSS branch, test screenshot)
- **Inverted rationale**: Theme switching is all-or-nothing; pick colors that work on both.
- **Verify**: `NEXT_PUBLIC_THEME=dawn npm run build && npm run dev`; take screenshot of Signal Radar at 991×560; run Lighthouse accessibility check.

#### P2 — Signal Radar collapses gracefully on mobile (single-column, full-width action button)
- **Prevents**: K-D5
- **Evidence**:
```css
@media (max-width: 768px) {
  .signal-radar__orbit { display: none; }
  .signal-radar__feed { gap: 1rem; }
  .signal-action { width: 100%; }
}
```
- **Effort**: S (add media query to globals.css Signal Radar section)
- **Inverted rationale**: Mobile is the constraint; design for it first, then add the radar ornament on desktop.
- **Verify**: `agent-browser set viewport 375 667; screenshot /tmp/agent-browser/signal-mobile.png`; action button is full-width and tappable.

---

## 3. Consensus/Trust Domain

### Desired Outcome
Signal Graph exposes quorum, confidence, and vote weight transparently; verifications shown in Signal Radar are **recent** and **from distinct verifiers**; no ghost votes (user count 1) or fake authority inflation.

### Kill List: How I'd Guarantee Failure

#### K-C1: Signal confidence = hardcoded 92%, 68%, 41% (demo state, never refreshed from DB)
- **Evidence**: `SignalRadar.tsx` defines `const signals = [ { confidence: 92 }, ... ]`; no SELECT query on `physi_verifications` or vote aggregates.
- **Failure mode**: User sees "Anatomy 92% confident" in Signal Radar but checks `/app/timetable` → real event shows 3 votes, 2 YES, 1 NO = 67% confidence. Distrust in system.

#### K-C2: Confidence includes self-votes or votes from alt accounts
- **Evidence**: Verify feature has `SELF_VOUCH` guard (line 147); but Signal confidence query may not filter `verifier_id != event.created_by`.
- **Failure mode**: Ghost voter creates event, votes on it twice from alt, Signal Radar shows 100% confidence; real students trust it; event promoted on false consensus.

#### K-C3: Confidence does not decay toward 0 if contradicting votes appear
- **Evidence**: Plan says "decays in 18m"; mining adapter halves rewards every 50k. No SQL trigger or query that says "if NO votes appear, decay confidence".
- **Failure mode**: "Anatomy moved to Room B" gets 5 YES votes → 100% confidence → Signal Radar nails it at 1hr. Then 10 students vote NO (actually still in original room). Confidence stays 100% (old data). Students ignore the NO votes; crowd rushes wrong room.

#### K-C4: Quorum threshold (required_points) is hardcoded or missing from Signal Radar
- **Evidence**: `/api/verify` computes `required = Math.max(3, Math.min(12, ...))` dynamically; but Signal Radar shows `confidence: 92` with no `required_points` field.
- **Failure mode**: User sees "92% confident"; doesn't know if that's 10 votes (strong) or 3 votes (trivial). Plan says "transparent provenance" but Signal Radar hides the denominator.

#### K-C5: Signal action ("Leave now") is authoritative even if the underlying event status changed
- **Evidence**: Signal Radar snapshot is fetched once; if user stares at it for 5m, then taps action, the signal's age is stale; real event may have been demoted or cancelled.
- **Failure mode**: Signal shows "Leave in 8 min" → user taps it → action handler checks real event in DB → event is now `status='cancelled'`. Should the app warn? Or silently ignore? Plan says "transparent provenance" but action flow is silent.

### Inversions

#### P0 — Signal confidence is computed from real aggregates, not demo values
- **Prevents**: K-C1
- **Evidence**: New table `physi_signals` with columns `event_id`, `yes_weight`, `total_weight`, `confidence_pct`, `required_points`, `updated_at`. Signal Radar fetches this; never hardcoded.
- **Effort**: M (new table + SELECT trigger on verify tx + API route)
- **Inverted rationale**: Signal Radar is a live instrument, not a mockup. Use the signal table to instrument the event.
- **Verify**: `/api/verify` fires, then `/api/signals?event_id=X` returns updated `confidence_pct`; two independent queries agree.

#### P1 — Signal confidence filters out self-votes and requires minimum vote diversity
- **Prevents**: K-C2
- **Evidence**: `physi_signals.confidence_pct = yes_weight / total_weight WHERE total_distinct_verifiers >= 2 AND verifier_id != event.created_by`. If diversity check fails, confidence is capped at 50%.
- **Effort**: M (add constraint to schema + update signal on verify)
- **Inverted rationale**: Consensus is by definition multi-person. No Sybil parity.
- **Verify**: Query `SELECT COUNT(DISTINCT verifier_id) FROM physi_verifications WHERE event_id='X' AND verifier_id != event.created_by`; if < 2, Signal Radar shows `? (awaiting verification)` instead of a %; verify tap opens the event detail, not an action.

#### P1 — Confidence decay accelerates if contradicting votes appear
- **Prevents**: K-C3
- **Evidence**: `physi_signals.decay_rate` is normal (18m half-life), but if `total_no_weight > total_yes_weight * 0.3`, decay_rate halves (9m half-life). Signal Radar shows [confidence], [decay ends in Xm], [contradictory reports].
- **Effort**: M (conditional decay logic in GET /api/signals)
- **Inverted rationale**: Contradiction = low confidence. Don't hide it; surface it.
- **Verify**: Create event, get 5 YES → Signal shows normal decay. Add 2 NO votes → re-fetch Signal → decay_rate in response halves; re-compute confidence_now and verify it's lower.

#### P1 — Signal confidence always shows required_points and vote diversity
- **Prevents**: K-C4
- **Evidence**: Signal Radar displays: `{yes_weight} / {total_weight} votes` + `{distinct_verifier_count} verifiers` + `needs {required_points}` inline or in a tooltip.
- **Effort**: S (add fields to `physi_signals` table; update SignalRadar JSX to display them)
- **Inverted rationale**: Transparent provenance means denominator, not just numerator.
- **Verify**: Take Signal Radar screenshot; identify text like "2/3 votes from 3 verifiers".

#### P0 — Signal action checks event status at tap time and shows warning if stale
- **Prevents**: K-C5
- **Evidence**: `/api/signal/{id}/action` POST re-fetches the event from DB; if status has changed since signal creation, returns `{ action_ok: false, reason: "event_status_changed", event_status_now: "cancelled", advice: "Event was cancelled. Confirm before leaving." }`. UI shows modal, not silent action.
- **Effort**: M (route logic + client error handling)
- **Inverted rationale**: Better to warn and let user decide than to silently act on stale data.
- **Verify**: Fetch Signal, wait 10m, tap action → if event was cancelled in the meantime, see modal: "This event was cancelled 3m ago. Do you still want to leave?"

---

## 4. Economy/Mining Domain

### Desired Outcome
Signal Graph does not introduce new farmable check-in loopholes; mining halving, cap, and rate-limit remain in force; signal verification does not earn PHY (voting is non-monetary).

### Kill List: How I'd Guarantee Failure

#### K-E1: Signal verification (voting) grants mining rewards
- **Evidence**: Current mining adapter: check-in earns `earned_amount = (base_reward * authority_multiplier) + MANUAL_BONUS`, capped at 10k. No signal-specific earnings.
- **Failure mode**: If Signal Radar links vote action to mining reward, users farm signals by creating fake events + voting on them; PHY supply inflates without work; economy collapses.

#### K-E2: Signal decay never halts even during active voting period
- **Evidence**: Plan says "decays in 18m"; no SQL rule that says "if created_at + 18m < now AND verified=false, reset decay_at".
- **Failure mode**: Event gets 7 votes over 30m (organic discussion). By 18m, confidence decays to 50% even though voting is active. New voters see low confidence, don't vote; actual consensus hidden.

#### K-E3: Mining cap (10k) bypassed by signal-triggered bonus pools
- **Evidence**: `BALANCE_CAP = 10000` in mining adapter; but if new `/api/signal/reward` endpoint added, it could award PHY outside the cap check.
- **Failure mode**: User reaches 10k balance, cannot mine. User creates signal, gets 1 PHY reward → balance = 10001. Repeat 1000x → 11k. Cap is meaningless.

#### K-E4: Check-in reward is halved twice (getHalvedBase called twice per request)
- **Evidence**: Mining adapter has `MANUAL_BONUS = 0.5` (constant); but signal earnings could call `halvedBase = await getHalvedBase(sql)` once per signal verification, inflating total earned.
- **Failure mode**: Signal verification path calls getHalvedBase once for signal, once for main reward. User earns `halvedBase + MANUAL_BONUS + halvedBase` = doubled base.

#### K-E5: Faucet weekly drip is no longer scheduled (cron job removed)
- **Evidence**: `lib/adapters/features/faucet.ts` defines `0 6 * * 1` example; actual cron not in Vercel deployment config or `vercel.json`.
- **Failure mode**: Faucet bootstraps no users; cold start for new accounts with 0 PHY; cannot vote (requires 1 PHY); onboarding broken.

### Inversions

#### P0 — Signal verification does not earn mining reward
- **Prevents**: K-E1
- **Evidence**: Mining adapter logic unchanged; `/api/signal/{id}/action` does NOT call mining endpoint. Vote happens via `/api/verify` (existing, no reward). Signal action is UI-only navigation, not an earnings event.
- **Effort**: S (write comment in code: "Signal actions do not mint PHY")
- **Inverted rationale**: Verification is a trust primitive, not a farming opportunity. Keep incentives orthogonal.
- **Verify**: Audit `/api/signal/*/action` route: no mining adapter import, no balance update.

#### P1 — Decay halts during active voting; resumes after 1h of no new votes
- **Prevents**: K-E2
- **Evidence**: `physi_signals.last_vote_at` timestamp tracked on each verify; decay formula: `decay_rate = (now - last_vote_at) > 1h ? normal : infinite` (i.e., confidence static while voting is hot).
- **Effort**: M (schema field + verify handler update + decay formula)
- **Inverted rationale**: Voting window should be coherent; don't penalize consensus-building with decay.
- **Verify**: Create event, get 1 vote at t=0. Fetch signal at t=10m → confidence shows `?/1 (awaiting more)`. Fetch again at t=5h (no new votes) → confidence starts decaying.

#### P0 — Mining cap is enforced at balance update, not bypassed by signal rewards
- **Prevents**: K-E3
- **Evidence**: New `/api/signal/*/action` has no PHY transfer logic. If signal earnings ever added, they route through `/api/mining` (which enforces BALANCE_CAP).
- **Effort**: S (architecture: signal actions call mining adapter, not direct DB update)
- **Inverted rationale**: Single source of truth for cap. All PHY changes go through one gate.
- **Verify**: Grep for `UPDATE physi_users SET mining_balance` in codebase; exactly 2 places: mining adapter and bootstrap. Signal routes have 0.

#### P1 — Halving happens once per check-in, never twice per request
- **Prevents**: K-E4
- **Evidence**: Mining adapter calls `getHalvedBase()` once at start of POST `/api/mining`; result is cached in local variable `halvedBase`. Signal action does not call mining adapter at all.
- **Effort**: S (already fixed in current mining adapter; verify no regression)
- **Inverted rationale**: One event, one halving increment. Linear time model.
- **Verify**: Run mining check-in twice; `COUNT(*) FROM physi_mining_logs` increments by 2, not 4.

#### P1 — Faucet cron is deployed and scheduled in Vercel
- **Prevents**: K-E5
- **Evidence**: `vercel.json` includes `{ "crons": [{ "path": "/api/faucet/cron", "schedule": "0 6 * * 1" }] }`. `/api/faucet/cron` handler validates `CRON_SECRET` header and runs drip logic.
- **Effort**: M (add cron config + route handler)
- **Inverted rationale**: Weekly bootstrap is not optional; code it in the deployment config, not the app.
- **Verify**: Deploy to staging; check Vercel Crons dashboard; see job listed; run it manually; check `physi_faucet_drips` table for new row.

---

## 5. Proof-Chain/Privacy Domain

### Desired Outcome
Signal Graph does not expose user nicknames as "ghost" or leak anonymity via signal metadata; ghost chain signatures remain private; ZK attestation (if used) is server-enforced.

### Kill List: How I'd Guarantee Failure

#### K-P1: Signal Radar fetches are not HMAC-signed; attacker can forge signal IDs
- **Evidence**: `/api/signals?event_id=X` is a GET route; no HMAC validation in route handler.
- **Failure mode**: Attacker observes legit signal ID from browser DevTools, crafts fake signal with altered confidence, sends to friend's phone via deep link. Friend trusts it.

#### K-P2: Ghost chain is not advanced on signal verification
- **Evidence**: `/api/verify` calls `buildGhostChainSigs()` and stores `rep_ghost_sig` in `physi_users`. Signal verification (/api/signal/{id}/action) does not.
- **Failure mode**: Signal-driven action is not auditable; user's rep chain has gaps; ZK attestation of the user's action history is incomplete.

#### K-P3: Signal metadata includes user `nickname` or `email` (PII leak)
- **Evidence**: `physi_signals` schema not specified; if it includes `created_by_nickname`, it exposes anon.
- **Failure mode**: Student anonymously reports false timetable (e.g., "Prof is late"). Signal Radar shows "reported 5m ago"; another student sees HTML source / debugger → `created_by_nickname: "ghost"` → identifies the reporter.

#### K-P4: ZK attestation gates are imported but not actually enforced
- **Evidence**: `lib/zkAuthority.ts` exists; `/api/verify` has comment `// NOTE: no ZK import on purpose` (line 12).
- **Failure mode**: ZK logic is dead code; confidence in "private" consensus is false; audit reveals the gates were never connected.

#### K-P5: Signal state written to client cookies unencrypted
- **Evidence**: Signal Radar component uses `useState`; if upstreamed to localStorage/cookie for persistence, no encryption.
- **Failure mode**: Attacker extracts cookie from browser cache; reads signal metadata; correlates with IP logs to de-anonymize user.

### Inversions

#### P0 — Signal fetches are HMAC-validated on the server
- **Prevents**: K-P1
- **Evidence**: `/api/signals?event_id=X&sig=<HMAC-SHA256(event_id+DATABASE_URL)>` with server-side validation in route. Invalid sig returns 403. Client never constructs sig (only server does).
- **Effort**: M (add HMAC check to route handler)
- **Inverted rationale**: Signal is a public API; protect against tampering.
- **Verify**: Fetch signal, copy response, manually edit confidence, re-submit with old sig → 403 Forbidden.

#### P1 — Signal-driven actions advance the user's ghost chain
- **Prevents**: K-P2
- **Evidence**: `/api/signal/{id}/action` calls `appendGhostChain(sql, userId, GHOST_ACTIONS.SIGNAL_ACTION_TAKEN, { ... })` before returning. Chain signature is updated in `physi_users.rep_ghost_sig`.
- **Effort**: S (one function call in signal action route)
- **Inverted rationale**: Every action is part of the user's rep chain. No exceptions.
- **Verify**: Fetch user's ghost chain (private endpoint), verify it includes the signal action entry.

#### P0 — Signal metadata does not include user PII
- **Prevents**: K-P3
- **Evidence**: `physi_signals` schema: `event_id`, `yes_weight`, `total_weight`, `created_by` (user ID, not nickname), `created_at`, no email/nickname.
- **Effort**: S (schema design: no PII columns)
- **Inverted rationale**: Signal is a quorum fact, not a user identity. De-couple them.
- **Verify**: Schema review: grep `CREATE TABLE physi_signals`; no `nickname`, `email`, or `display_name` columns.

#### P1 — ZK gates are wired into verify flow or marked as future work
- **Prevents**: K-P4
- **Evidence**: `/api/verify` comment updated: `// ZK not yet integrated; planned for Q4 2026. See docs/zk-roadmap.md.` OR gates are actually called with `const isZkAttested = await checkZkAuthority(...)` before updating quorum.
- **Effort**: L (integration) or S (documentation)
- **Inverted rationale**: Dead code is debt. Either ship it or deprecate it.
- **Verify**: If integrated: run verify with ZK disabled → request fails with `ZK_REQUIRED`. If documented: grep `/api/verify` for comment pointing to roadmap.

#### P2 — Signal state is ephemeral (not persisted to client storage)
- **Prevents**: K-P5
- **Evidence**: `SignalRadar.tsx` uses `useState` only; no `localStorage.setItem`. Signal fetches happen on mount + 60s poll. Session storage (in-memory) only.
- **Effort**: S (verify no setItem calls in component)
- **Inverted rationale**: Shorter lived = less surface for extraction. Fetch-on-demand is the model.
- **Verify**: Run Signal Radar in incognito window; refresh page; signal index resets to 0 (not restored from storage).

---

## Ranked Proposals

| Rank | Proposal | Prevents | Evidence | Effort | Verify |
|------|----------|----------|----------|--------|--------|
| **P0** | No hot-path DDL on signal fetch | K-A1 | `lib/ensure.ts` deprecated; all DDL build-time | S | `npm run build` succeeds; no `ensureAllTables()` in Signal code |
| **P0** | Signal confidence from real aggregates, not demo | K-C1 | New `physi_signals` table; SELECT on verify | M | `/api/verify` → `/api/signals?event_id=X` → updated pct |
| **P0** | Signal action checks event status at tap time | K-C5 | `/api/signal/{id}/action` re-fetches; warns if stale | M | Modal appears if event status changed |
| **P0** | Mining cap enforced; signal actions do not earn PHY | K-E1, K-E3 | Signal action is UI-only; no mining adapter import | S | Grep for mining in `/api/signal/*/action` → zero matches |
| **P0** | Signal-driven actions advance ghost chain | K-P2 | `/api/signal/*/action` calls `appendGhostChain()` | S | User ghost chain includes signal action entry |
| **P0** | Signal metadata does not include PII | K-P3 | Schema review: no nickname/email in `physi_signals` | S | Grep schema for PII → zero matches |
| **P0** | Signal fetches HMAC-validated | K-P1 | `/api/signals?sig=<HMAC>` validated on server | M | Forge sig → 403 Forbidden |
| **P1** | Signal state on Neon, cached client 60s max | K-A2 | New `physi_signals` table; polling interval 60s | M | Two browsers see update within 60s |
| **P1** | Soft-refresh realtime signals (no full rebuild) | K-A3 | Soft-update utility; max 2 requests in 5s | M | Network tab shows bounded request count |
| **P1** | Confidence decay deterministic, server-computed | K-A4 | `decay_rate` in schema; compute on GET `/api/signals` | S | Fetch same signal 10m apart; confidence decreases |
| **P1** | Confidence includes min vote diversity, capped at 50% if < 2 verifiers | K-C2 | Schema filter: `DISTINCT verifier_id >= 2` | M | Create event with 1 self-vote; confidence shows `?` not `100%` |
| **P1** | Decay accelerates if contradictions appear | K-C3 | Conditional decay rate; show contradictory reports | M | Add NO votes → decay_rate halves → confidence drops |
| **P1** | Signal confidence shows required_points and vote diversity | K-C4 | Add fields to response; update SignalRadar JSX | S | Screenshot shows "2/3 votes from 3 verifiers" |
| **P1** | Decay halts during active voting; resumes after 1h silence | K-E2 | `last_vote_at` timestamp; conditional decay | M | Voting window is coherent; old signal decays |
| **P1** | Faucet cron is deployed in vercel.json | K-E5 | Add cron config; `/api/faucet/cron` route | M | Vercel Crons dashboard shows job; runs on schedule |
| **P1** | ZK gates wired or documented as future work | K-P4 | Integration OR explicit comment in code | L or S | Verify → ZK check fires OR roadmap comment exists |
| **P2** | Design tokens declared in CSS :root, not just docs | K-D1 | `app/globals.css :root` is single source | S | `grep --physi-accent app/globals.css` → one def |
| **P2** | Signal Radar tone classes map to theme-aware colors | K-D2 | `.signal-dot.lime { background: var(--physi-signal-yes); }` | M | Set `data-theme="dawn"`; amber dot is visible |
| **P2** | Ghost drift and building-node animations in globals.css | K-D3 | `@keyframes ghost-drift` in stylesheet | S | `npm run build` → no CSS warnings |
| **P2** | Light-mode Signal Radar readable via contrast and borders | K-D4 | Orbit uses theme border color; button 7:1 contrast | M | `NEXT_PUBLIC_THEME=dawn` screenshot passes Lighthouse |
| **P2** | Signal Radar responsive; collapses on mobile | K-D5 | `@media (max-width: 768px)` hides orbit; full-width action | S | Mobile screenshot shows full-width button, tappable |
| **P2** | Halving happens once per check-in | K-E4 | `getHalvedBase()` called once; result cached | S | Mining logs increment by 1 per check-in, not 2 |
| **P2** | Signal state is ephemeral (not persisted to storage) | K-P5 | `useState` only; no localStorage/cookie writes | S | Incognito → refresh → signal index resets |

---

## Residual Risks

### 1. **No Scheduled Decay Cleanup**
Even if decay is deterministic on read, old signals with `confidence_now ≤ 1%` are never deleted. Over 1 year, `physi_signals` table grows to 1M+ rows. Queries slow. **Mitigation**: Add a cron job that deletes signals older than 30 days or with `confidence_now ≤ 0`. Effort: M. Rank: P2.

### 2. **Signal Confidence Doesn't Reflect Quorum Failure**
If an event is promoted (status='verified') but then demoted back to pending (new NO votes break ratio), the signal still shows old confidence. Users see "verified" Signal Radar but the real event is now pending. **Mitigation**: Signal fetch should always re-compute confidence from live `physi_verifications` aggregates, not cache. Add `SELECT SUM(...) WHERE event_id=X GROUP BY vote` on every `/api/signals` call. Cost: one extra query per request. **Verify**: Promote event → see 100% signal → demote event → re-fetch signal → confidence recomputed downward.

### 3. **Mobile Radar Ornament Is Purely Decorative**
On phones, the orbit grid is hidden (responsive breakpoint). Users on mobile don't see the signature "radar" visual. Signal Radar is reduced to a scrollable feed. **Mitigation**: Design a mobile-specific signal visualization (e.g., "pulse" ring animation around the action button, or a small dot-matrix grid as a watermark). This is a P2 design task; do not block launch.

---

## Conclusion

The Signal Graph rebuild plan is **architecturally sound** and the proposed design direction (navy + coral, live radar, confidence decay) is **distinctive and achievable**. The 24 inversions above codify the key bets: Signal state is derived from real quorum aggregates (not demo), confidence is transparent and penalizes contradiction, and signal-driven actions are privacy-preserving and non-monetary. 

**Recommend**: Implement all **P0 proposals** (7 items) before launch. These govern trust, data, and economy. **P1 proposals** (10 items) should land in parallel; they improve signal fidelity and prevent pathological behaviors. **P2 proposals** (6 items) + 3 residual risks are nice-to-haves; plan them in the post-launch hardening sprint.

---

*Audit completed: 2026-09-23. Auditor: inverted-audit skill (Munger-style inversion, falsifiable proposals, ranked by P0/P1/P2 impact).*
