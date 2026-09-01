/**
 * lib/presenceEcho.ts — Presence Echoes (anonymous pattern strength)
 * f(verifications × time_window × scope_match) → { echo_strength: 0-1, participant_count }
 * No identity leaks — count only.
 */

export type EchoResult = {
  echo_strength: number; // 0..1
  participant_count: number;
  label: string; // faint | steady | strong
};

function strengthLabel(s: number): string {
  if (s >= 0.7) return "strong signal";
  if (s >= 0.4) return "steady";
  return "faint";
}

/**
 * Server-side: calculate echo strength for an event.
 * Factors:
 * - verifications: total count for event (log-scaled)
 * - time_window: verifications in last 24h / 7d recency boost
 * - scope_match: verifications sharing same scope_value (campus resonance)
 */
export async function calculateEchoStrength(sql: any, eventId: string): Promise<EchoResult> {
  const fallback: EchoResult = { echo_strength: 0, participant_count: 0, label: "faint" };
  if (!sql || !eventId) return fallback;
  try {
    const eid = String(eventId);

    // Total verifications for event
    let total = 0;
    try {
      const r: any[] = await sql`SELECT COUNT(*)::int as c FROM physi_verifications WHERE event_id=${eid}` as any;
      total = Number(r[0]?.c ?? 0);
    } catch { total = 0; }

    if (total === 0) return { echo_strength: 0, participant_count: 0, label: "faint" };

    let recent24 = 0;
    let recent7d = 0;
    try {
      const r24: any[] = await sql`SELECT COUNT(*)::int as c FROM physi_verifications WHERE event_id=${eid} AND created_at >= NOW() - INTERVAL '24 hours'` as any;
      recent24 = Number(r24[0]?.c ?? 0);
      const r7: any[] = await sql`SELECT COUNT(*)::int as c FROM physi_verifications WHERE event_id=${eid} AND created_at >= NOW() - INTERVAL '7 days'` as any;
      recent7d = Number(r7[0]?.c ?? 0);
    } catch {}

    let scopeMatch = 0;
    try {
      // Count verifications for events sharing same scope_value
      const ev: any[] = await sql`SELECT scope_value FROM physi_events WHERE id=${eid} LIMIT 1` as any;
      const sv = ev[0]?.scope_value;
      if (sv) {
        const sRows: any[] = await sql`
          SELECT COUNT(*)::int as c
          FROM physi_verifications v
          JOIN physi_events e ON e.id = v.event_id
          WHERE lower(e.scope_value) = lower(${String(sv)})
        ` as any;
        scopeMatch = Number(sRows[0]?.c ?? 0);
      }
    } catch {}

    // Normalize factors
    const verifNorm = Math.min(1, Math.log2(total + 1) / Math.log2(12)); // 11 verifs → 1.0
    const recencyNorm = total > 0 ? Math.min(1, (recent24 * 1.0 + recent7d * 0.3) / Math.max(4, total)) : 0;
    const scopeNorm = Math.min(1, Math.log2(scopeMatch + 1) / Math.log2(20));

    // Weighted echo: 50% verif, 30% recency, 20% scope
    let echo = 0.5 * verifNorm + 0.3 * Math.min(1, recencyNorm) + 0.2 * scopeNorm;
    // Small boost if total >=3 (meaningful echo)
    if (total >= 3) echo = Math.min(1, echo + 0.05);
    if (total >= 6) echo = Math.min(1, echo + 0.07);

    echo = Number(Math.max(0, Math.min(1, echo)).toFixed(3));

    return { echo_strength: echo, participant_count: total, label: strengthLabel(echo) };
  } catch {
    return fallback;
  }
}

/**
 * Batch: for multiple eventIds, return map of EchoResult (parallel).
 */
export async function batchEchoStrength(sql: any, eventIds: string[]): Promise<Map<string, EchoResult>> {
  const map = new Map<string, EchoResult>();
  if (!sql || !eventIds.length) return map;
  const uniq = Array.from(new Set(eventIds.map(String).filter(Boolean)));
  await Promise.all(uniq.map(async (id) => {
    try { map.set(id, await calculateEchoStrength(sql, id)); }
    catch { map.set(id, { echo_strength: 0, participant_count: 0, label: "faint" }); }
  }));
  return map;
}
