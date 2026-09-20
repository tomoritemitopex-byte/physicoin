# Post-cleanup pixel spot-check

Deployment Protection blocks anonymous curl, so this runs in a logged-in
browser against `physicoin.vercel.app` (cleanup tree, `37b42d3`+). Check each
stop, tick it, delete this file's checklist when green — or keep it for the
next copy pass.

## 1. Landing `/`

- [ ] Logo reads **PhysiCoin** (not PHYSI); footer reads **PhysiCoin / campus signal layer**.
- [ ] Radar caption reads **green means go** (not "confidence is a live property").
- [ ] Footer reads **$PHY has no cash value** (not "points have no cash value").
- [ ] Disclaimer present: **not official university communication**.

## 2. Timetable `/app/timetable`

- [ ] Progress header reads **AGREED n/8 classmates** (no QUORUM, no ratio, no 0.66).
- [ ] Detail line reads **"N agreed — needs M more for the green tick"** (or ✓ Confirmed).
- [ ] Voting Yes shows **+1 $PHY** (not +1 XP).

## 3. Mining `/app/mining`

- [ ] Header reads **Hey, @handle** (not Good morning) and **Wallet · $PHY · daily streak** (no WAT).
- [ ] Empty state reads **No $PHY yet** (not No Rep yet).
- [ ] Cooldown line reads **One check-in every 24h · rewards shrink as campus grows · cap 10,000 $PHY**.
- [ ] Footer: **earn on campus, spend on campus, no cash value**.

## 4. Profile `/app/profile`

- [ ] Programme picker is generic (Sciences / Health Sciences / Engineering / Arts & Humanities / Social Sciences / Other) — no faculty list.
- [ ] Tier card reads **Tier grows with your $PHY balance** (not Level = Wallet balance).
- [ ] Setup form reads **password optional for other browsers** (not "no password needed").
- [ ] No `physi_profile` / localStorage jargon anywhere visible.

## 5. Admin `/app/admin`

- [ ] No **Ring buffer**, no `logs/*.log` paths, no `adapter-driven` in headers/footers.
- [ ] Footer reads **Recent 100 events, newest first** style plain language.

## 6. Dead route `/app/verify`

- [ ] Visiting `/app/verify` 404s (page deleted; `/api/verify` still serves votes).
