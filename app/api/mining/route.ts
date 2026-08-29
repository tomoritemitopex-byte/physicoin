import { getApiAdapter } from "@/lib/adapters";
import { logError, getErrorMessage } from "@/lib/adapters/error";
import "@/lib/adapters";

export const dynamic = "force-dynamic";
async function safeHandle(id: string, req: Request): Promise<Response> {
  const { logEvent } = await import("@/lib/adapters/realtime");
  const start = Date.now();
  let status = 200;
  let resp: Response | null = null;
  try {
    const a = getApiAdapter(id);
    if (!a) {
      logError("NO_ADAPTER", new Error(`no ApiAdapter ${id}`), { route: req.url });
      resp = new Response(JSON.stringify({ ok: false, code: "NO_ADAPTER", message: getErrorMessage("NO_ADAPTER") }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
      status = 500;
      return resp;
    }
    resp = await a.handle(req);
    status = resp.status;
    return resp;
  } catch (e) {
    logError("INTERNAL", e, { route: req.url, adapter: id });
    resp = new Response(JSON.stringify({ ok: false, code: "INTERNAL", message: getErrorMessage("INTERNAL") }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
    status = 500;
    return resp;
  } finally {
    const duration = Date.now() - start;
    try {
      logEvent({ method: req.method, path: new URL(req.url).pathname, duration, status });
    } catch {}
  }
}

export async function GET(req: Request) { return safeHandle("mining", req); }
export async function POST(req: Request) { return safeHandle("mining", req); }
