import { getApiAdapter } from "@/lib/adapters";
import "@/lib/adapters";

export const dynamic = "force-dynamic";

// Orchestrator: no SQL here — delegated to ApiAdapter "profile"
export async function GET(req: Request) {
  const a = getApiAdapter("profile");
  if (!a) return new Response(JSON.stringify({ ok: false, code: "NO_ADAPTER" }), { status: 500 });
  return a.handle(req);
}
export async function POST(req: Request) {
  const a = getApiAdapter("profile");
  if (!a) return new Response(JSON.stringify({ ok: false, code: "NO_ADAPTER" }), { status: 500 });
  return a.handle(req);
}
export async function DELETE(req: Request) {
  const a = getApiAdapter("profile");
  if (!a) return new Response(JSON.stringify({ ok: false, code: "NO_ADAPTER" }), { status: 500 });
  return a.handle(req);
}
