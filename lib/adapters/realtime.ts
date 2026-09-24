/**
 * lib/adapters/realtime.ts — RealtimeAdapter (observability)
 *
 * DB-first logging with file/in-memory fallback. Every API request logs via
 * logEvent({ method, path, duration, status }). Errors forward here via
 * logError() so /api/logs shows both.
 *
 * Inverted-audit P1 (K-A8): primary persistence is `physi_logs` (Neon table),
 * not filesystem. File logging is kept as dev-only fallback when DB is
 * unavailable. In-memory ring remains as secondary cache.
 */

import { createRegistry } from "./registry";
import { registerApiAdapter } from "./api";
import { getSql, isDbConfigured, ensureLogs } from "@/lib/db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface RealtimeLog {
  id?: string;
  ts: string;
  level: "info" | "error" | "warn";
  method?: string;
  path?: string;
  duration?: number;
  status?: number;
  message?: string;
  code?: string;
  meta?: Record<string, unknown>;
}

export interface RealtimeLogEventInput {
  method: string;
  path: string;
  duration: number;
  status: number;
  meta?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// In-memory ring buffer (secondary cache — survives process restart only
// when DB is unavailable)
// ---------------------------------------------------------------------------
const MAX_BUFFER = 200;
const buffer: RealtimeLog[] = [];

// ---------------------------------------------------------------------------
// File fallback (dev-only — skipped on Vercel / read-only fs)
// ---------------------------------------------------------------------------
function getFs(): typeof import("fs") | null {
  if (typeof window !== "undefined") return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("fs") as typeof import("fs");
  } catch {
    return null;
  }
}
function getPath(): typeof import("path") | null {
  if (typeof window !== "undefined") return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("path") as typeof import("path");
  } catch {
    return null;
  }
}

function appendToFile(filePath: string, entry: RealtimeLog): void {
  if (typeof window !== "undefined") return;
  if (process.env.VERCEL) return;
  try {
    const fs = getFs();
    const path = getPath();
    if (!fs || !path) return;
    const dir = path.join(process.cwd(), "logs");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const fp = path.join(dir, filePath);
    const line = JSON.stringify(entry) + "\n";
    fs.appendFileSync(fp, line);
    try {
      const content = fs.readFileSync(fp, "utf8");
      const lines = content.split("\n").filter(Boolean);
      if (lines.length > 1000) {
        const keep = lines.slice(-1000).join("\n") + "\n";
        fs.writeFileSync(fp, keep);
      }
    } catch {
      // ignore trim errors
    }
  } catch {
    // never throw from logger
  }
}

// ---------------------------------------------------------------------------
// DB persistence (primary) — inverted-audit P1 (K-A8)
// ---------------------------------------------------------------------------
function persistLogToDb(entry: RealtimeLog): void {
  const c = getSql();
  if (!c) return;
  try {
    // Fire-and-forget: don't await, don't block response
    (async () => {
      await c`
        INSERT INTO physi_logs (ts, level, method, path, duration, status, message, code, meta)
        VALUES (${entry.ts}, ${entry.level}, ${entry.method ?? null}, ${entry.path ?? null},
                ${entry.duration ?? null}, ${entry.status ?? null}, ${entry.message ?? null},
                ${entry.code ?? null}, ${entry.meta ?? null})
      `;
    })().catch(() => {
      // DB write failed — file fallback below still runs
    });
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Push (primary = DB, secondary = file + buffer)
// ---------------------------------------------------------------------------
function push(entry: RealtimeLog): void {
  // Console output
  const tag = entry.level === "error" ? "ERROR" : entry.level === "warn" ? "WARN" : "EVENT";
  const line =
    entry.level === "error"
      ? `[Realtime:${tag} ${entry.ts}] ${entry.code ?? ""} ${entry.message ?? ""} ${entry.path ?? ""} ${JSON.stringify(entry.meta ?? {}).slice(0, 400)}`
      : `[Realtime:${tag} ${entry.ts}] ${entry.method ?? ""} ${entry.path ?? ""} ${entry.status ?? ""} ${entry.duration ?? ""}ms${entry.message ? " " + entry.message : ""}`;
  if (entry.level === "error") console.error(line);
  else console.log(line);

  // Primary: DB (fire-and-forget)
  persistLogToDb(entry);

  // Secondary: in-memory ring
  buffer.push(entry);
  if (buffer.length > MAX_BUFFER) buffer.shift();

  // Tertiary: file fallback (dev-only)
  if (entry.level === "error") {
    appendToFile("realtime.log", entry);
    appendToFile("errors.log", entry);
  } else {
    appendToFile("realtime.log", entry);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export function logEvent(input: RealtimeLogEventInput): void {
  const entry: RealtimeLog = {
    ts: new Date().toISOString(),
    level: "info",
    method: input.method,
    path: input.path,
    duration: input.duration,
    status: input.status,
    meta: input.meta,
  };
  push(entry);
}

export function logError(code: string, error: unknown, context?: Record<string, unknown>): void {
  const err = error instanceof Error ? error : new Error(String(error ?? "unknown"));
  const entry: RealtimeLog = {
    ts: new Date().toISOString(),
    level: "error",
    code,
    message: err.message,
    path: (context?.["path"] as string) ?? (context?.["route"] as string),
    meta: {
      code,
      stack: err.stack?.slice(0, 800),
      ...context,
    },
  };
  push(entry);
}

export async function getRecentLogs(limit = 100): Promise<RealtimeLog[]> {
  const n = Math.max(1, Math.min(limit, MAX_BUFFER));

  // Primary: DB
  const c = getSql();
  if (c) {
    try {
      const rows = await c`
        SELECT id, ts, level, method, path, duration, status, message, code, meta
        FROM physi_logs
        ORDER BY ts DESC
        LIMIT ${n}
      ` as any[];
      if (rows.length > 0) {
        return rows.map((r: any) => ({
          id: r.id,
          ts: r.ts,
          level: r.level,
          method: r.method,
          path: r.path,
          duration: r.duration,
          status: r.status,
          message: r.message,
          code: r.code,
          meta: r.meta,
        }));
      }
    } catch {
      // DB read failed — fall back
    }
  }

  // Secondary: file
  try {
    const fs = getFs();
    const path = getPath();
    if (fs && path) {
      const fp = path.join(process.cwd(), "logs", "realtime.log");
      if (fs.existsSync(fp)) {
        const content = fs.readFileSync(fp, "utf8").trim();
        if (content) {
          const lines = content.split("\n").filter(Boolean);
          const slice = lines.slice(-Math.min(n, 1000));
          const parsed: RealtimeLog[] = [];
          for (const line of slice) {
            try {
              const obj = JSON.parse(line);
              if (obj && typeof obj.ts === "string") parsed.push(obj as RealtimeLog);
            } catch {
              parsed.push({ ts: new Date().toISOString(), level: "info", message: line.slice(0, 800) });
            }
          }
          if (parsed.length > 0) return parsed.reverse();
        }
      }
    }
  } catch {
    // file read failed
  }

  // Tertiary: in-memory
  return buffer.slice(-n).reverse();
}

export async function clearLogs(): Promise<void> {
  buffer.length = 0;
  // also clear DB logs
  const c = getSql();
  if (c) {
    try {
      await c`TRUNCATE TABLE physi_logs`;
    } catch {
      // ignore
    }
  }
  // also clear file (dev utility)
  if (typeof window === "undefined") {
    try {
      const fs = getFs();
      const path = getPath();
      if (!fs || !path) return;
      const fp = path.join(process.cwd(), "logs", "realtime.log");
      if (fs.existsSync(fp)) fs.writeFileSync(fp, "");
    } catch {}
  }
}

// ---------------------------------------------------------------------------
// Registry (modular adapter pattern)
// ---------------------------------------------------------------------------
export interface RealtimeAdapter {
  id: string;
  label?: string;
  logEvent: typeof logEvent;
  logError: typeof logError;
  getRecentLogs: typeof getRecentLogs;
  clearLogs: typeof clearLogs;
}

const reg = createRegistry<RealtimeAdapter>();
export const registerRealtimeAdapter = reg.registerAdapter;
export const listRealtimeAdapters = reg.listAdapters;
export const getRealtimeAdapter = reg.getAdapter;

const defaultRealtimeAdapter: RealtimeAdapter = {
  id: "realtime",
  label: "Realtime Observability Adapter",
  logEvent,
  logError,
  getRecentLogs,
  clearLogs,
};

registerRealtimeAdapter(defaultRealtimeAdapter);

// Convenience singleton — matches error adapter pattern
export const realtimeAdapter = defaultRealtimeAdapter;

// ---------------------------------------------------------------------------
// ApiAdapter for GET /api/logs (adapter-driven)
// ---------------------------------------------------------------------------
async function handleLogs(req: Request): Promise<Response> {
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ ok: false, code: "METHOD_NOT_ALLOWED", message: "GET only" }), { status: 405, headers: { "content-type": "application/json" } });
  }
  const url = new URL(req.url);
  const raw = url.searchParams.get("limit");
  const limit = raw ? Math.max(1, Math.min(parseInt(raw, 10) || 100, 200)) : 100;
  // Read from DB first, fallback to file/buffer
  const logs = await getRecentLogs(limit);
  const c = getSql();
  let total = buffer.length;
  if (c) {
    try {
      const row = await c`SELECT COUNT(*)::int AS c FROM physi_logs` as any[];
      total = Number((row[0] as any)?.c ?? buffer.length);
    } catch {
      // ignore
    }
  }
  return new Response(JSON.stringify({ ok: true, logs, count: logs.length, total }), { status: 200, headers: { "content-type": "application/json" } });
}

registerApiAdapter({
  id: "logs",
  route: "/api/logs",
  label: "Realtime Logs API",
  handle: handleLogs,
});
