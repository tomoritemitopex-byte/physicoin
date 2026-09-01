/**
 * lib/mempool.ts — Timetable UTXO mempool + RBF (Bitcoin primitive, student-native)
 * Slot = (scope_value, event_date, event_time ±30m, title_fuzzy)
 * Double-spend = two pending events claiming same slot with conflicting venue/time.
 * RBF: higher weighted-stake wins; votes accumulate on mempool entry, tip shown as "leading 6/8 vs 2/8".
 * Expiry: pending + expires_at < NOW() -> rejected (lazy + cron).
 */
export const MEMPOOL_EXPIRY_HOURS = 24;
export const MEMPOOL_TTL_MS = MEMPOOL_EXPIRY_HOURS * 3600 * 1000;
export const MEMPOOL_SLOT_WINDOW_MIN = 30;

export function normalizeTitle(s: string): string {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Levenshtein distance (pure JS, no deps)
export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let cur = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    const tmp = prev; prev = cur; cur = tmp;
  }
  return prev[n];
}

export function titleFuzzyMatch(a: string, b: string): boolean {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (na === nb) return true;
  if (na.length <= 3 || nb.length <= 3) return na === nb; // short titles require exact
  if (Math.abs(na.length - nb.length) > 2) return false;
  return levenshtein(na, nb) <= 2;
}

// backward compat: titleFuzzyKey now returns full normalized title for bucket safety
function titleFuzzyKey(title: string): string {
  return normalizeTitle(title);
}

function timeToMinutes(t: string): number {
  const s = String(t || "00:00").slice(0, 5);
  const [h, m] = s.split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}
export function withinWindow(aTime: string, bTime: string, windowMin = MEMPOOL_SLOT_WINDOW_MIN): boolean {
  return Math.abs(timeToMinutes(aTime) - timeToMinutes(bTime)) <= windowMin;
}
export type Slot = {
  scope_value: string | null;
  event_date: string; // YYYY-MM-DD
  event_time: string; // HH:MM or HH:MM:SS
  title: string;
};
export function slotKey(s: Slot): string {
  const scope = String(s.scope_value || "").trim().toLowerCase();
  const date = String(s.event_date).slice(0, 10);
  const fk = normalizeTitle(s.title);
  // include 12 chars to avoid false positives from 3-char prefix
  const keyPart = fk.slice(0, 12) || fk;
  return `${scope}::${date}::${keyPart}`;
}

/** Find competing claims: pending events in same UTXO slot */
export async function getCompetingClaims(sql: any, slot: Slot): Promise<any[]> {
  if (!sql) return [];
  const scope = slot.scope_value ? String(slot.scope_value).trim() : null;
  const date = String(slot.event_date).slice(0, 10);
  try {
    let rows: any[];
    if (scope) {
      rows = await sql`SELECT id, title, venue, event_date, event_time, scope_value, status, created_by, expires_at, created_at FROM physi_events WHERE status='pending' AND event_date=${date}::date AND lower(COALESCE(scope_value,''))=lower(${scope}) LIMIT 20` as any[];
    } else {
      rows = await sql`SELECT id, title, venue, event_date, event_time, scope_value, status, created_by, expires_at, created_at FROM physi_events WHERE status='pending' AND event_date=${date}::date AND (scope_value IS NULL OR scope_value='') LIMIT 20` as any[];
    }
    return (rows || []).filter((r: any) => {
      const t = String(r.title || "");
      if (!titleFuzzyMatch(t, slot.title)) return false;
      if (!withinWindow(String(r.event_time || "00:00").slice(0, 5), String(slot.event_time).slice(0, 5))) return false;
      return true;
    });
  } catch {
    return [];
  }
}

/** Is this slot already claimed by a pending event? */
export async function isDoubleSpend(sql: any, slot: Slot): Promise<boolean> {
  const claims = await getCompetingClaims(sql, slot);
  return claims.length > 0;
}

/** Lazy expiry: pending + expires_at < NOW() -> rejected. Returns count. */
export async function expireMempool(sql: any): Promise<number> {
  if (!sql) return 0;
  try {
    const r: any = await sql`UPDATE physi_events SET status='rejected', updated_at=NOW() WHERE status='pending' AND expires_at IS NOT NULL AND expires_at < NOW() RETURNING id`;
    return Array.isArray(r) ? r.length : 0;
  } catch {
    return 0;
  }
}

/** Build mempool slot grouping for Consensus Map: group pending events by slotKey */
export function groupBySlot(events: any[]): Map<string, any[]> {
  const m = new Map<string, any[]>();
  for (const e of events) {
    const k = slotKey({ scope_value: e.scope_value ?? null, event_date: String(e.event_date).slice(0, 10), event_time: String(e.event_time).slice(0, 5), title: String(e.title || "") });
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(e);
  }
  return m;
}

/** For a slot group, compute tip: venue/time with most weight. Simplified: most votes or earliest. */
export function pickTip(claims: any[]): { tip: any; contenders: any[] } | null {
  if (!claims.length) return null;
  const sorted = [...claims].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  return { tip: sorted[0], contenders: sorted.slice(1) };
}
