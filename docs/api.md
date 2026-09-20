# PhysiCoin API route table

Generated from tree + grep audit, 2026-09-20. Caller counts rot — regenerate
with the recipe at the bottom rather than hand-maintaining them.

Error shapes: most routes return `{ok, code, message}`. `timetable` is
mid-migration to `{ok, code, message, hint, retryAfter?}` (owner's error-hint
work, `lib/adapters/error.ts` + `lib/adapters/features/timetable.ts`).
Do not standardize error shapes until that work lands.

## Core routes (3+ callers)

| Route | Callers | Purpose |
|---|---|---|
| `/api/timetable` | 11 | Venue-change feed — the core read surface |
| `/api/auth/session` | 9 | Session create/check (handle auth; fresh tokens device-bound, see lib/auth.ts `dev`) |
| `/api/verify` | 6 | Yes/No vote ingest, quorum promotion |
| `/api/mining` | 5 | Daily check-in faucet, streak logs |
| `/api/stats` | 5 | Aggregated counts across `physi_*` |
| `/api/events` | 3 | Event CRUD + repeat/dedup helpers |
| `/api/profile` | 3 | Handle create/read, programme/level |
| `/api/logs` | 3 | Realtime log tail (admin, 3s poll) |
| `/api/scopes` | 3 | Scope-merge votes, 8-vote/70% quorum |

## Feature routes (1–2 callers each)

| Route | Callers | Owner |
|---|---|---|
| `/api/alerts/check` | 1 | alerts checker |
| `/api/bunk` | 1 | bunk radar |
| `/api/calendar/ics` | 1 | ICS export |
| `/api/cohort` | 1 | cohort trust |
| `/api/consensus` | 1 | consensus status |
| `/api/echo` | 1 | echo surface |
| `/api/events/dedup` | 1 | event dedup helper |
| `/api/events/repeat` | 1 | event repeat helper |
| `/api/faucet` | 1 + cron | weekly drip (cron Mon 06:00) |
| `/api/ghost-chain` | 1 | ghost chain receipts |
| `/api/ghosts` | 1 | ghost presence |
| `/api/halls/alias` | 2 | hall aliasing |
| `/api/halls/heat` | 1 | hall heat map |
| `/api/halls/resolve` | 2 | hall resolution |
| `/api/health` | 2 | `SELECT 1` ping + env check |
| `/api/notes` | 1 | notes |
| `/api/notes/unlock` | 1 | note unlock (1 $PHY) |
| `/api/prof/alias` | 1 | lecturer aliasing |
| `/api/schools` | 2 | school aggregate |
| `/api/schools/departments` | 2 | department aggregate |
| `/api/schools/dept-votes` | 1 | department votes |
| `/api/schools/disputes` | 2 | school disputes |
| `/api/schools/votes` | 1 | school votes |
| `/api/squad` | 1 | squad |
| `/api/squad/wave` | 1 | squad wave |
| `/api/streak/heatmap` | 1 | streak heatmap |
| `/api/vote-weight` | 2 | vote-weight badge |
| `/api/zk` | 1 | ZK threshold check |

## Zero-client routes — confirm consumer before touching

No callers in `app/`, `components/`, `hooks/`, or `lib/` (URL or adapter-id
match). All were touched for real features Sep 1–16, so treat as
server-to-server / external-consumer / security-pair endpoints, not dead code.

| Route | Last touch | Purpose |
|---|---|---|
| `/api/auth/logout` | Sep 2, auth lockdown | session revocation (revocation table) |
| `/api/header` | Sep 1, HMAC/SPV pair | daily header: merkleRoot + ghostTipRoot + HMAC |
| `/api/proof` | Sep 1, same pair | Merkle proof verify side |
| `/api/notify` | Aug 30, broadcast | Telegram/WhatsApp egress via `notifyCanonical` |
| `/api/prof/resolve` | Sep 14, DDL freeze | lecturer-name resolution |
| `/api/vision/parse` | Sep 16, lockdown | vision sessions (`maxDuration: 30`) |

## Infra

- Cron: `/api/faucet`, `0 6 * * 1` (Mon 06:00), in `vercel.json`.
- Rewrite: `/api/v3/:path*` → `https://physicoin-v3.vercel.app/api/:path*` (outbound only).
- Adapter dispatch is in-process (`lib/data.ts` → `getApiAdapter().handle()`),
  not HTTP — adapter ids counted as callers above.

## Regeneration recipe

```bash
find app/api -name "route.ts" | sort
for r in <path-without-app/api-prefix>; do
  grep -rl "api/$r" app/ components/ hooks/ lib/ 2>/dev/null \
    | grep -v "app/api/$r/" | wc -l
done
```
