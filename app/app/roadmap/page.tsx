import { RoadSkeleton } from "@/components/Skeletons";
import RoadmapShell from "@/components/road/RoadmapShell";
import { getTimetableFeed } from "@/lib/data";

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
