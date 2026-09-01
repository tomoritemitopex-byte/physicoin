/**
 * lib/anonymousCoherence.ts — Anonymous Coherence (cohort trust by pattern, never identity)
 * Buckets anonymous peers by (programme, level, event_types, verify_time_pattern)
 * Returns { cohort_size, pattern_strength } — NEVER user IDs.
 * No identity leaks. Pure anonymous cohort matching.
 */

export type CohortPattern = {
  programme: string;
  level: string;
  eventBucket: string; // dominant scope_type or 'general'
  timeBucket: string; // morning | afternoon | evening | night
};

export type CohortResult = {
  cohort_size: number;
  pattern_strength: number; // 0..1
  pattern: CohortPattern;
};

function timeBucketFromHour(h: number): string {
  if (h >= 5 && h < 12) return "morning";
  if (h >= 12 && h < 17) return "afternoon";
  if (h >= 17 && h < 22) return "evening";
  return "night";
}

function normalizeProgramme(p: string | null | undefined): string {
  if (!p) return "unknown";
  return String(p).trim().toLowerCase();
}
function normalizeLevel(l: string | null | undefined): string {
  if (!l) return "unknown";
  return String(l).trim().toLowerCase();
}

/**
 * Compute cohort pattern for a user — server-side only.
 * Buckets by (programme, level, dominant event scope_type, dominant verify hour bucket).
 * Then counts anonymous peers sharing same pattern.
 * Returns only counts, never IDs.
 */
export async function computeCohortPattern(sql: any, userId: string): Promise<CohortResult> {
  const fallback: CohortResult = {
    cohort_size: 0,
    pattern_strength: 0,
    pattern: { programme: "unknown", level: "unknown", eventBucket: "general", timeBucket: "morning" },
  };
  if (!sql || !userId) return fallback;
  try {
    const uid = String(userId);
    // Fetch user's programme/level
    const uRows: any[] = await sql`SELECT programme, level FROM physi_users WHERE id=${uid} LIMIT 1`;
    const u = uRows[0];
    if (!u) return fallback;
    const programme = normalizeProgramme(u.programme);
    const level = normalizeLevel(u.level);

    // Determine dominant scope_type from user's physi_events created or verifications
    let eventBucket = "general";
    try {
      // Prefer scope_type from events created_by user, fallback to general
      const eRows: any[] = await sql`SELECT scope_type, COUNT(*)::int as c FROM physi_events WHERE created_by=${uid} GROUP BY scope_type ORDER BY c DESC LIMIT 1` as any;
      if (eRows.length && eRows[0].scope_type) eventBucket = String(eRows[0].scope_type).toLowerCase();
      else {
        // Check verifications -> join events for scope_type
        const vRows: any[] = await sql`
          SELECT e.scope_type as scope_type, COUNT(*)::int as c
          FROM physi_verifications v
          JOIN physi_events e ON e.id = v.event_id
          WHERE v.verifier_id=${uid}
          GROUP BY e.scope_type ORDER BY c DESC LIMIT 1
        ` as any;
        if (vRows.length && vRows[0].scope_type) eventBucket = String(vRows[0].scope_type).toLowerCase();
      }
    } catch {}

    // Determine dominant time bucket from verifications created_at hour
    let timeBucket = "morning";
    try {
      const tRows: any[] = await sql`
        SELECT EXTRACT(HOUR FROM created_at)::int as hr, COUNT(*)::int as c
        FROM physi_verifications WHERE verifier_id=${uid}
        GROUP BY hr ORDER BY c DESC LIMIT 1
      ` as any;
      if (tRows.length) {
        timeBucket = timeBucketFromHour(Number(tRows[0].hr ?? 9));
      } else {
        // fallback: use user's creation hour
        const cr: any[] = await sql`SELECT EXTRACT(HOUR FROM created_at)::int as hr FROM physi_users WHERE id=${uid} LIMIT 1` as any;
        if (cr.length) timeBucket = timeBucketFromHour(Number(cr[0].hr ?? 9));
      }
    } catch {}

    const pattern: CohortPattern = { programme, level, eventBucket, timeBucket };

    // Count anonymous peers sharing same (programme, level) — base cohort
    // We add timeBucket + eventBucket nuance to pattern_strength, but cohort_size counts programme+level peers
    // to avoid tiny cohorts leaking identity via rare combos.
    let cohortSize = 0;
    try {
      // Count peers with same programme & level (anonymized pool size)
      const cRows: any[] = await sql`SELECT COUNT(*)::int as c FROM physi_users WHERE lower(programme)=${programme} AND lower(level)=${level}` as any;
      cohortSize = Number(cRows[0]?.c ?? 0);
      // Exclude self from count (anonymous peers only)
      if (cohortSize > 0) cohortSize = Math.max(0, cohortSize - 1);
    } catch {
      cohortSize = 0;
    }

    // Refine with timeBucket+eventBucket: pattern_strength reflects specificity
    // Strength = 0.4 base (programme+level) + 0.3 timeBucket match ratio + 0.3 eventBucket match
    let timeMatchCount = 0;
    let eventMatchCount = 0;
    try {
      // Approximate: count verifications in same time bucket among same programme/level users
      // We can't efficiently compute hour bucket in SQL for all users, so estimate via total verifications count normalization
      const vc: any[] = await sql`SELECT COUNT(*)::int as c FROM physi_verifications WHERE verifier_id=${uid}` as any;
      const myVerifs = Number(vc[0]?.c ?? 0);
      // Strength from activity: more verifs = stronger pattern signal (capped)
      const activityStrength = Math.min(1, myVerifs / 10);
      // Cohort size strength: logarithmic
      const cohortStrength = cohortSize > 0 ? Math.min(1, Math.log2(cohortSize + 1) / 4) : 0;
      const pattern_strength = Number((0.35 * cohortStrength + 0.35 * activityStrength + 0.30 * (eventBucket !== "general" ? 0.8 : 0.4)).toFixed(3));
      return { cohort_size: cohortSize, pattern_strength: Math.max(0, Math.min(1, pattern_strength)), pattern };
    } catch {
      const cohortStrength = cohortSize > 0 ? Math.min(1, Math.log2(cohortSize + 1) / 4) : 0;
      return { cohort_size: cohortSize, pattern_strength: Number((cohortStrength * 0.6).toFixed(3)), pattern };
    }
  } catch {
    return fallback;
  }
}

/**
 * Check if two users share cohort pattern (programme, level, timeBucket, eventBucket).
 * Used internally by cohortTrust — never expose to client.
 */
export async function sameCohortPattern(sql: any, userIdA: string, userIdB: string): Promise<boolean> {
  if (!sql || !userIdA || !userIdB) return false;
  if (String(userIdA) === String(userIdB)) return true;
  try {
    const a = await computeCohortPattern(sql, String(userIdA));
    const b = await computeCohortPattern(sql, String(userIdB));
    return a.pattern.programme === b.pattern.programme &&
      a.pattern.level === b.pattern.level &&
      a.pattern.timeBucket === b.pattern.timeBucket &&
      a.pattern.eventBucket === b.pattern.eventBucket;
  } catch {
    return false;
  }
}
