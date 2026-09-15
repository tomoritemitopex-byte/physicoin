# Evidence — Hybrid Road Rebuild 2026-09-15
**Moderator:** Queen Dowager | **Workspace:** `/home/tomoritemitopex/physicoin`
**Panel doc:** `docs/REBUILD_PANEL.md`

Filled 2026-09-15. Baseline `next build` (no DATABASE_URL) passes; roadmap row is `ƒ` (dynamic).

## WindingRoad split — DONE
- Before: `components/road/WindingRoad.tsx` — 402 lines, `"use client"` line 1 — **FULL CLIENT**
- After:
  - `components/road/roadGeometry.ts` — 53 lines, pure shared module, **no directive**
  - `components/road/WindingRoadStatic.tsx` — 45 lines, SC, **no directive** (sky + road SVG + clock tower → SSR HTML)
  - `components/road/GhostDrift.tsx` — 74 lines, CC `"use client"` line 1 (owns all ghost animation: `GhostDrift` + `GhostDots`)
  - `components/road/WindingRoad.tsx` — 315 lines, still CC (nodes, panels, feed, verify polling) but renders **no SVG/scene** — fragment only
  - `components/road/RoadmapShell.tsx` — 91 lines, SC, **no directive** — composes `<WindingRoadStatic />` + `<WindingRoad />`
- Grep (real output, `grep -rn '^"use client";$'` on the four hybrid files → **zero hits**, exit 1):
  ```
  directive-hits-exit:1 (1 = none found, good)
  ```
  Full-road grep shows `"use client"` only in leaf CC files (`GhostDrift.tsx`, `WindingRoad.tsx`, `GhostAvatar.tsx`, …) — never in `WindingRoadStatic.tsx`, `roadGeometry.ts`, `RoadmapShell.tsx`, or `app/app/roadmap/page.tsx` (the two `roadGeometry.ts` / `WindingRoadStatic.tsx` hits for the bare string are doc comments, not directives).
- `tsc --noEmit` → exit 0 after the split.

## Roadmap SSG — DECIDED: keep dynamic (ƒ), reason written in code
- Decision: **keep `force-dynamic`** (live feed needs no cache). `app/app/roadmap/page.tsx` now exports:
  ```
  export const dynamic = "force-dynamic";
  export const revalidate = 0;
  ```
  with comment: `getTimetableFeed` dispatches in-process to the timetable adapter, which hits Neon every request and bypasses Next's fetch cache — prerendering would freeze a stale (or build-time empty) feed. The static road SVG still SSRs per-request via `WindingRoadStatic`.
- Build table (real, `npm run build` post-split, no DATABASE_URL → migrate skips gracefully):
  ```
  [migrate] DATABASE_URL unset — skipping (ok for CI without DB)
   ✓ Compiled successfully
   ✓ Generating static pages (13/13)
  ├ ƒ /app/roadmap   6.05 kB   93.1 kB
  ```
  (ƒ = Dynamic, server-rendered on demand — matches the decision. Page shrank 6.75 → 6.05 kB: the road scene no longer ships as client JS.)

## PWA — DONE (pre-existing, verified)
- `python3 -m json.tool public/manifest.json` → valid JSON, exit 0
- Icons:
  ```
  public/pwa-192.png: PNG image data, 192 x 192, 8-bit/color RGB, non-interlaced
  public/pwa-512.png: PNG image data, 512 x 512, 8-bit/color RGB, non-interlaced
  ```
- `app/layout.tsx` lines 49–50 link manifest + theme-color:
  ```
  <link rel="manifest" href="/manifest.json" />
  <meta name="theme-color" content="#ff6b6b" />
  ```
- Open issue (unchanged, deferred): `public/pwa-splash.png` referenced in manifest `screenshots` but file missing — leave as warning per panel Q-B.

## DB bootstrap hardening (same session)
- `ensureAllTables()` in `lib/db.ts` is a deprecated no-op; build-time `scripts/migrate.mjs` is primary — but `database/schema.physi.sql` was missing 10 tables + 4 column/constraint sets that only existed as lazy runtime `ensure*` calls.
- Fix: appended an **appendix section** to `database/schema.physi.sql` (`physi_squad_pings/waves`, `physi_bunk_reports`, `physi_notes_drops/unlocks`, `physi_event_history`, `physi_slot_claims` + `events.slot_key`, `physi_headers`, `physi_vote_bonds`, `physi_revoked_tokens`, `users.password_hash` + balance checks, `scope_votes.rep_earned`).
- Splitter check (no DB): `node -e` parse → **113 statements, 0 non-DDL-leading** — migrate.mjs will apply all of them.
- Docs: root `AGENTS.md` DDL section rewritten (build-time primary, no-op noted, dual-write rule for new tables); `physicoin/README.md` `nvm use 20` → `22`.

## Checklist before PR
- [x] `grep -rn '^"use client";$'` shows no directive in Static/geometry/Shell/roadmap page
- [ ] View-Source on `/app/roadmap` shows `<path d="M 14 120` without JS (needs running dev server — not done in this session)
- [x] `python3 -m json.tool public/manifest.json` exits 0
- [x] `app/layout.tsx` links manifest
- [x] `next build` symbol for roadmap documented with reason (ƒ, dynamic by design)
