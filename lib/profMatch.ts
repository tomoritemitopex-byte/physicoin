/**
 * lib/profMatch.ts — canonical prof name fuzzy matching + peer-voted alias deduper
 * Same prof appears as 'Prof Adams', 'Adams', 'Prof. A. Adams', 'Mr Adams', etc.
 * Fuzzy normalization is ONLY for initial proposal grouping (prof_group_key = last-word).
 * The canonical name is decided by students via peer voting (physi_prof_aliases).
 * Quorum: 8 votes + 70% consensus (reuses hallDeduper / scopeMining pattern).
 */

const TITLE_GLOBAL = /^(?:prof\.?|professor|dr\.?|mr\.?|mrs\.?|ms\.?)\s+/gi;

export function normalizeProfName(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = String(raw).trim().toLowerCase();
  let prev = "";
  while (prev !== s) {
    prev = s;
    s = s.replace(TITLE_GLOBAL, "").trim();
  }
  s = s.replace(/[.,;:'"`()\[\]]/g, " ").replace(/\s+/g, " ").trim();
  const parts = s.split(" ").filter(Boolean);
  if (parts.length >= 2) {
    while (parts.length > 1 && parts[0].length === 1) parts.shift();
  }
  const last = parts[parts.length - 1] || "";
  return last.replace(/[^a-z0-9-]/g, "").trim();
}

export function profMatchKey(name: string | null | undefined): string {
  return normalizeProfName(name);
}

/** Prof deduper quorum (same as hallDeduper) */
export const PROF_QUORUM_MIN = 8;
export const PROF_QUORUM_RATIO = 0.70;

export function profQuorumStatus(yes: number, no: number): "pending" | "resolved" | "rejected" {
  const total = yes + no;
  if (total < PROF_QUORUM_MIN) return "pending";
  if (yes / total >= PROF_QUORUM_RATIO) return "resolved";
  if (no / total >= PROF_QUORUM_RATIO) return "rejected";
  return "pending";
}

/** Display name: cleaned but preserves casing for UI (used as initial canonical proposal) */
export function displayProfName(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = String(raw).trim().replace(/\s+/g, " ");
  let prev = "";
  while (prev !== s) {
    prev = s;
    s = s.replace(/^(?:prof\.?|professor|dr\.?|mr\.?|mrs\.?|ms\.?)\s+/i, "").trim();
  }
  s = s.replace(/^[A-Za-z]\.\s+/, "").trim();
  s = s.replace(/[.,;]+$/g, "").trim();
  if (!s) return "";
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

/** true if two raw names refer to same prof (by last-name key) — for initial grouping only */
export function sameProf(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = profMatchKey(a);
  const kb = profMatchKey(b);
  if (!ka || !kb) return false;
  return ka === kb;
}

/** Build prof_group_key for alias proposals — canonical grouping key */
export function profGroupKey(raw: string | null | undefined): string {
  return profMatchKey(raw);
}
