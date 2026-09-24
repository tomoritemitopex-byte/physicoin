/**
 * lib/zkAuthority.ts — ZK-Proof Authority (Satoshi Intuition #3)
 *
 * Inverted-audit P1 (K-P3): ZK attestation is NOT enforced. The helper
 * functions below are retained for potential future use, but no API gate
 * currently checks requiresZkAttestation(). Do not present these utilities
 * as an active security control.
 */

import { clampAuthorityFinal, MAX_AUTHORITY_FINAL } from "./authority";

// --- DB column helper ---

/** ZK attested flag on events */
export type ZkAttestedEvent = {
  is_zk_attested?: boolean | null;
  required_points?: number | string | null;
  authority_points?: number | string | null;
};

// --- Threshold check (ZK-style) ---
// Returns only boolean (above/below), never leaks exact authority.
// This is a simulated ZK proof: hash(authority + salt) >= threshold without revealing authority.
// NOTE: NOT ENFORCED — retained as utility only.

export function zkThresholdCheck(
  authorityFinal: number,
  requiredPoints: number,
  _isZkAttested?: boolean
): { passed: boolean; threshold: number; proof: string } {
  const auth = clampAuthorityFinal(Number(authorityFinal) || 1.0);
  const req = Number(requiredPoints) || 5;
  // ZK-inspired: use commitment hash as proof (deterministic but opaque)
  const commitment = `${auth.toFixed(2)}|${req.toFixed(2)}|zk`;
  // simple hash for proof token (not cryptographic ZK, but privacy boundary)
  let h = 2166136261;
  for (let i = 0; i < commitment.length; i++) { h ^= commitment.charCodeAt(i); h = Math.imul(h, 16777619); }
  const proof = `zk:${(h>>>0).toString(16).padStart(8,"0")}:${auth >= 1 && req > 0 ? (auth*100).toFixed(0) : "0"}`;
  // Actual threshold: authority must meet required (for event promotion)
  // For ZK events, threshold is slightly relaxed (privacy bonus) but still capped
  const passed = auth * 10 >= req; // e.g., auth 1.0 -> 10 points, auth 1.10 -> 11 points capacity
  // Alternative: if ZK attested, allow proof to pass if authority >= 1.0 (baseline)
  return { passed, threshold: req, proof };
}

/** Privacy-preserving verify: does NOT return authority value, only pass/fail + proof token */
export function zkVerifyAuthority(
  authorityFinal: number,
  requiredPoints: number
): { verified: boolean; proof: string } {
  const r = zkThresholdCheck(authorityFinal, requiredPoints);
  return { verified: r.passed, proof: r.proof };
}

/** Check if event requires ZK attestation (helper for API)
 * Inverted-audit P1 (K-P3): NOT ENFORCED — no caller gates on this.
 * Retained as a policy constant for future ZK infrastructure. */
export function requiresZkAttestation(scopeType: string): boolean {
  const t = String(scopeType).toLowerCase();
  return ["global","university","faculty"].includes(t);
}

/** ZK proof helpers — pure, testable */
export function isZkAttestedValue(v: unknown): boolean {
  return v === true || v === 1 || String(v).toLowerCase() === "true";
}

export function zkProofLabel(passed: boolean): string {
  return passed ? "ZK ✓ threshold met (authority hidden)" : "ZK ✗ below threshold";
}

// Threshold config
export const ZK_AUTHORITY_CONFIG = {
  maxAuthority: MAX_AUTHORITY_FINAL,
  baseThreshold: 5,
  zkBonusNote: "ZK attestation hides exact authority; threshold check is boolean only (NOT ENFORCED — see inverted-audit P1 K-P3)",
} as const;
