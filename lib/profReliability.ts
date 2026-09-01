/**
 * lib/profReliability.ts — Prof reliability from historical physi_verifications
 * reliability = YES / total ; noShowRate = 1 - reliability
 * HIGH risk = noShowRate >=60% ; MEDIUM >=30% ; LOW otherwise
 * Uses lib/profMatch canonical key for grouping so 'Prof Adams' == 'adams' == 'Dr A. Adams'.
 */

import { profMatchKey } from "@/lib/profMatch";

export type RiskLevel = "HIGH" | "MEDIUM" | "LOW";

export function extractProfName(title: string): string | null {
  const t = String(title || "").trim();
  if (!t) return null;
  // Try explicit Prof/Dr prefix
  const m1 = t.match(/(?:Prof\.?|Dr\.?|Professor)\s+([A-Za-z][A-Za-z\s\-'\.]{1,30})/i);
  if (m1) {
    return normalizeProf(m1[1]);
  }
  // Try " - Prof Name" or " (Prof Name)" suffix
  const m2 = t.match(/[\-\(\[]\s*(?:Prof\.?|Dr\.?)?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\s*[\)\]]?\s*$/);
  if (m2) {
    const cand = normalizeProf(m2[1]);
    if (cand.split(" ").length >= 2) return cand;
  }
  return null;
}

function normalizeProf(s: string): string {
  return String(s).trim().replace(/\s+/g, " ").replace(/\.$/, "").slice(0, 60).toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export function normalizeProfKey(s: string | null | undefined): string {
  if (!s) return "";
  return profMatchKey(s);
}

export function riskFromReliability(reliability: number | null, total: number): RiskLevel {
  if (reliability == null || total < 3) return "LOW";
  const noShow = 1 - reliability;
  if (noShow >= 0.6) return "HIGH";
  if (noShow >= 0.3) return "MEDIUM";
  return "LOW";
}

export function riskFromNoShowRate(noShowRate: number): RiskLevel {
  if (noShowRate >= 0.6) return "HIGH";
  if (noShowRate >= 0.3) return "MEDIUM";
  return "LOW";
}

export type ProfStats = {
  prof_name: string;
  prof_key: string;
  total: number;
  yes: number;
  no: number;
  cancel: number;
  reliability: number;
  no_show_rate: number;
  risk: RiskLevel;
};

export function computeProfStats(profName: string, votes: Array<{ vote: string }>): ProfStats {
  const total = votes.length;
  const yes = votes.filter((v) => String(v.vote).toUpperCase() === "YES").length;
  const no = votes.filter((v) => String(v.vote).toUpperCase() === "NO").length;
  const cancel = votes.filter((v) => String(v.vote).toUpperCase() === "CANCEL").length;
  const reliability = total > 0 ? yes / total : 1;
  const no_show_rate = total > 0 ? 1 - reliability : 0;
  return {
    prof_name: profName,
    prof_key: profMatchKey(profName),
    total,
    yes,
    no,
    cancel,
    reliability,
    no_show_rate,
    risk: riskFromReliability(reliability, total),
  };
}

/** Group votes by canonical prof key (fuzzy) — for aggregated stats
 * If aliasMap is provided (resolved canonical per prof_group_key), merges variants into canonical.
 */
export function groupVotesByProf(
  rows: Array<{ prof_name: string | null; vote: string }>,
  aliasMap?: Map<string, string>
): Map<string, { display: string; votes: Array<{ vote: string }> }> {
  const m = new Map<string, { display: string; votes: Array<{ vote: string }> }>();
  for (const r of rows) {
    const raw = String(r.prof_name || "").trim();
    const keyRaw = profMatchKey(raw) || "__unknown__";
    // If resolved canonical exists for this group_key, use canonical's key
    let key = keyRaw;
    let display = raw;
    if (aliasMap && keyRaw !== "__unknown__") {
      const canon = aliasMap.get(keyRaw);
      if (canon) {
        key = profMatchKey(canon) || keyRaw;
        display = canon;
      }
    }
    if (!m.has(key)) m.set(key, { display, votes: [] });
    m.get(key)!.votes.push({ vote: r.vote });
    if (display.length > m.get(key)!.display.length) m.get(key)!.display = display;
    // if canonical provided, keep it as display
    if (aliasMap?.has(keyRaw) && m.get(key)!.display !== aliasMap.get(keyRaw)) {
      // prefer canonical
      const canon = aliasMap.get(keyRaw)!;
      if (canon) m.get(key)!.display = canon;
    }
  }
  return m;
}

/** Build aliasMap from resolved physi_prof_aliases rows: group_key -> canonical */
export function buildProfAliasMap(rows: Array<{ prof_group_key: string; canonical: string; status: string }>): Map<string,string> {
  const m = new Map<string,string>();
  for (const r of rows) if (String(r.status)==="resolved" && r.prof_group_key) m.set(String(r.prof_group_key).toLowerCase(), String(r.canonical));
  return m;
}

export async function resolveProfCanonical(profName: string | null | undefined, sql: any): Promise<string> {
  if (!profName) return "";
  const key = profMatchKey(profName);
  if (!key) return String(profName).trim();
  try {
    const rows = await sql`SELECT canonical FROM physi_prof_aliases WHERE prof_group_key=${key} AND status='resolved' ORDER BY votes_yes DESC LIMIT 1` as any[];
    if (rows.length && rows[0].canonical) return String(rows[0].canonical);
  } catch {}
  return String(profName).trim();
}

export function minutesUntil(event_date: string, event_time: string, nowMs = Date.now()): number {
  const t = String(event_time ?? "00:00").slice(0, 5);
  const d = String(event_date).slice(0, 10);
  const iso = `${d}T${t}:00+01:00`;
  let ms = Date.parse(iso);
  if (isNaN(ms)) ms = new Date(`${d}T${t}:00`).getTime();
  return (ms - nowMs) / 60000;
}
