/**
 * lib/profReliability.ts — Prof reliability from historical physi_verifications
 * reliability = YES / total ; noShowRate = 1 - reliability
 * HIGH risk = noShowRate >=60% ; MEDIUM >=30% ; LOW otherwise
 */

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
  // Fallback: first 2-3 words if title looks like "BIO 101 Prof Smith" split
  // Use prof_name column when available; this is heuristic fallback
  return null;
}

function normalizeProf(s: string): string {
  return String(s).trim().replace(/\s+/g, " ").replace(/\.$/, "").slice(0, 60).toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export function normalizeProfKey(s: string | null | undefined): string {
  if (!s) return "";
  return String(s).trim().toLowerCase().replace(/\s+/g, " ");
}

export function riskFromReliability(reliability: number | null, total: number): RiskLevel {
  if (reliability == null || total < 3) return "LOW"; // not enough data = LOW
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
  total: number;
  yes: number;
  no: number;
  cancel: number;
  reliability: number; // 0..1
  no_show_rate: number; // 0..1
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
    total,
    yes,
    no,
    cancel,
    reliability,
    no_show_rate,
    risk: riskFromReliability(reliability, total),
  };
}

export function minutesUntil(event_date: string, event_time: string, nowMs = Date.now()): number {
  const t = String(event_time ?? "00:00").slice(0, 5);
  const d = String(event_date).slice(0, 10);
  const iso = `${d}T${t}:00+01:00`;
  let ms = Date.parse(iso);
  if (isNaN(ms)) ms = new Date(`${d}T${t}:00`).getTime();
  return (ms - nowMs) / 60000;
}
