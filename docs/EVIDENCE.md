# Evidence — Hybrid Road Rebuild 2026-09-06
**Moderator:** Queen Dowager | **Workspace:** `/home/tomoritemitopex/physicoin`
**Panel doc:** `.hermes/plans/queen-dowager-rebuild-panel-2026-09-06.md`

> Code Agent: overwrite this scaffold with real command output. No merge without evidence.

## WindingRoad split
- Before: `components/road/WindingRoad.tsx` — 449 lines, `"use client"` line 1 — **FULL CLIENT** (verified 2026-09-06)
- After (to fill):
  - `components/road/WindingRoadStatic.tsx` — SC, lines: __
  - `components/road/GhostDrift.tsx` — CC `"use client"`, lines: __
  - `components/road/WindingRoad.tsx` — kept as `WindingRoad.legacy.tsx`? y/n __
- Grep (paste real output):
```
# run: grep -rn "use client" physicoin/components/road/
# expected after: only GhostDrift.tsx + legacy
```
- RoadmapShell composition (paste diff snippet):
```
# git diff -- components/road/RoadmapShell.tsx
```

## Roadmap SSG
- Decision (check one):
  - [ ] `export const revalidate = 30` → SSG ○ with ISR (adapter still bypasses Next cache — must switch to fetch or document as "static shell + dynamic data")
  - [ ] Keep dynamic (`export const dynamic = "force-dynamic"`) with reason: live feed needs no cache
  - [ ] Hybrid: SC shell static, client fetch for events
- Verification (paste build table line):
```
# next build output line for /app/roadmap — e.g.:
# ├ ○ /app/roadmap   1.2 kB   85 kB
# └ λ /app/roadmap   1.2 kB   85 kB   ← circle the actual symbol
```

## PWA
- `python3 -m json.tool public/manifest.json` (paste exit + first 10 lines):
```
# run: python3 -m json.tool public/manifest.json
# 2026-09-06 pre-check: valid JSON, display=standalone, icons 192+512 present
```
- Icons:
```
# file public/pwa-192.png → PNG 192x192
# file public/pwa-512.png → PNG 512x512
# ls -lh public/pwa-*.png
```
- `app/layout.tsx` diff (must show manifest link):
```
# git diff -- app/layout.tsx
# expected: +    <link rel="manifest" href="/manifest.json" />
#           +    <meta name="theme-color" content="#0d3b2a" />
```
- Browser check (paste DevTools Application → Manifest excerpt):
```
# manifest parsed: yes/no, errors: __, icons listed: __
```
- Open issue: `public/pwa-splash.png` referenced in manifest `screenshots` but file missing (pre-existing). Action: __ remove entry | create image | leave as warning __

## Checklist before PR
- [ ] `grep -rn "use client"` shows no full-page WindingRoad client
- [ ] View-Source on `/app/roadmap` shows `<path d="M 50 60` without JS
- [ ] `python3 -m json.tool public/manifest.json` exits 0
- [ ] `app/layout.tsx` links manifest
- [ ] `next build` symbol for roadmap documented with reason
