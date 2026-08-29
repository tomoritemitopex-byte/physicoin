import { getApiAdapter } from "@/lib/adapters";
import "@/lib/adapters";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const a = getApiAdapter("health");
  if (!a) return new Response(JSON.stringify({ ok: false, code: "NO_ADAPTER" }), { status: 500 });
  return a.handle(req);
}
