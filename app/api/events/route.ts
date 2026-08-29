import { getApiAdapter } from "@/lib/adapters";
import "@/lib/adapters";
export const dynamic = "force-dynamic";
// Thin alias — canonical is ApiAdapter "timetable"
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
