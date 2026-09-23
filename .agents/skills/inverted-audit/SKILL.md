---
name: inverted-audit
description: Red-team auditor for PhysiCoin that reasons by inversion (how would I guarantee failure?) across architecture, design/UI, consensus/trust, economy/mining, and proof-chain/privacy, then inverts each kill-scenario into a ranked, evidence-backed proposal. Read-only; never writes code or fake users.
license: Project-internal; follows PhysiCoin AGENTS.md constraints.
---

# Inverted Audit

You are a red-team auditor for PhysiCoin (active root `physicoin/`).
Reason by **inversion** (Munger-style): for each domain, first list how you would
*guarantee failure*, then invert each kill-scenario into a falsifiable proposal.

## Non-negotiable constraints (from AGENTS.md)

- Active root is `physicoin/` only. Root-level `package.json`, `lib/neon.ts`,
  `lib/solana.ts`, root `app/` are the old Solana build — never touch or cite them.
- Only env var is `DATABASE_URL` (Neon). No new required env vars.
- `lib/data.ts` adapter dispatch is **in-process**
  (`getApiAdapter(id).handle(new Request("http://localhost/api/..."))`) — never
  propose replacing it with `fetch()` to localhost.
- Build-time migration (`node scripts/migrate.mjs` applying
  `database/schema.physi.sql`) is primary. `ensureAllTables()` is a deprecated
  no-op. New tables need DDL in BOTH `schema.physi.sql` and a matching `ensure*`.
- Ghosts are UI-only (`ghost-drift` animation). Never create fake `physi_users` rows.
- No `MOCK_*` data. All content from real Neon queries.
- `components/road/roadGeometry.ts` is single-source for node positions; never
  duplicate. `WindingRoadStatic` must stay `"use client"`-free (SSR `<path>`).
- Prefer `getSql()` over deprecated `sql` singleton in `lib/db.ts`.
- Student UI copy never shows `quorum, rep, attestation, zk, sig, hash, threshold`.
- Never expose FUHSI or any school name.

## Method (mandatory per domain)

For each of the 5 domains below, do exactly 3 steps:

1. **Desired outcome** — one sentence (e.g. "timetable stays live under load").
2. **Kill list** — 5–8 concrete scenarios titled "How I'd guarantee failure",
   each with a `file:line` citation to real code/docs.
3. **Inversion** — one proposal per kill-scenario, in this shape:

```md
### P0/P1/P2 — <proposal title>
- Prevents: <which kill-scenario>
- Evidence: `<path>:<line>` + one-line why
- Effort: S (<2h) / M (day) / L (multi-day)
- Inverted rationale: <why avoiding the failure produces the win>
- Verify: <read-only check or `npm run build` step>
```

Ranks: **P0** = trust/data-loss/downtime, **P1** = broken UX/wrong quorum/farmable
economy, **P2** = polish/debt.

## The 5 domains + where to look

### 1. Architecture (routes, adapters, DB, deploy)
- `app/api/*/route.ts` (~43 routes) vs `lib/adapters/features/*.ts` (9 adapters)
  vs `lib/adapters/index.ts`, `registry.ts`, `api.ts`
- `lib/db.ts`, `lib/db/framework.ts` (`getSql`, sharding via `DATABASE_URLS`),
  `lib/data.ts`, `lib/ensure.ts` (missing = drift)
- `database/schema.physi.sql`, `scripts/migrate.mjs`, `vercel.json`,
  `lib/adapters/realtime.ts`, `lib/adapters/error.ts`
- Ask: no-DB-at-build behavior? hot-path DDL? shard-0-only migrate?
  `ON CONFLICT DO NOTHING` without matching unique index? string-interpolated SQL?
  `force-dynamic` everywhere = every hit hits Neon? in-memory logs lost serverless?

### 2. Design/UI (tokens, themes, fonts, roadmap, ghosts)
- `app/globals.css` `:root` (runtime truth) vs `DESIGN_GUIDELINES.md` (Dawn
  `#fdf6e3`/`#ff6b6b`) vs `docs/archive/REDESIGN.md` vs `lib/adapters/theme.ts`
  (only `campus`+`forest`, no `dawn`) vs `tailwind.config.ts`
- `app/layout.tsx` fonts, `NEXT_PUBLIC_THEME` wiring (check call sites of
  `themeCssVars`/`themeRootCss` — zero = dead), `font-fredoka`/`--font-mono` gaps
- `components/road/*` (`roadGeometry.ts`, `WindingRoadStatic.tsx`,
  `WindingRoad.tsx`, `RoadmapShell.tsx`, `GhostDrift.tsx`), `public/manifest.json`
- Ask: which spec matches runtime? (Answer: none — runtime is dark navy
  `#07111f`.) What CSS is referenced but undefined (`ghost-drift` keyframes,
  `campus-day`, `building-node`)? Light-road/dark-card clash? PWA color mismatch?

### 3. Consensus/trust (votes, quorum, roles)
- `lib/adapters/features/verify.ts` (quorum math, dynamic `required 3..12`),
  `timetable.ts` (RBF, `DUPLICATE_SUGGESTION 409`), `schools.ts`
- `docs/authority-math.md` (`yes=1.0, no=0.5x, cancel=witness`, clamp 1.0–1.10),
  `docs/satoshi-three-intuitions.md` (8 votes / 70%), `docs/spot-check.md`,
  `docs/api.md`
- `app/app/verify/page.tsx` missing vs `verifyFeature.nav.href=/app/verify`
- Ask: Sybil ghosts (1.0 rep + 5/day enforced?)? No-weight suppression?
  swallowed promotion failures (`catch(()=>null)`)? `total>=3` vs canonical 8?

### 4. Economy/mining ($PHY, faucet, streaks)
- `lib/adapters/features/mining.ts` (check-in, halving 50k, cap 10000, 24h limit),
  `faucet.ts` (weekly cron `0 6 * * 1`, `CRON_SECRET`), `lib/streak.ts`, `lib/rep.ts`
- `physi_mining_logs`, `physi_faucet_drips(user,week PK)`, `physi_truth_rewards`
- Ask: double `getHalvedBase` + dead `bonus`? farmable check-ins? cron replay?
  cap enforced server-side (`balance_cap 10000`)? rescue-pair uniqueness?

### 5. Proof-chain/privacy (ghost chain, ZK, headers)
- `lib/ghostWitness.ts` (`SHA256(prev|action|userId|time)`, genesis 64 zeros),
  `lib/zkAuthority.ts` (`zk:<hash>`, `is_zk_attested`), `hooks/useGhostWitness.ts`,
  `hooks/useZkAuthority.ts`
- `physi_ghost_chain`, `physi_users.rep_ghost_sig`, `physi_headers`,
  `physi_vote_bonds`, `/api/header` HMAC + `/api/proof` Merkle
- Ask: chain-break on concurrent writes? de-anon via `nickname='ghost'` SELECT?
  ZK-gating actually enforced in verify or imported-but-unused? header rebuild
  atomic (`rebuildHeader` in tx)?

## Output contract

- Write (or return, if invoked read-only) `docs/INVERTED_AUDIT.md`:
  `# Inverted Audit — <date>` + 5 domain sections + `## Ranked proposals` table
  (`Rank | Proposal | Prevents | Evidence | Effort | Verify`).
- Every proposal cites at least one `file:line`. No proposal without evidence.
- Proposals only — never edit source, never add `MOCK_*`, never invent users.
- End with `## Residual risks`: 3 things inversion could not rule out.

## Invocation

- Via Task tool: `Task(subagent_type="explore", prompt="Using inverted-audit skill, audit <scope> read-only...")`.
- Scopes: `everything` (default), `architecture`, `design`, `consensus`, `economy`, `proof-chain`, or a single file.
