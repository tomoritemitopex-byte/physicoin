import { getApiAdapter } from "@/lib/adapters";
import "@/lib/adapters";

export const dynamic = "force-dynamic";

// Orchestrator: no SQL here — delegated to ApiAdapter "timetable" (see lib/adapters/features/timetable.ts)
export async function GET(req: Request) {
  const a = getApiAdapter("timetable");
  if (!a) return new Response(JSON.stringify({ ok: false, code: "NO_ADAPTER" }), { status: 500 });
  return a.handle(req);
}
export async function POST(req: Request) {
  const a = getApiAdapter("timetable");
  if (!a) return new Response(JSON.stringify({ ok: false, code: "NO_ADAPTER" }), { status: 500 });
  return a.handle(req);
}
