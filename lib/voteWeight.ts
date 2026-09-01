/**
 * lib/voteWeight.ts — Vote weight by history (weighted quorum)
 * Multiplier based on total peer activity: verifications + scope + hall + prof votes.
 * Thresholds: 0-4 → 0.5x, 5-19 → 1.0x, 20-49 → 1.25x, 50+ → 1.5x
 */

export const WEIGHT_TIERS = [
  { max: 4, weight: 0.5 },
  { max: 19, weight: 1.0 },
  { max: 49, weight: 1.25 },
  { max: Infinity, weight: 1.5 },
] as const;

export function weightFromTotal(total: number): number {
  const n = Math.max(0, Math.floor(Number(total) || 0));
  if (n <= 4) return 0.5;
  if (n <= 19) return 1.0;
  if (n <= 49) return 1.25;
  return 1.5;
}

export function weightLabel(w: number): string {
  return `${Number(w).toFixed(w === 1 ? 0 : 2).replace(/\.00$/, "")}×`;
}

/**
 * Compute vote weight for a single user by counting their history.
 * Requires live DB; returns 1.0 on error (safe fallback).
 */
export async function computeVoteWeight(sql: any, userId: string): Promise<number> {
  if (!sql || !userId) return 1.0;
  try {
    const id = String(userId);
    const [v1, v2, v3, v4] = await Promise.all([
      sql`SELECT COUNT(*)::int AS c FROM physi_verifications WHERE verifier_id=${id}`.then((r: any) => Number(r[0]?.c || 0)).catch(() => 0),
      sql`SELECT COUNT(*)::int AS c FROM physi_scope_votes WHERE voter_id=${id}`.then((r: any) => Number(r[0]?.c || 0)).catch(() => 0),
      sql`SELECT COUNT(*)::int AS c FROM physi_hall_alias_votes WHERE voter_id=${id}`.then((r: any) => Number(r[0]?.c || 0)).catch(() => 0),
      sql`SELECT COUNT(*)::int AS c FROM physi_prof_alias_votes WHERE voter_id=${id}`.then((r: any) => Number(r[0]?.c || 0)).catch(() => 0),
    ]);
    return weightFromTotal(v1 + v2 + v3 + v4);
  } catch {
    return 1.0;
  }
}

/**
 * Batch compute weights for a set of voterIds → Map.
 * Single round-trip per table via GROUP BY, plus uses vote_weight_cached if present.
 */
export async function getVoteWeights(sql: any, voterIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!sql || !voterIds.length) return map;
  const uniq = Array.from(new Set(voterIds.map(String).filter(Boolean)));
  if (!uniq.length) return map;
  // fast path: try cached column (single query) — saves 56 queries per vote
  try {
    const cached: any[] = await sql`SELECT id::text as id, vote_weight_cached, vote_count_total FROM physi_users WHERE id = ANY(${uniq}::uuid[])` as any;
    let allCached = cached.length === uniq.length;
    for (const r of cached) {
      const c = Number(r.vote_count_total ?? 0);
      // if column missing or zero, treat as not cached
      if (c === 0 && Number(r.vote_weight_cached) === 1) {
        allCached = false; break;
      }
    }
    if (allCached && cached.length) {
      for (const r of cached) map.set(String(r.id), Number(r.vote_weight_cached) || 1);
      return map;
    }
  } catch {}
  try {
    const counts = new Map<string, number>();
    for (const id of uniq) counts.set(id, 0);

    // Single CTE: 1 round-trip instead of 4×N (56 queries)
    try {
      const rows: any[] = await (sql.unsafe
        ? await sql.unsafe(`
          WITH counts AS (
            SELECT verifier_id::text AS id, COUNT(*)::int AS c FROM physi_verifications WHERE verifier_id = ANY($1::uuid[]) GROUP BY verifier_id
            UNION ALL SELECT voter_id::text, COUNT(*)::int FROM physi_scope_votes WHERE voter_id = ANY($1::uuid[]) GROUP BY voter_id
            UNION ALL SELECT voter_id::text, COUNT(*)::int FROM physi_hall_alias_votes WHERE voter_id = ANY($1::uuid[]) GROUP BY voter_id
            UNION ALL SELECT voter_id::text, COUNT(*)::int FROM physi_prof_alias_votes WHERE voter_id = ANY($1::uuid[]) GROUP BY voter_id
          ) SELECT id, SUM(c)::int AS total FROM counts GROUP BY id
        `, [uniq])
        : await sql`SELECT verifier_id::text as id, COUNT(*)::int as total FROM physi_verifications WHERE verifier_id = ANY(${uniq}::uuid[]) GROUP BY verifier_id UNION ALL SELECT voter_id::text, COUNT(*)::int FROM physi_scope_votes WHERE voter_id = ANY(${uniq}::uuid[]) GROUP BY voter_id`
      );
      // fallback to per-table if CTE failed
      if (Array.isArray(rows) && rows.length) {
        for (const r of rows) counts.set(String((r as any).id ?? (r as any).voter_id), (counts.get(String((r as any).id ?? (r as any).voter_id)) || 0) + Number((r as any).total || (r as any).c || 0));
        // if CTE returned grouped totals, use them
        if (rows[0] && (rows[0] as any).total !== undefined) {
          for (const r of rows) counts.set(String((r as any).id), Number((r as any).total || 0));
        }
      } else throw new Error("empty");
    } catch {
      // Try fast GROUP BY per table (4 queries, not 4*N)
      try {
        const [verifs, scope, hall, prof] = await Promise.all([
          sql`SELECT verifier_id::text as voter_id, COUNT(*)::int as c FROM physi_verifications WHERE verifier_id = ANY(${uniq}::uuid[]) GROUP BY verifier_id`.catch(() => [] as any[]),
          sql`SELECT voter_id::text as voter_id, COUNT(*)::int as c FROM physi_scope_votes WHERE voter_id = ANY(${uniq}::uuid[]) GROUP BY voter_id`.catch(() => [] as any[]),
          sql`SELECT voter_id::text as voter_id, COUNT(*)::int as c FROM physi_hall_alias_votes WHERE voter_id = ANY(${uniq}::uuid[]) GROUP BY voter_id`.catch(() => [] as any[]),
          sql`SELECT voter_id::text as voter_id, COUNT(*)::int as c FROM physi_prof_alias_votes WHERE voter_id = ANY(${uniq}::uuid[]) GROUP BY voter_id`.catch(() => [] as any[]),
        ]);
        for (const rows of [verifs, scope, hall, prof]) {
          for (const r of (rows as any[]) || []) {
            const id = String((r as any).voter_id);
            counts.set(id, (counts.get(id) || 0) + Number((r as any).c || 0));
          }
        }
      } catch {
        for (const id of uniq) {
          const w = await computeVoteWeight(sql, id);
          map.set(id, w);
        }
        return map;
      }
    }

    for (const id of Array.from(counts.keys())) {
      const total = counts.get(id) || 0;
      map.set(id, weightFromTotal(total));
    }
    // async refresh cache (fire-and-forget)
    try {
      for (const [id, w] of Array.from(map.entries())) {
        const total = counts.get(id) || 0;
        sql`UPDATE physi_users SET vote_count_total=${total}, vote_weight_cached=${w} WHERE id=${id}::uuid`.catch(()=>{});
      }
    } catch {}
    return map;
  } catch {
    for (const id of uniq) map.set(id, 1.0);
    return map;
  }
}

/**
 * Given weighted yes/no totals, decide quorum status (8 + 70%).
 */
export function weightedQuorumStatus(weightedYes: number, weightedNo: number, min = 8, ratio = 0.70): "pending" | "resolved" | "rejected" {
  const total = weightedYes + weightedNo;
  if (total < min) return "pending";
  if (weightedYes / total >= ratio) return "resolved";
  if (weightedNo / total >= ratio) return "rejected";
  return "pending";
}

export function scopeWeightedStatus(yesW: number, noW: number): "pending" | "merged" | "separate" {
  const s = weightedQuorumStatus(yesW, noW);
  if (s === "resolved") return "merged";
  if (s === "rejected") return "separate";
  return "pending";
}
