import { Search } from "lucide-react";
import Link from "next/link";
import WindingRoadStatic from "@/components/road/WindingRoadStatic";
import RoadClient from "@/components/road/RoadClient";
import ToastClient from "./ToastClient";
import QuizPost from "./QuizPost";

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
 * Renders header + stats + the static road scene (WindingRoadStatic) in
 * initial HTML. Only the interactive overlay (nodes, panels, feed,
 * ghosts) hydrates as client JS via WindingRoad / ToastClient.
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
    <div className="campus-day mx-auto max-w-[1280px] px-4 pb-[88px]">
      {/* Header controls — honest: search disabled with label, filter wired via links, Post wired to timetable */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone" />
          <input
            disabled
            aria-disabled="true"
            placeholder="Search — coming soon (use building levels below)"
            title="Search coming soon — filter by building and level pills on the road"
            className="h-10 w-full rounded-full border border-sky/30 bg-white pl-10 pr-3 text-sm text-ink/70 placeholder:text-stone/60 disabled:cursor-not-allowed disabled:opacity-70"
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-full border border-sky/30 bg-white p-1">
            {(["all", "advisory", "verified"] as const).map((f) => (
              <Link
                key={f}
                href={`/app/roadmap?filter=${f}`}
                aria-current={filterParam === f ? "page" : undefined}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                  filterParam === f
                    ? "bg-sky text-white shadow-[0_2px_8px_rgba(3,105,161,0.3)]"
                    : "text-stone hover:bg-sky/10"
                }`}
              >
                {f === "all" ? "All" : f === "advisory" ? "Pending" : "Verified"}
              </Link>
            ))}
          </div>

          <QuizPost />
        </div>
      </div>
      {/* Earn UI — honest: no fake localStorage +1, points to real check-in */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-full border border-emerald-500/15 bg-emerald-500/5 px-3 py-1.5 text-xs">
        <span className="font-mono font-bold text-emerald-700">Earn $PHY:</span>
        <span className="text-stone">Daily check-in · Verify on road (quorum bonus)</span>
        <Link href="/app/mining" className="ml-1 rounded-full bg-white px-2.5 py-1 font-semibold text-emerald-700 border border-emerald-500/20 hover:bg-emerald-50">Check in →</Link>
        <Link href="/app/profile" className="rounded-full bg-emerald-600 px-2.5 py-1 font-semibold text-white hover:bg-emerald-700">Wallet</Link>
      </div>

      {/* Stats bar — server-rendered from initial data */}
      <div className="mb-4 flex items-center gap-4 text-xs font-mono text-stone">
        <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-green" /> {events.length} events</span>
        <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-green" /> {events.filter(isVerified).length} verified</span>
        <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-amber" /> {events.filter(e => !isVerified(e)).length} advisory</span>
      </div>

      {/* Road: static SSR scene + interactive client overlay via RoadClient (wealth-loop + billion-interface) */}
      <div className="campus-day relative min-h-screen w-full overflow-y-auto px-2 pb-28" style={{ scrollSnapType: "y mandatory" }}>
        <WindingRoadStatic />
        <RoadClient events={events} />
      </div>

      {/* Toast — client-only, lazy */}
      <ToastClient />
    </div>
  );
}