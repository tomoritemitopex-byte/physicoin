# 3 Satoshi Intuitions — For Students (No Nerdy Words)

> If you can explain it to your roommate in 10 seconds, it ships. If not, it doesn't.

Forget `mempool`, `Merkle roots`, `ZK`. Here's the same Satoshi magic — but in campus language.

---

### 1) 👻 Ghost Mode — "Say It Without Being Seen"

**The pain:**  
LT2 has no light. Lecturer didn't show. Venue changed but you're scared to be the "snitch" who posts it. Or you want to say "that test was brutal" without your name on it.

**The magic in one tap:**  
Flip the 👻 switch → post/vote anonymously. Your name is hidden from everyone, but the app still knows *you're a real student who was actually there*. No fake accounts spamming.

**How it feels:**
```
[ 👻 Ghost Mode ON ]  — "A classmate (hidden) says: LT2 locked"
[ 3 ghosts agree ✓ ]  — still hidden, but counts
[ 👁 Tap to reveal you? Never required ]
```

**Why it's fun / keeps you coming back:**
- No fear of lecturers or SUG politics — talk real
- Ghost posts that turn out true give you hidden XP (+0.1 ghost cred)
- Leaderboard shows "Top Ghosts" without names — mystery = addictive

**Satoshi bit (hidden from students):**  
`SHA256(prev|action|userId|time)` chain = "receipt that you were here" without showing your face. Threshold check hides exact rep. = ZK. Students just see 👻.

**Build in <1 week:**
- [x] `lib/ghostWitness.ts` already does chain — just rename UI to "Ghost Mode"
- [ ] Toggle on `POST /api/verify` and `POST /api/scopes`: `ghost: true` → hide `nickname` in GET, keep sig in DB
- [ ] UI: one switch in Verify + Timetable cards. Ghost avatar = blurred + 👻
- [ ] Abuse guard: ghosts still need 1.0 rep to vote, rate-limit 5 ghost posts/day
- **Ship test:** Post as ghost, fetch as peer — nickname === "ghost", sig still verifies

---

### 2) 📍 Where's Class? — "Scout & Confirm"

**The pain:**  
You trek to Hall B, class moved to New Lab. No memo. You miss 30 mins. Whatsapp group is 200 unread messages.

**The magic in one tap:**
First person who spots the move taps: **"Moved to New Lab 2PM"** → friends get a ping: **"Still there? [Yep] [Nope]"** → 5 friends tap Yep → 🔒 it locks, **everyone** on that course gets notified. Scout gets "Scout" badge.

**How it feels:**
```
BIO 101 — scouted by Jay · 2 mins ago
"ANA 201 moved: LT2 → LT Hall B"
[ Yep same  4/5 ] █████░  — one more to lock
[ Confirm ] [ Wrong room ]
🎉 Locked! +10 XP for Jay, +2 for confirmers
```

**Why it's fun:**
- You become the hero who saved 40 people a wasted trek
- Progress bar creates FOMO — everyone wants to be #5 to tip it
- Course auto-subscribes you — no searching

**Satoshi bit (hidden):**  
"5 friends agreed, so it's official" = quorum (8 ideal, 5 for campus speed) + 70% yes ratio. No admin needed. Pure peer truth.

**Build in <1 week:**
- [x] `lib/scopeMining.ts` + verify quorum already exists — reuse for venue/time votes
- [ ] Timetable card: `[Flag Move]` → pick new venue/time → creates `physi_events` pending row
- [ ] Notify: simple in-app banner + (later) push — `GET /api/events?course=BIO101&status=pending` poll every 30s
- [ ] Rewards: reuse `awardScopeRewards` but rename: `+2 XP` for yep/nope, `+10 XP` for scout who tips to 5
- **Ship test:** 5 test accounts vote Yep, event flips `verified`, sixth user sees green check

---

### 3) 🔥 Keep The Fire — "Streak + Friend Rescue"

**The pain:**  
You checked in 6 days straight, miss one day, fire dies → "why bother?" and you quit. Same as Duolingo/Snap but lonelier.

**The magic in one tap:**
Show up / verify / scout = 🔥 streak goes up. Miss a day = fire fades (not instant death). **One friend can tap "Rescue"** and throw you +5 back. You can only be rescued once per 14 days — so it feels rare and real.

**How it feels:**
```
Your fire: 🔥🔥🔥 7 days
Yesterday you ghosted → faded to 3.5
@Tunde tapped [ RESCUE ] 🛟 → back to 8! ( +5 )
"Bros save bros" — you both get a badge
```

**Why it's fun:**
- Streak = identity ("I'm a 14-day guy")
- Rescue = social hook — you DM a friend "bros rescue me" → retention doubles
- Half-life visual = fire dimming animation, not numbers

**Satoshi bit (hidden):**  
`N(t)=N0*0.5^(days/7)` decay = fire fading math. Rescue is `+5` capped, one rescue/14d, entangled via `BroadcastChannel + vaultPut`. No fake self-rescue — needs different `user_id` + 24h gap proof.

**Build in <1 week:**
- [x] `lib/streak.ts` (`getStreak`, `bumpStreak`, `rescueStreak`) + `lib/rep.ts` half-life already ship
- [ ] Roadmap/UI: Fire bar with 7-day dim animation, big `[Rescue a Friend]` button (search by nickname)
- [ ] Guard: `streakHalfReset` if gap>14d, `rescues` table or `localStorage K_RESCUE` + server check: one rescue per 14d per pair
- [ ] Bonus: Calendar streak badges (`checkPresenceAward`) — 3 check-ins/week = 🗓 badge
- **Ship test:** Set `K_LAST` to 3 days ago, see 1.7 decay, friend rescues, see 6.7

---

## How They Work Together (Student Story)

> Monday: Jay scouts "CHM moved" → 5 confirms via **Where's Class?** (you earn XP)  
> Tuesday: You ghost-vote "lab no reagents" via **Ghost Mode** 👻 (safe, counts)  
> Wednesday: You miss check-in, fire fades → Tunde **Rescues** you (you're back)  
> → You never opened docs. You just tapped 3 buttons and felt useful, safe, and seen.

## What Changed From The Old Jargon

| Before (crypto brain) | Now (student brain) | Same tech underneath |
|---|---|---|
| Ghost Witness Protocol `SHA256(prev\|action\|userId\|ts)` | **Ghost Mode** 👻 "I was here, but hidden" | `lib/ghostWitness.ts` + `physi_ghost_chain` |
| Scope Value Mining `quorum 8, 70%, +0.1/+0.5 Rep` | **Where's Class?** 📍 "5 friends agree → locked" | `lib/scopeMining.ts` + `physi_scope_votes` |
| ZK-Proof Authority `zkThresholdCheck` | **Keep The Fire** 🔥 fading fire + rescue | `lib/zkAuthority.ts` hidden, `lib/streak.ts` + `lib/rep.ts` decay |

**Rule: Student never sees the words** `quorum`, `rep`, `attestation`, `zk`, `sig`, `hash`, `threshold`. Devs see them in code comments only.

## For Devs — One-Week Ship Checklist

**Data:** No new tables needed for v1 (reuse existing):
- Ghost Mode → existing `rep_ghost_sig` + `physi_ghost_chain`; just `SELECT` with `CASE WHEN ghost THEN 'ghost' ELSE nickname END`
- Where's Class? → `physi_events` pending flow + `physi_scope_votes`/`verify_votes`
- Keep The Fire → `localStorage` + `physi_mining_logs` for rescue logs (add `rescue_pair` uniq if needed)

**APIs:**
- `POST /api/verify` → add `ghost?: boolean` param (2 lines)
- `POST /api/scopes` → same
- `GET /api/events` → add `?course=` filter for class subscriptions
- `POST /api/streak/rescue` → thin wrapper around `rescueStreak(friendId)`

**UI:** 3 components, 1 toggle, 1 banner, 1 button. That's it.

**Metrics to watch:**
- Ghost posts / day (anonymity used)
- Time from scout → locked (should be <15 mins at 5 confirms)
- Rescue rate (healthy = 20-30% of fades get rescued → social stickiness)

---

*Satoshi, but make it campus. No docs. Just tap.*
