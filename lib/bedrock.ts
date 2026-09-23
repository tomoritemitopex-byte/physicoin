/**
 * lib/bedrock.ts — BEDROCK v5.0 update rails.
 *
 * Each v5.0 behavior ships behind a kill-switch constant. A tripped rollback
 * trigger (see docs/INVERTED_AUDIT.md v5.0 record) is executed by flipping
 * the constant and redeploying — no code surgery. v5.x API changes are
 * additive-only (new fields; old fields redacted only where privacy demands).
 */

// Kill-switches — flip to false to roll back that item individually.
export const BEDROCK_V5 = {
  /** Quantized distance-to-lock (buckets, 60s server throttle). Rollback: exact `needed`. */
  quantizedTally: true,
  /** Blind flags + symmetric counter-flags + disputed badge. Rollback: badge off. */
  blindFlags: true,
  /** Petition succession (8 co-signs = auto-transfer). Rollback: petitions off. */
  petitionSuccession: true,
} as const;

// Bucket thresholds for distance-to-lock display.
export const TALLY_BUCKET_FULL = 4;

export function tallyBucket(needed: number): string {
  if (needed <= 0) return "Locked";
  if (needed === 1) return "Final push";
  if (needed <= 3) return "Closing in";
  return "4+ to go";
}

/** Dispute threshold: max(4, 10% of enrolled). Open events (no roster) → 4. */
export function disputeThreshold(memberCount: number | null): number {
  if (!memberCount || memberCount <= 0) return 4;
  return Math.max(4, Math.ceil(memberCount * 0.1));
}

/** Petition threshold: 8 co-signed members force creatorship transfer. */
export const PETITION_THRESHOLD = 8;

export type BadgeState = {
  struck: boolean;
  flags: number;
  counters: number;
  threshold: number;
};

/** Symmetric badge: struck iff flags hit threshold AND outnumber counters. */
export function computeBadge(flags: number, counters: number, memberCount: number | null): BadgeState {
  const threshold = disputeThreshold(memberCount);
  return { struck: flags >= threshold && flags > counters, flags, counters, threshold };
}
