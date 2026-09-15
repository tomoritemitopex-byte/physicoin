import { getApiAdapter } from "@/lib/adapters";
import "@/lib/adapters";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const a = getApiAdapter("faucet");
  if (!a) return Response.json({ ok: false, code: "NO_ADAPTER" }, { status: 500 });
  return a.handle(req);
}

export async function POST(req: Request) {
  const a = getApiAdapter("faucet");
  if (!a) return Response.json({ ok: false, code: "NO_ADAPTER" }, { status: 500 });
  return a.handle(req);
}
