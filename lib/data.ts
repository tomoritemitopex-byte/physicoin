import { getApiAdapter } from "@/lib/adapters";
import "server-only";

export type EventRow = {
  id: string; title: string; venue: string; event_date: string; event_time: string;
  scope_type: string; scope_value: string | null; status: string;
  created_at: string; created_by?: string | null;
  required_points?: number | string; vote_weight_yes?: number; vote_weight_no?: number;
  severity?: string;
};

export type StatsData = {
  ok: boolean;
  metrics?: { events?: number; events_by_status?: Record<string, number> };
  counts?: { physi_events?: number };
  recent?: Array<{ handle?: string; name?: string; title?: string }>;
};

type AdapterResponse = { ok: boolean; events?: EventRow[]; stats?: any; metrics?: any; counts?: any; recent?: any; error?: string };

/** Fetch timetable feed directly via the adapter — avoids HTTP roundtrip in SSR. */
export async function getTimetableFeed(): Promise<{ events: EventRow[]; ok: boolean; stats: any | null }> {
  try {
    const a = getApiAdapter("timetable");
    if (!a) return { events: [], ok: false, stats: null };
    const resp = await a.handle(new Request("http://localhost/api/timetable"));
    if (!resp.ok) return { events: [], ok: false, stats: null };
    const j = await resp.json() as AdapterResponse;
    if (j.ok === false) return { events: [], ok: false, stats: j.stats || null };
    return { events: j.events ?? [], ok: true, stats: j.stats || null };
  } catch {
    return { events: [], ok: false, stats: null };
  }
}

/** Fetch stats directly via the adapter — for landing page SSR. */
export async function getStatsData(): Promise<StatsData> {
  try {
    const a = getApiAdapter("stats");
    if (!a) return { ok: false };
    const resp = await a.handle(new Request("http://localhost/api/stats"));
    if (!resp.ok) return { ok: false };
    const j = await resp.json() as AdapterResponse;
    return {
      ok: j.ok !== false,
      metrics: j.metrics,
      counts: j.counts,
      recent: j.recent,
    };
  } catch {
    return { ok: false };
  }
}
