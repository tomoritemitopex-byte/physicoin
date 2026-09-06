import { Search, Plus } from "lucide-react";
import WindingRoad from "@/components/road/WindingRoad";
import ToastClient from "./ToastClient";

type EventRow = {
  id: string; title: string; venue: string; event_date: string; event_time: string;
  scope_type: string; scope_value: string | null; status: string;
  created_at: string; created_by?: string | null;
  required_points?: number | string; vote_weight_yes?: number; vote_weight_no?: number;
  severity?: string;
};

function isVerified(ev: EventRow) {
  if (ev.status === "verified") return true;
  const yes = Number(ev.vote_weight_yes ?? 0);
  return yes >= (Number(ev.required_points ?? 0) || 8);
}

/**
 * RoadmapShell — Server Component.
 * Renders the full road + events in initial HTML (no spinner).
 * Interactive parts (voting, search) are handled by client sub-components.
 */
export default function RoadmapShell({
  initialEvents,
  initialOk,
  filterParam,
  fallback,
}: {
  initialEvents: EventRow[];
  initialOk: boolean;
  filterParam: string;
  fallback: React.ReactNode;
}) {
  const events = initialEvents;

  return (
    <div className="mx-auto max-w-[1280px] px-4 pb-[88px]">
      {/* Header controls */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <div className="h-10 w-full rounded-full border border-white/10 bg-[#1a5f48]/60 pl-10 pr-3 flex items-center text-sm text-slate-400">
            Search venues, titles...
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-full border border-white/10 bg-[#1a5f48]/60 p-1">
            {(["all", "advisory", "verified"] as const).map((f) => (
              <span
                key={f}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                  filterParam === f
                    ? "bg-[#34d399] text-[#022c1e] shadow-[0_2px_8px_rgba(52,211,153,0.3)]"
                    : "text-slate-400"
                }`}
              >
                {f === "all" ? "All" : f === "advisory" ? "Pending" : "Verified"}
              </span>
            ))}
          </div>

          <button
            className="inline-flex items-center gap-1.5 rounded-full bg-[#34d399] px-4 py-2 text-sm font-semibold text-[#022c1e] hover:bg-[#6ee7b7] transition"
            aria-label="Post a new event"
          >
            <Plus className="h-4 w-4" /> Post
          </button>
        </div>
      </div>

      {/* Stats bar — server-rendered from initial data */}
      <div className="mb-4 flex items-center gap-4 text-xs font-mono text-slate-400">
        <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-[#34d399]" /> {events.length} events</span>
        <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" /> {events.filter(isVerified).length} verified</span>
        <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-[#f59e0b]" /> {events.filter(e => !isVerified(e)).length} advisory</span>
      </div>

      {/* WindingRoad — server-rendered static SVG + event cards */}
      <WindingRoad events={events} />

      {/* Toast — client-only, lazy */}
      <ToastClient />
    </div>
  );
}
