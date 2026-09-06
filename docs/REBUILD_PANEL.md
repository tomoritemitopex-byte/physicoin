# Rebuild Panel — Queen Dowager Moderator

> Workspace: `/home/tomoritemitopex/physicoin` · Full spec: `/.hermes/plans/queen-dowager-rebuild-panel-2026-09-06.md`

## Tasks
1. **WindingRoad hybrid** — Static SVG road (SC) + ghost drift (CC)
2. **Roadmap SSG** — Prove ○ vs λ, fix or document
3. **PWA manifest** — Valid JSON, icons 192/512, standalone

## Panel Questions (answer with evidence)

**Q-A — Does `"use client"` bounce SSR?** YES — `WindingRoad.tsx` line 1 forces the whole road client-only. `RoadmapShell.tsx` is SC but imports a CC, so its `<WindingRoad>` subtree is entirely client-rendered. Verify via View-Source (SVG missing without JS).

**Q-B — Strictly needed vs optional?**
- Needed: split `WindingRoad` into `WindingRoadStatic` (SC, SVG) + `GhostDrift` (CC, hooks/fetch/ghosts); compose in `RoadmapShell` (SC); add `export const revalidate = 30` OR keep `force-dynamic` with written reason; add `<link rel="manifest">` in `app/layout.tsx`.
- Optional: `pwa-splash.png` screenshot, SW registration, `purpose:"any maskable"` — defer.

**Q-C — How to verify manifest?** `python3 -m json.tool public/manifest.json` (must exit 0) + DevTools Application → Manifest (no parse errors, icons show) + `file public/pwa-*.png` (correct dims) + `curl /manifest.json` 200.

## Spawn
| Agent | Do | Evidence |
|-------|----|----------|
| Code | Split road, patch layout/roadmap, keep legacy | `docs/EVIDENCE.md` |
| Browser | View-Source SVG + DevTools Manifest | `browser-evidence.md` |
| File | json.tool + file + sw.js audit | `file-evidence.json` |

Evidence file scaffold lives at `docs/EVIDENCE.md` — no PR without it.
