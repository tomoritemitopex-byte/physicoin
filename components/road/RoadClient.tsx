"use client";
import QuizPost from "./QuizPost";
import WindingRoad from "./WindingRoad";

/**
 * RoadClient — wealth-loop + billion-interface will
 * 1-tap disguised quiz (no static form) + clean single-bar verify
 * POST still goes to /api/timetable with HMAC session.
 * XP is single number: mining_balance (duo-gamification XP system).
 */
type EventRow = {
  id: string; title: string; venue: string; event_date: string; event_time: string;
  scope_type: string; scope_value: string | null; status: string;
  created_at: string; created_by?: string | null;
  slot_key?: string; required_points?: number | string; vote_weight_yes?: number; vote_weight_no?: number;
  tally_text?: string; progress_pct?: number; contenders?: any[]; venue_options?: string[]; group_size?: number; is_grouped?: boolean; severity?: string;
};

export default function RoadClient({ events }: { events: EventRow[] }) {
  return (
    <div className="relative">
      {/* Quiz trigger lives in RoadmapShell header; this wrapper keeps road + verify co-located for prefetch */}
      <WindingRoad events={events} />
      {/* hidden mount ensures QuizPost code is bundled even if shell lazy-loads */}
      <span className="hidden"><QuizPost /></span>
    </div>
  );
}
