/**
 * lib/cohortTrust.ts — Cohort trust multiplier (server-side only)
 * Returns 1.0x default, 1.3x if same cohort pattern.
 * Never expose voter identity to client.
 * N+1 fix: batch query via single SELECT + cached JSONB
 */

import { computeCohortPattern, sameCohortPattern } from "./anonymousCoherence";

export const COHORT_TRUST_MULTIPLIER = 1.3;
export const COHORT_TRUST_DEFAULT = 1.0;

const COHORT_CACHE_TTL_MS = 5 * 60 * 1000;

async function batchGetPatterns(sql: any, ids: string[]): Promise<Map<string, any>> {
  const map = new Map<string, any>();
  if (!ids.length) return map;
  try {
    const rows: any[] = await sql`SELECT id::text as id, cohort_pattern_cached, cohort_pattern_updated_at FROM physi_users WHERE id = ANY(${ids}::uuid[])` as any;
    for (const r of rows) {
      const cached = r.cohort_pattern_cached;
      const updated = r.cohort_pattern_updated_at ? new Date(r.cohort_pattern_updated_at).getTime() : 0;
      if (cached && cached.pattern && Date.now() - updated < COHORT_CACHE_TTL_MS) {
        map.set(String(r.id), cached);
      }
    }
  } catch {}
  // for missing, compute lazily (only stale entries)
  const missing = ids.filter(id => !map.has(id));
  if (missing.length) {
    // compute missing in parallel but only for stale — typically small
    // Use bulk fetch for cohort_size + attempt to compute via computeCohortPattern which itself uses batch-friendly queries
    await Promise.all(missing.map(async (id) => {
      try {
        const c = await computeCohortPattern(sql, id);
        map.set(id, c);
      } catch {}
    }));
  }
  return map;
}

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
 * Batch fix: single DB round-trip for cached patterns + parallel only for stale.
 */
export async function getCohortMultipliers(sql: any, referenceUserId: string, voterIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!sql || !referenceUserId || !voterIds.length) return map;
  const uniq = Array.from(new Set(voterIds.map(String).filter(Boolean)));
  try {
    const allIds = Array.from(new Set([...uniq, String(referenceUserId)]));
    const patterns = await batchGetPatterns(sql, allIds);
    const ref = patterns.get(String(referenceUserId));
    if (!ref) {
      // fallback to computeCohortPattern directly if not in batch
      const refFallback = await computeCohortPattern(sql, String(referenceUserId));
      for (const vid of uniq) {
        const p = patterns.get(vid);
        if (!p) { map.set(vid, COHORT_TRUST_DEFAULT); continue; }
        const same = p.pattern.programme === refFallback.pattern.programme &&
          p.pattern.level === refFallback.pattern.level &&
          p.pattern.timeBucket === refFallback.pattern.timeBucket &&
          p.pattern.eventBucket === refFallback.pattern.eventBucket;
        map.set(vid, same ? COHORT_TRUST_MULTIPLIER : COHORT_TRUST_DEFAULT);
      }
      return map;
    }
    for (const vid of uniq) {
      const p = patterns.get(vid);
      if (!p) { map.set(vid, COHORT_TRUST_DEFAULT); continue; }
      const same = p.pattern.programme === ref.pattern.programme &&
        p.pattern.level === ref.pattern.level &&
        p.pattern.timeBucket === ref.pattern.timeBucket &&
        p.pattern.eventBucket === ref.pattern.eventBucket;
      map.set(vid, same ? COHORT_TRUST_MULTIPLIER : COHORT_TRUST_DEFAULT);
    }
  } catch {
    for (const id of uniq) map.set(id, COHORT_TRUST_DEFAULT);
  }
  return map;
}

/**
 * Cohesion-weighted: for a voter set, if voter shares cohort with ANY other voter in set, boost.
 * Used when counting weighted quorum anonymously (no single reference).
 * Batch fix: single SELECT for all cached patterns, then O(N^2) in-memory comparison.
 */
export async function getCohesionMultipliers(sql: any, voterIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!sql || voterIds.length <= 1) {
    for (const id of voterIds) map.set(String(id), COHORT_TRUST_DEFAULT);
    return map;
  }
  const uniq = Array.from(new Set(voterIds.map(String).filter(Boolean)));
  try {
    const patterns = await batchGetPatterns(sql, uniq);
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
