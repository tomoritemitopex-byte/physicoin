# Error-hint migration — owner handoff

Uncommitted work in the tree (not mine — packaging for a decision, no changes
made by this doc). Two files, +59/−7:

- `lib/adapters/error.ts`
- `lib/adapters/features/timetable.ts`

## What the diff does

**`error.ts`** — machine-readable error hints ("Zero-style", for agent self-heal):
- New `ERROR_HINTS` map: 10 codes (`UNAUTHORIZED`, `SELF_VOUCH`,
  `INSUFFICIENT_COINS`, `INSUFFICIENT_STAKE`, `RATE_LIMITED`,
  `TOO_MANY_REQUESTS`, `BAD_INPUT`, `DB_NOT_CONFIGURED`, `BAD_SEVERITY`,
  `MISSING_FIELDS`). Each hint names the exact token/field to fix;
  rate-limit hints reference `retryAfter`.
- New `getErrorHint(code, detail?)` — falls back to `BAD_INPUT` for unknown codes.
- `errorResponse()` now injects `hint` + optional `retryAfter`/`detail` into
  every body (strips the internal `detail`/`hint`/`retryAfter` keys from spread).
- `logAndResponse()` adds a `Retry-After` header when the body carries `retryAfter`.

**`timetable.ts`** — new local `jsonError(code, status, opts?)` helper emitting
`{ok:false, code, message, hint, retryAfter?, detail?}` + `Retry-After` header,
and rewires 4 error sites through it: `DB_NOT_CONFIGURED` (503),
`UNAUTHORIZED` on PATCH (401), `BAD_INPUT` on JSON-parse failure (400),
`BAD_INPUT` on missing id (400). Per-site hints name the exact field and show
example payloads.

## What's incomplete (as left)

- Even `timetable.ts` is partial: the `NOT_FOUND` site below the rewires still
  returns bare `NextResponse.json({ok:false, code, message})` with no hint.
- **29 of 43 route files** still use bare `NextResponse.json` (sweep:
  `grep -rl "NextResponse.json" app/api/ | wc -l`). Full migration means
  touching most of them or routing them through `errorResponse`/`logAndResponse`.

## Decision needed (owner)

1. **Accept** — commit the two files as-is, then extend `jsonError`-style
   rewiring route by route (timetable first: finish `NOT_FOUND` + remaining sites).
2. **Reshape** — e.g. move `jsonError` into `error.ts` as shared `hintedError()`
   so the other 28 routes don't each reinvent it; keep per-site hints.
3. **Discard** — `git checkout -- lib/adapters/error.ts
   lib/adapters/features/timetable.ts` returns the tree to the
   `{ok, code, message}` shape documented in `docs/api.md`.

## Collision notes

- `docs/api.md` documents current shapes only and prescribes nothing — no doc
  churn either way. If accepted, update its header line to the hinted shape.
- Client copy in `app/app/timetable/page.tsx` matches on `code`/`message`
  (`UNAUTHORIZED`, `SELF_VOUCH`, `INSUFFICIENT_*`); extra `hint`/`retryAfter`
  keys are additive and ignored by the UI — no client breakage from accepting.
- The `Retry-After` header is new observable behavior for 429s; clients that
  retry aggressively should honor it once emitted beyond timetable.
