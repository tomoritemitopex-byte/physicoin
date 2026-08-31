# Authority Math — PHYSI

> *“Don't trust — verify.”* — Satoshi Nakamoto

## Current Formula (No Attestations Phase)

```
authority_base   = 1.00   (fixed, server-set)
authority_final  = 1.00   (fixed, server-computed)
```

**No status, role, level, or self-declared field grants authority.**

Every user gets `authority_final = 1.00`. Period.

## Verification

You can verify this yourself in a single SQL query:

```sql
-- Every user should have authority_final = 1.00
SELECT nickname, authority_base, authority_final FROM physi_users;
```

Expected result:
```
 nickname  | authority_base | authority_final
-----------+-----------------+-----------------
 alex_02   |            1.00 |            1.00
 bisola_11 |            1.00 |            1.00
```

## Why No Bonus?

Satoshi Section 2: *"We define an electronic coin as a chain of digital signatures."*

Today's `statuses` field is an **unverified string array**. A user can type `"SUG President"` and claim kingship.
Without a cryptographic attestation (ed25519 signature from a known issuer), `statuses` is just metadata — it
does not affect weight.

## Capped Authority (Interim Safety)

Until real attestations exist, the server enforces:

```
MAX_AUTHORITY_FINAL = 1.10
clampAuthorityFinal(x) = min(1.10, max(1.0, x))
```

This cap is applied in `lib/authority.ts` as a safety net on every write path.
It will be removed only when `physi_attestations` table ships with signed proofs.

## Future Formula (Attested Phase)

When `physi_attestations` lands, the formula becomes:

```
authority_base   = 1.00
authority_final  = min(1.10, 1.0 + 0.05 * COUNT(valid_attestations))
```

Each **cryptographically verified** attestation adds +0.05:
- `sig issuer=FUHSI_REGISTRAR signed "SUG President: alice 2026"` → +0.05
- `sig issuer=SUG signed "Class Rep: alice 2026"` → +0.05
- Max 2 attestations = +0.10 → authority_final = 1.10 (the cap)

Without sig, weight = 1.0. Pure.

## Vote Weight

In `/api/verify` (POST), the weight used is:

```
w = authority_final                     — standard vote
w = authority_final * 0.5               — NO vote (half-weight penalty)
w = authority_final                     — CANCEL (no-op, witness only)
```

## Satoshi Test

- ✅ Can I verify Alice's weight without trusting Alice? **Yes** — query `physi_users.authority_final`, always 1.00.
- ✅ Can Bob (1.0×) outvote Alice (1.0×)? **Yes** — one-to-one, no kings.
- ✅ Can the system survive a fake "President" claim? **Yes** — statuses are ignored in math.

---

*Source: SATOSHI_QUANTUM_ROAST__PHYSI.md, Section 1.3 — "Replace `statuses: string[]` self-declare with `attestations: { issuer_pubkey, claim, sig }[]`"*
