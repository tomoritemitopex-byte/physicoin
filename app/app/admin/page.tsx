"use client";
import { useEffect, useState, useCallback } from "react";

interface RealtimeLog {
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

export default function AdminPage() {
  const [logs, setLogs] = useState<RealtimeLog[]>([]);
  const [at, setAt] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);

  const fetchLogs = useCallback(async () => {
    if (paused) return;
    try {
      const res = await fetch("/api/logs?limit=100", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setLogs(Array.isArray(data.logs) ? data.logs : []);
      setAt(new Date().toLocaleTimeString());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [paused]);

  useEffect(() => {
    fetchLogs();
    const id = setInterval(fetchLogs, 3000);
    return () => clearInterval(id);
  }, [fetchLogs]);

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[18px] font-semibold tracking-tight text-white">Admin — Realtime Logs</h1>
          <p className="mt-1 font-mono text-[11px] text-slate-400">
            Polling <span className="text-slate-200">/api/logs</span> every 3s • adapter-driven • {paused ? "paused" : `last ${at || "—"}`}
            {error ? <span className="ml-2 text-red-400">error: {error}</span> : null}
          </p>
          <p className="mt-1 font-mono text-[11px] text-slate-500">Also persisted to <code className="text-slate-300">logs/realtime.log</code> + <code className="text-slate-300">logs/errors.log</code> (git-visible)</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPaused((p) => !p)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${paused ? "border-amber-400/30 bg-amber-400/15 text-amber-200" : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.07]"}`}
          >
            {paused ? "Resume" : "Pause"}
          </button>
          <button
            onClick={fetchLogs}
            className="rounded-full border border-white/10 bg-white px-3 py-1 text-xs font-semibold text-black hover:bg-slate-100"
          >
            Refresh
          </button>
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] ${paused ? "border-amber-400/20 bg-amber-400/10 text-amber-300" : "border-emerald-400/15 bg-emerald-400/10 text-emerald-300"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${paused ? "bg-amber-400" : "animate-pulse bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]"}`} />
            {paused ? "paused" : "live"}
          </span>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.03]">
        <div className="flex items-center justify-between border-b border-white/[0.06] bg-white/[0.02] px-3 py-2">
          <span className="font-mono text-[11px] tracking-wide text-slate-400">recent 100 events — newest first</span>
          <span className="font-mono text-[11px] text-slate-500">{logs.length} entries</span>
        </div>

        <div className="max-h-[64vh] overflow-auto overscroll-contain bg-[#070a12]">
          {logs.length === 0 ? (
            <div className="px-4 py-10 text-center font-mono text-xs text-slate-500">No logs yet — hit any /api/* route to generate events. Check <code>logs/realtime.log</code> in repo.</div>
          ) : (
            <table className="w-full text-left font-mono text-[11.5px] leading-[1.35]">
              <thead className="sticky top-0 bg-[#0e1320] text-[10px] uppercase tracking-widest text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Time</th>
                  <th className="px-3 py-2 font-medium">Lvl</th>
                  <th className="px-3 py-2 font-medium">Method</th>
                  <th className="px-3 py-2 font-medium">Path</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Dur</th>
                  <th className="px-3 py-2 font-medium">Message / Code</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {logs.map((l, i) => (
                  <tr key={`${l.ts}-${i}`} className={l.level === "error" ? "bg-red-500/[0.04] hover:bg-red-500/[0.07]" : "hover:bg-white/[0.03]"}>
                    <td className="whitespace-nowrap px-3 py-1.5 text-slate-400">{new Date(l.ts).toLocaleTimeString()}<span className="ml-1 opacity-60 hidden sm:inline">{new Date(l.ts).toLocaleDateString()}</span></td>
                    <td className="px-3 py-1.5">
                      <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold ${l.level === "error" ? "bg-red-500/20 text-red-300" : l.level === "warn" ? "bg-amber-500/20 text-amber-300" : "bg-white/10 text-slate-300"}`}>{l.level}</span>
                    </td>
                    <td className="px-3 py-1.5 text-slate-300">{l.method ?? "—"}</td>
                    <td className="max-w-[220px] truncate px-3 py-1.5 text-slate-200" title={l.path}>{l.path ?? "—"}</td>
                    <td className="px-3 py-1.5">
                      {l.status != null ? (
                        <span className={`inline-flex rounded px-1.5 py-0.5 text-[11px] ${l.status >= 500 ? "bg-red-500/15 text-red-300" : l.status >= 400 ? "bg-amber-500/15 text-amber-300" : "bg-emerald-500/15 text-emerald-300"}`}>{l.status}</span>
                      ) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-slate-400">{l.duration != null ? `${l.duration}ms` : "—"}</td>
                    <td className="max-w-[260px] truncate px-3 py-1.5 text-slate-400" title={l.message ?? l.code}>{l.code ? <span className="mr-1 rounded bg-white/10 px-1 py-0.5 text-[10px] text-slate-300">{l.code}</span> : null}{l.message ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <p className="mt-3 font-mono text-[11px] leading-relaxed text-slate-500">
        Dev-only observability. Ring buffer 200 (shows 100). Git-visible via <code className="text-slate-400">logs/realtime.log</code> (JSON lines). Errors also in <code className="text-slate-400">logs/errors.log</code> + <code className="text-slate-400">.github/error-log.md</code>.
      </p>
    </div>
  );
}
