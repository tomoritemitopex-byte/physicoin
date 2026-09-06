import { getApiAdapter } from "@/lib/adapters";
import "server-only";

export type EventRow = {
  id: string; title: string; venue: string; event_date: string; event_time: string;
  scope_type: string; scope_value: string | null; status: string;
  created_at: string; created_by?: string | null;
  required_points?: number | string; vote_weight_yes?: number; vote_weight_no?: number;
  severity?: string;
};

/** Fetch timetable feed directly via the adapter — avoids HTTP roundtrip in SSR. */
export async function getTimetableFeed() {
  try {
    const a = getApiAdapter("timetable");
    if (!a) return { events: [], ok: false, stats: null };
    const req = new Request("http://localhost/api/timetable");
    const resp = await a.handle(req);
    if (!resp.ok) return { events: [], ok: false, stats: null };
    const j = await resp.json();
    if (j.ok === false) return { events: [], ok: false, stats: j.stats || null };
    return { events: j.events ?? [], ok: true, stats: j.stats || null };
  } catch {
    return { events: [], ok: false, stats: null };
  }
}
