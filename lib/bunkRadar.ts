/**
 * lib/bunkRadar.ts — Class Bunk Radar helpers
 * Live class status: upcoming / happening / ended / no-show alert
 * Reuses presence time logic. Student-friendly: no jargon.
 */
export const BUNK_THRESHOLD = 3; // 3 anonymous confirmations triggers alert
export const BUNK_WINDOW_MIN = 30;

export type BunkStatus = "upcoming" | "happening" | "ended" | "no_show_alert";

export function liveStatus(event_date: string, event_time: string, nowMs: number = Date.now(), noShowCount: number = 0): BunkStatus {
  const t = String(event_time ?? "00:00").slice(0, 5);
  const iso = `${String(event_date).slice(0, 10)}T${t}:00+01:00`;
  let evMs = Date.parse(iso);
  if (isNaN(evMs)) evMs = new Date(`${event_date}T${t}:00`).getTime();
  const diffMin = (nowMs - evMs) / 60000;
  if (noShowCount >= BUNK_THRESHOLD) return "no_show_alert";
  if (diffMin < -15) return "upcoming";
  if (diffMin >= -15 && diffMin <= 60) return "happening";
  return "ended";
}

export function statusLabel(s: BunkStatus): string {
  if (s === "happening") return "Happening now";
  if (s === "no_show_alert") return "No-show alert";
  if (s === "upcoming") return "Coming up";
  return "Ended";
}

export function statusEmoji(s: BunkStatus): string {
  if (s === "happening") return "🟢";
  if (s === "no_show_alert") return "🚨";
  if (s === "upcoming") return "⏰";
  return "✅";
}
