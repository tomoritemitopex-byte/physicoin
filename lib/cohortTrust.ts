/**
 * lib/cohortTrust.ts — Cohort trust multiplier (server-side only)
 * Returns 1.0x default, 1.3x if same cohort pattern.
 * Never expose voter identity to client.
 */

import { computeCohortPattern, sameCohortPattern } from "./anonymousCoherence";

export const COHORT_TRUST_MULTIPLIER = 1.3;
export const COHORT_TRUST_DEFAULT = 1.0;

/**
 * Server-side: get trust multiplier between two users.
 * 1.3x if they share anonymous cohort pattern, else 1.0x.
 * Never call from client — no peer IDs exposed.
 */
export async function getCohortTrustMultiplier(sql: any, userId: string, voterId: string): Promise<number> {
  if (!sql || !userId || !voterId) return COHORT_TRUST_DEFAULT;
  try {
    const same = await sameCohortPattern(sql, String(userId), String(voterId));
    return same ? COHORT_TRUST_MULTIPLIER : COHORT_TRUST_DEFAULT;
  } catch {
    return COHORT_TRUST_DEFAULT;
  }
}

/**
 * Batch: for a set of voterIds, return map of multiplier relative to reference userId.
 * Anonymous: only multipliers, no peer identities leaked beyond caller.
 */
export async function getCohortMultipliers(sql: any, referenceUserId: string, voterIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!sql || !referenceUserId || !voterIds.length) return map;
  const uniq = Array.from(new Set(voterIds.map(String).filter(Boolean)));
  try {
    const refPattern = await computeCohortPattern(sql, String(referenceUserId));
    await Promise.all(uniq.map(async (vid) => {
      try {
        const p = await computeCohortPattern(sql, vid);
        const same = p.pattern.programme === refPattern.pattern.programme &&
          p.pattern.level === refPattern.pattern.level &&
          p.pattern.timeBucket === refPattern.pattern.timeBucket &&
          p.pattern.eventBucket === refPattern.pattern.eventBucket;
        map.set(vid, same ? COHORT_TRUST_MULTIPLIER : COHORT_TRUST_DEFAULT);
      } catch {
        map.set(vid, COHORT_TRUST_DEFAULT);
      }
    }));
  } catch {
    for (const id of uniq) map.set(id, COHORT_TRUST_DEFAULT);
  }
  return map;
}

/**
 * Cohesion-weighted: for a voter set, if voter shares cohort with ANY other voter in set, boost.
 * Used when counting weighted quorum anonymously (no single reference).
 */
export async function getCohesionMultipliers(sql: any, voterIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!sql || voterIds.length <= 1) {
    for (const id of voterIds) map.set(String(id), COHORT_TRUST_DEFAULT);
    return map;
  }
  const uniq = Array.from(new Set(voterIds.map(String).filter(Boolean)));
  try {
    // Fetch all patterns in parallel
    const patterns = new Map<string, Awaited<ReturnType<typeof computeCohortPattern>>>();
    await Promise.all(uniq.map(async (id) => {
      try { patterns.set(id, await computeCohortPattern(sql, id)); } catch {}
    }));
    for (const id of uniq) {
      const p = patterns.get(id);
      if (!p) { map.set(id, COHORT_TRUST_DEFAULT); continue; }
      let hasPeer = false;
      for (const other of uniq) {
        if (other === id) continue;
        const op = patterns.get(other);
        if (!op) continue;
        if (op.pattern.programme === p.pattern.programme &&
            op.pattern.level === p.pattern.level &&
            op.pattern.timeBucket === p.pattern.timeBucket &&
            op.pattern.eventBucket === p.pattern.eventBucket) {
          hasPeer = true; break;
        }
      }
      map.set(id, hasPeer ? COHORT_TRUST_MULTIPLIER : COHORT_TRUST_DEFAULT);
    }
  } catch {
    for (const id of uniq) map.set(id, COHORT_TRUST_DEFAULT);
  }
  return map;
}
