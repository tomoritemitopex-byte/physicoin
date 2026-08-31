/**
 * lib/authority.ts — Authority weight engine (Satoshi-compliant)
 *
 * REPLACES the old string-matching "statuses includes('SUG')" king-busting logic.
 *
 * Design (per SATOSHI_QUANTUM_ROAST P0-1):
 *   - authority_base: fixed at 1.00 for all users (no self-declared bonuses)
 *   - authority_final: computed server-side via computeAuthorityFinal(statuses)
 *   - Cap: authority_final ≤ 1.10 until real cryptographic attestations land
 *   - Documented formula: see /docs/authority-math.md
 *
 * The statuses array is informational metadata from the UI. It does NOT
 * grant authority by keyword. Only verified attestations (future) can raise
 * weight — for now, everything stays at 1.00.
 */

export const MAX_AUTHORITY_FINAL = 1.10;

/**
 * Compute authority_final from a user's statuses + attestations.
 *
 * Current reality: no cryptographic attestations exist yet.
 * So every user gets the base 1.00. No "SUG President" → 1.45x.
 *
 * Future state: when /api/attestations lands with signed proofs,
 * add +0.05 per verified attestation, capped at MAX_AUTHORITY_FINAL.
 *
 * @param statuses  - informational labels (ignored for math until signed)
 * @param attestations - future: array of { issuer, claim, sig } to verify
 * @returns authority_final, capped at MAX_AUTHORITY_FINAL
 */
export function computeAuthorityFinal(
  _statuses?: string[] | null,
  _attestations?: unknown[] | null
): number {
  // Until real attestations exist, weight is pure 1.0
  // This is the "no trusted third party" floor Satoshi demands.
  return 1.0;
}

/**
 * Clamp wrapper — ensures no authority_final ever exceeds the cap.
 * Used as a safety net on every write path.
 */
export function clampAuthorityFinal(value: number): number {
  const v = Number(value) || 1.0;
  return Math.min(MAX_AUTHORITY_FINAL, Math.max(1.0, v));
}

/**
 * Human-readable label for the authority math.
 */
export function authorityMathLabel(): string {
  return `base 1.00 · cap ${MAX_AUTHORITY_FINAL.toFixed(2)} · attestations required for bonus`;
}
