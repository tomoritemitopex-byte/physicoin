import { RoadSkeleton } from "@/components/Skeletons";
import RoadmapShell from "@/components/road/RoadmapShell";
import { getTimetableFeed } from "@/lib/data";

// Deliberately dynamic (ƒ, not ○ — see build table):
// getTimetableFeed dispatches in-process to the timetable adapter, which
// hits Neon on every request and bypasses Next's fetch cache. Prerendering
// would freeze a stale (or build-time empty, when DATABASE_URL is unset)
// feed. The static road SVG still SSRs per-request via WindingRoadStatic.
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Server Component — fetches data and renders initial HTML
export default async function RoadmapPage({
  searchParams,
}: {
  searchParams?: { filter?: string };
}) {
  const filterParam = searchParams?.filter || "all";
  const { events, ok } = await getTimetableFeed();

  return (
    <RoadmapShell
      initialEvents={events}
      initialOk={ok}
      filterParam={filterParam}
      fallback={<RoadSkeleton />}
    />
  );
}
