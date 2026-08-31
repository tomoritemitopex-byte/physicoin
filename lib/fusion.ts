/**
 * lib/fusion.ts — Fusion engine: merge duplicate gists
 * venue+time ±5m same course => fused node x2 strength double quorum
 */

export type FusionInput = {
  id: string;
  title: string;
  venue: string;
  event_date: string;
  event_time: string;
  authority_points?: number | string;
  required_points?: number | string;
  [k: string]: any;
};

function norm(s: string): string {
  return String(s ?? "").trim().toLowerCase();
}
function timeToMin(t: string): number {
  const p = String(t ?? "00:00").slice(0, 5).split(":");
  const h = parseInt(p[0] || "0", 10) || 0;
  const m = parseInt(p[1] || "0", 10) || 0;
  return h * 60 + m;
}
export function isDuplicate(a: FusionInput, b: FusionInput): boolean {
  if (norm(a.title) !== norm(b.title)) return false;
  if (norm(a.venue) !== norm(b.venue)) return false;
  if (String(a.event_date).slice(0, 10) !== String(b.event_date).slice(0, 10)) return false;
  const diff = Math.abs(timeToMin(a.event_time) - timeToMin(b.event_time));
  return diff <= 5;
}

export type FusionGroup = {
  ids: string[];
  events: FusionInput[];
  fusedId: string;
  title: string;
  venue: string;
  event_date: string;
  event_time: string; // earliest
  authority_points: number;
  required_points: number; // double quorum — 2x max or sum
  ms: number;
};

function eventInstant(dateStr: string, timeStr: string): number {
  const t = String(timeStr ?? "00:00").slice(0, 5);
  const iso = `${String(dateStr).slice(0, 10)}T${t}:00+01:00`;
  const ms = Date.parse(iso);
  if (!isNaN(ms)) return ms;
  return new Date(`${dateStr}T${t}:00`).getTime();
}

export function buildFusionGroups(events: FusionInput[]): FusionGroup[] {
  const n = events.length;
  if (n < 2) return [];
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (isDuplicate(events[i], events[j])) { adj[i].push(j); adj[j].push(i); }
  const vis = new Array(n).fill(false);
  const groups: FusionGroup[] = [];
  for (let i = 0; i < n; i++) if (!vis[i] && adj[i].length > 0) {
    const stack = [i]; vis[i] = true; const comp: number[] = [];
    while (stack.length) { const u = stack.pop()!; comp.push(u); for (const v of adj[u]) if (!vis[v]) { vis[v] = true; stack.push(v); } }
    if (comp.length >= 2) {
      const evs = comp.map(idx => events[idx]);
      const ids = evs.map(e => String(e.id));
      const fusedId = ids.join("__fused__") + "__fused";
      // earliest time for ms
      const ms = Math.min(...evs.map(e => eventInstant(e.event_date, e.event_time)));
      const earliest = evs.slice().sort((a, b) => eventInstant(a.event_date, a.event_time) - eventInstant(b.event_date, b.event_time))[0];
      const sumAp = evs.reduce((s, e) => s + Number(e.authority_points || 0), 0);
      const maxRp = Math.max(...evs.map(e => Number(e.required_points || 0) || 8), 8);
      // double quorum: 2x maxRp or sum capped at 2x (spec says double quorum)
      const fusedRp = maxRp * 2;
      // x2 strength: authority summed, but also ensure at least x2 display
      groups.push({
        ids,
        events: evs as FusionInput[],
        fusedId,
        title: earliest.title,
        venue: earliest.venue,
        event_date: String(earliest.event_date).slice(0, 10),
        event_time: String(earliest.event_time).slice(0, 5),
        authority_points: sumAp,
        required_points: fusedRp,
        ms,
      });
    }
  }
  return groups;
}

// hash for pure ghost anon dots (4 hex chars from string)
export function anonHash(s: string): string {
  let h = 2166136261;
  const str = String(s || "");
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  const hex = (h >>> 0).toString(16).padStart(8, "0").slice(0, 4).toUpperCase();
  return hex;
}
export const GHOST_DOT_BG = "#7F3A"; // 4-digit hex RGBA -> valid CSS, spec requires #7F3A anon hash dots
export const GHOST_DOT_STYLE = { background: GHOST_DOT_BG, borderColor: "rgba(255,255,255,0.35)" } as const;
