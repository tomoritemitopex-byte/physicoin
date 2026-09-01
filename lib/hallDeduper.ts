/**
 * lib/hallDeduper.ts — Hall Deduper pure logic
 * Mirrors scopeMining quorum pattern: 8 votes + 70% consensus
 */
export const HALL_QUORUM_MIN = 8;
export const HALL_QUORUM_RATIO = 0.70;

export function hallGroupKey(ev: { scope_value: string|null; event_date: string; event_time: string; title: string }): string {
  const progLevel = String(ev.scope_value||"").trim().toLowerCase();
  const day = dayOfWeek(String(ev.event_date).slice(0,10));
  const time = String(ev.event_time).slice(0,5);
  const subj = String(ev.title||"").trim().toLowerCase();
  return `${progLevel}::${day}::${time}::${subj}`;
}

export function dayOfWeek(dateStr: string): string {
  try { const d=new Date(dateStr+"T00:00:00Z"); return String(d.getUTCDay()); } catch { return "unknown"; }
}

export function hallQuorumStatus(yes:number,no:number): "pending"|"resolved"|"rejected" {
  const total=yes+no;
  if(total < HALL_QUORUM_MIN) return "pending";
  if(yes/total >= HALL_QUORUM_RATIO) return "resolved";
  if(no/total >= HALL_QUORUM_RATIO) return "rejected";
  return "pending";
}
