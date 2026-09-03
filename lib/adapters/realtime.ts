/**
 * lib/adapters/realtime.ts — RealtimeAdapter (observability)
 *
 * In-memory ring buffer + console.log with timestamps.
 * Every API request logs via logEvent({ method, path, duration, status }).
 * Errors forward here via logError() so /api/logs shows both.
 * Exposes GET /api/logs (adapter-driven) returning recent 100 events (dev only).
 *
 * GitHub-visible: also appends to logs/realtime.log (all events) and
 * logs/errors.log (errors only) — both git-tracked so dev can see in repo.
 *
 * Modular: plug-in via registry like every other adapter. Zero core edits.
 */

import { createRegistry } from "./registry";
import { registerApiAdapter } from "./api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface RealtimeLog {
  ts: string; // ISO timestamp
  level: "info" | "error" | "warn";
  method?: string;
  path?: string;
  duration?: number; // ms
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
// Ring buffer (in-memory, process-local — fine for dev observability)
// ---------------------------------------------------------------------------
const MAX_BUFFER = 200; // keep 200, expose 100 via getRecentLogs default
const buffer: RealtimeLog[] = [];

// ---------------------------------------------------------------------------
// GitHub-visible file logging: logs/realtime.log + logs/errors.log
// fs/path are server-only — loaded lazily to avoid bundling in client.
// Webpack config in next.config.mjs sets fs/path fallbacks to false.

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
function ensureLogsDir(): string | null {
  if (typeof window !== "undefined") return null;
  try {
    const fs = getFs();
    const path = getPath();
    if (!fs || !path) return null;
    const dir = path.join(process.cwd(), "logs");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  } catch {
    return null;
  }
}

function appendToFile(filePath: string, entry: RealtimeLog): void {
  if (typeof window !== "undefined") return;
  try {
    const fs = getFs();
    const path = getPath();
    if (!fs || !path) return;
    const dir = ensureLogsDir();
    if (!dir) return;
    const fp = path.join(dir, filePath);
    // JSON line for machine parsable + easy to read in GitHub
    const line = JSON.stringify(entry) + "\n";
    fs.appendFileSync(fp, line);
    // trim file to ~1000 lines max to avoid unbounded growth
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

function readLogsFromFile(limit: number): RealtimeLog[] | null {
  if (typeof window !== "undefined") return null;
  try {
    const fs = getFs();
    const path = getPath();
    if (!fs || !path) return null;
    const fp = path.join(process.cwd(), "logs", "realtime.log");
    if (!fs.existsSync(fp)) return null;
    const content = fs.readFileSync(fp, "utf8").trim();
    if (!content) return null;
    const lines = content.split("\n").filter(Boolean);
    const slice = lines.slice(-Math.min(limit, 1000));
    const parsed: RealtimeLog[] = [];
    for (const line of slice) {
      try {
        // each line is JSON; older text-format lines fallback to raw
        const obj = JSON.parse(line);
        if (obj && typeof obj.ts === "string") parsed.push(obj as RealtimeLog);
      } catch {
        // fallback: treat as raw text log
        parsed.push({ ts: new Date().toISOString(), level: "info", message: line.slice(0, 800) });
      }
    }
    return parsed.reverse(); // newest first
  } catch {
    return null;
  }
}

function push(entry: RealtimeLog): void {
  buffer.push(entry);
  if (buffer.length > MAX_BUFFER) buffer.shift();
  // console.log with timestamp — visible in server logs (Vercel / dev)
  const tag = entry.level === "error" ? "ERROR" : entry.level === "warn" ? "WARN" : "EVENT";
  const line =
    entry.level === "error"
      ? `[Realtime:${tag} ${entry.ts}] ${entry.code ?? ""} ${entry.message ?? ""} ${entry.path ?? ""} ${JSON.stringify(entry.meta ?? {}).slice(0, 400)}`
      : `[Realtime:${tag} ${entry.ts}] ${entry.method ?? ""} ${entry.path ?? ""} ${entry.status ?? ""} ${entry.duration ?? ""}ms${entry.message ? " " + entry.message : ""}`;
  if (entry.level === "error") console.error(line);
  else console.log(line);

  // Persist to git-tracked files for GitHub visibility
  // All events -> logs/realtime.log ; errors additionally -> logs/errors.log
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

export function getRecentLogs(limit = 100): RealtimeLog[] {
  const n = Math.max(1, Math.min(limit, MAX_BUFFER));
  // Prefer file-backed logs if available (persists across restarts, visible in GitHub)
  const fromFile = readLogsFromFile(n);
  if (fromFile && fromFile.length > 0) return fromFile.slice(0, n);
  // fallback to in-memory
  return buffer.slice(-n).reverse();
}

export function clearLogs(): void {
  buffer.length = 0;
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
  // Read from file (git-visible) with fallback to buffer
  const logs = getRecentLogs(limit);
  return new Response(JSON.stringify({ ok: true, logs, count: logs.length, total: buffer.length }), { status: 200, headers: { "content-type": "application/json" } });
}

registerApiAdapter({
  id: "logs",
  route: "/api/logs",
  label: "Realtime Logs API",
  handle: handleLogs,
});
