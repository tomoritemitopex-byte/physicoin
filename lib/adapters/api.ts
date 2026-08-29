/**
 * lib/adapters/api.ts — ApiAdapter (code adapter)
 *
 * Every /api/* route is an ApiAdapter plug-in.
 * Core (route.ts files) is just registry dispatch — no hard-coded SQL/handlers.
 * New endpoint: registerAdapter({ id:"my-feature", route:"/api/my-feature", handle })
 */

import { createRegistry } from "./registry";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ApiAdapter {
  /** unique id, e.g. "timetable" | "profile" | "verify" */
  id: string;
  /** canonical route prefix, e.g. "/api/timetable" */
  route: string;
  /** optional method filter; defaults to all */
  methods?: HttpMethod[];
  /** optional matcher for dispatch (defaults to route prefix) */
  match?: (req: Request) => boolean;
  /** handle any method for this route; adapter decides by req.method */
  handle: (req: Request) => Promise<Response>;
  /** optional human label */
  label?: string;
}

const reg = createRegistry<ApiAdapter>();
export const registerApiAdapter = reg.registerAdapter;
export const listApiAdapters = reg.listAdapters;
export const getApiAdapter = reg.getAdapter;

export function getApiAdapterForRequest(req: Request): ApiAdapter | null {
  const url = new URL(req.url);
  const path = url.pathname;
  for (const a of reg.listAdapters()) {
    if (a.match) {
      try {
        if (a.match(req)) return a;
      } catch {}
    }
    if (path === a.route || path.startsWith(a.route + "/") || path.startsWith(a.route + "?")) return a;
    // also match exact route without query
    if (path.startsWith(a.route)) {
      // ensure prefix boundary to avoid /api/profile matching /api/profile-extra
      if (path === a.route || path.startsWith(a.route + "/")) return a;
    }
  }
  return null;
}

/** Dispatch helper — keeps route.ts files one-liners (orchestrator only). */
export async function dispatchApi(req: Request, fallback?: () => Promise<Response>): Promise<Response> {
  const adapter = getApiAdapterForRequest(req);
  if (adapter) return adapter.handle(req);
  if (fallback) return fallback();
  return new Response(JSON.stringify({ ok: false, code: "NO_ADAPTER", error: "no ApiAdapter for route" }), {
    status: 404,
    headers: { "content-type": "application/json" },
  });
}
