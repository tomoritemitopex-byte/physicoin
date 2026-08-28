"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Confidence = "green" | "yellow" | "red";
type Slot = {
  id: string;
  code: string;
  title: string;
  venue: string;
  time: string;
  day: string;
  date?: string;
  lecturer: string;
  confidence: Confidence;
  syncNote: string;
  scope_type?: string;
  status?: string;
};

const CONF: Record<Confidence, { label: string; dot: string; badge: string; bar: string; glow: string }> = {
  green: { label: "Green check = real", dot: "bg-emerald-400", badge: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300", bar: "bg-emerald-400", glow: "shadow-emerald-400/20" },
  yellow: { label: "Needs check", dot: "bg-amber-400", badge: "border-amber-400/30 bg-amber-400/10 text-amber-300", bar: "bg-amber-400", glow: "shadow-amber-400/20" },
  red: { label: "Needs check", dot: "bg-rose-400", badge: "border-rose-400/30 bg-rose-400/10 text-rose-300", bar: "bg-rose-400", glow: "shadow-rose-400/20" },
};

function Skeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-white/10 bg-slate-900/40 p-4">
      <div className="flex gap-4">
        <div className="hidden h-12 w-1.5 rounded-full bg-white/10 sm:block" />
        <div className="flex-1 space-y-3">
          <div className="flex gap-2"><div className="h-6 w-24 rounded-full bg-white/10" /><div className="h-6 w-20 rounded-full bg-white/10" /><div className="h-4 w-32 rounded bg-white/10" /></div>
          <div className="h-4 w-3/5 rounded bg-white/10" />
          <div className="h-3 w-2/5 rounded bg-white/10" />
        </div>
      </div>
    </div>
  );
}

function EmptyIllustration({ filter }: { filter: string }) {
  return (
    <div className="rounded-card border border-dashed border-white/15 bg-white/[0.03] px-8 py-12 text-center backdrop-blur">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 text-2xl shadow-inner">🗓️</div>
      <p className="mt-4 text-sm font-black text-white">{filter === "all" ? "No timetable slots yet" : `No ${filter} slots`}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">
        {filter === "all" ? <>Verified events appear here with a green check. Create an event via the roadmap — broad reach helps it get a green check.</> : <>Switch to <b className="text-white">All</b> to see the full feed, or tap <b className="text-white">Sync now</b> to refresh.</>}
      </p>
    </div>
  );
}

export function TimetableFeed() {
  const [filter, setFilter] = useState<Confidence | "all">("all");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string>("—");
  const [source, setSource] = useState<string>("");
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<{ users: number; events: number; checks: number; upcoming: number } | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const r = await fetch("/api/stats", { cache: "no-store" });
      const d = await r.json();
      if (d.ok && d.metrics) {
        setMetrics({
          users: d.metrics.users ?? d.counts?.physi_users ?? 0,
          events: d.metrics.events ?? d.counts?.physi_events ?? 0,
          checks: d.metrics.verifications ?? d.metrics.checks ?? d.counts?.physi_verifications ?? 0,
          upcoming: d.metrics.upcoming_events ?? 0,
        });
      }
    } catch {}
  }, []);

  const fetchTimetable = useCallback(async (showToast = false) => {
    setError(null);
    if (!showToast) setLoading(true);
    else setSyncing(true);
    try {
      const res = await fetch("/api/timetable", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Could not load timetable");
      setSlots(Array.isArray(data.slots) ? data.slots : []);
      setSource(data.source ?? "");
      setLastSync(data.syncedAt ? new Date(data.syncedAt).toLocaleTimeString() : new Date().toLocaleTimeString());
      if (showToast) setToast({ type: "success", msg: `Synced ${data.slots?.length ?? 0} slots from ${data.source ?? "timetable"} · ${new Date().toLocaleTimeString()}` });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Network error";
      setError(msg);
      if (showToast) setToast({ type: "error", msg });
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, []);

  useEffect(() => { fetchTimetable(); fetchStats(); }, [fetchTimetable, fetchStats]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2800); return () => clearTimeout(t); }, [toast]);

  const filtered = useMemo(() => filter === "all" ? slots : slots.filter((s) => s.confidence === filter), [slots, filter]);
  const counts = useMemo(() => ({ green: slots.filter((s) => s.confidence === "green").length, yellow: slots.filter((s) => s.confidence === "yellow").length, red: slots.filter((s) => s.confidence === "red").length }), [slots]);

  return (
    <section className="relative overflow-hidden rounded-card border border-white/10 bg-white/[0.06] p-6 shadow-2xl backdrop-blur sm:p-8">
      {/* ambient */}
      <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-20 h-56 w-56 rounded-full bg-emerald-500/10 blur-3xl" />

      {/* toast */}
      {toast && (
        <div className={`pointer-events-none fixed bottom-6 left-1/2 z-[80] -translate-x-1/2 rounded-full border px-4 py-2.5 text-sm font-bold shadow-2xl backdrop-blur animate-[toastIn_0.35s_ease] ${toast.type === "success" ? "border-emerald-400/30 bg-emerald-400/15 text-emerald-100" : "border-rose-400/30 bg-rose-400/15 text-rose-100"}`}>{toast.msg}</div>
      )}

      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.32em] text-amber-300">Timetable Feed · Live Sync</p>
          <h3 className="mt-2 flex items-center gap-2 text-2xl font-black text-white">Live timetable <span className="rounded-full bg-white px-2.5 py-0.5 text-[10px] font-black tracking-widest text-slate-900">PHYSI</span></h3>
          <p className="mt-1 max-w-xl text-sm leading-6 text-slate-400">Advisory only — Green check = real · Others need a quick check · Points have no cash value.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-900/60 px-3 py-1 text-xs font-semibold text-slate-300">
            <span className={`h-2 w-2 rounded-full ${syncing ? "bg-amber-400" : "bg-slate-400"}`} /> Last sync: {lastSync}
          </span>
          <button onClick={() => { fetchTimetable(true); fetchStats(); }} disabled={syncing || loading} className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2 text-xs font-black text-slate-950 shadow-lg transition hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60">
            {syncing ? <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-900 border-t-transparent" /> Syncing…</> : "↻ Sync now"}
          </button>
        </div>
      </div>

      {/* counts */}
      <div className="relative mt-6 grid gap-3 sm:grid-cols-3">
        {([
          { k: "green", label: "Green check = real", sub: "Verified", count: counts.green, cls: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300" },
          { k: "yellow", label: "Yellow · Check", sub: "Needs a look", count: counts.yellow, cls: "border-amber-400/20 bg-amber-400/10 text-amber-300" },
          { k: "red", label: "Red · Check", sub: "Needs a look", count: counts.red, cls: "border-rose-400/20 bg-rose-400/10 text-rose-300" },
        ] as const).map((c) => (
          <button key={c.k} onClick={() => setFilter(c.k as Confidence)} className={`group relative overflow-hidden rounded-2xl border p-4 text-left backdrop-blur transition hover:scale-[1.01] active:scale-[0.99] ${c.cls} ${filter === c.k ? "ring-2 ring-white/30" : ""}`}>
            <p className="text-xs font-bold uppercase tracking-widest opacity-90">{c.label}</p>
            <p className="mt-1 text-3xl font-black tabular-nums text-white">{loading ? "—" : c.count}</p>
            <p className="text-xs opacity-70">{c.sub}</p>
            {filter === c.k && <span className="absolute right-3 top-3 h-2 w-2 rounded-full bg-white" />}
          </button>
        ))}
      </div>

      {/* legend + filter pills */}
      <div className="relative mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(CONF) as Confidence[]).map((k) => (
            <span key={k} className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold ${CONF[k].badge}`}><span className={`h-2 w-2 rounded-full ${CONF[k].dot}`} /> {k.toUpperCase()} · {CONF[k].label}</span>
          ))}
        </div>
        <div className="flex gap-1 rounded-full border border-white/10 bg-slate-950/60 p-1 backdrop-blur">
          {(["all","green","yellow","red"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-4 py-1.5 text-xs font-bold capitalize transition ${filter===f ? "bg-white text-slate-900 shadow" : "text-slate-400 hover:text-white"}`}>{f}</button>
          ))}
        </div>
      </div>
      {source && <p className="relative mt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Source: <span className="text-slate-300">{source}</span> · tap a pill to filter · sync pulls fresh status{metrics ? <span> · <span className="text-emerald-300">{metrics.users} users</span> · <span className="text-sky-300">{metrics.events} events</span> · <span className="text-amber-300">{metrics.upcoming} upcoming</span></span> : null}</p>}

      {/* feed */}
      <div className="relative mt-6 grid gap-3">
        {loading ? (
          <>
            <Skeleton /><Skeleton /><Skeleton />
            <p className="text-center text-xs font-semibold uppercase tracking-widest text-slate-500 animate-pulse">Fetching from live timetable API…</p>
          </>
        ) : error ? (
          <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-6 text-center">
            <p className="text-sm font-bold text-rose-200">Couldn&apos;t load timetable</p>
            <p className="mt-1 text-xs text-rose-300/80">{error}</p>
            <button onClick={() => { fetchTimetable(true); fetchStats(); }} className="mt-3 rounded-full bg-white px-4 py-2 text-xs font-black text-slate-900">Retry</button>
          </div>
        ) : filtered.length === 0 ? <EmptyIllustration filter={filter} /> : (
          filtered.map((c) => (
            <div key={c.id} className={`group relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60 p-4 backdrop-blur transition hover:border-white/15 hover:bg-slate-900/80 hover:shadow-xl ${CONF[c.confidence].glow} sm:flex sm:items-center sm:justify-between`}>
              <div className="absolute left-0 top-0 h-full w-1"><div className={`h-full w-full ${CONF[c.confidence].bar}`} /></div>
              <div className="absolute inset-0 bg-gradient-to-r from-white/[0.02] to-transparent opacity-0 transition group-hover:opacity-100" />
              <div className="relative flex gap-4">
                <div className="hidden h-12 w-1.5 shrink-0 rounded-full sm:block"><div className={`h-full w-full rounded-full ${CONF[c.confidence].bar}`} /></div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${CONF[c.confidence].badge}`}><span className={`h-1.5 w-1.5 rounded-full ${CONF[c.confidence].dot}`} /> {CONF[c.confidence].label}</span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-bold text-white">{c.code}</span>
                    <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs font-semibold text-slate-300">{c.day} · {c.time}{c.date ? ` · ${c.date}` : ""}</span>
                  </div>
                  <p className="mt-2 truncate text-sm font-black text-white">{c.title}</p>
                  <p className="text-xs text-slate-400">{c.venue} · {c.lecturer}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500"><span className={`h-1.5 w-1.5 rounded-full ${CONF[c.confidence].dot}`} />{c.syncNote}</p>
                </div>
              </div>
              <div className="relative mt-3 flex items-center gap-2 sm:mt-0 sm:flex-col sm:items-end">
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-300">Sync: {c.confidence==="green" ? "Verified" : c.confidence==="yellow" ? "Pending" : "Stale"}</span>
                {c.status && <span className="rounded-full bg-slate-950 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">{c.status}</span>}
              </div>
            </div>
          ))
        )}
      </div>

      <p className="relative mt-4 flex items-center gap-2 text-xs text-slate-500"><span className="h-2 w-2 rounded-full bg-slate-400" /> Green check = real · Verified events stay on top · Daily check-in capped.</p>

      <style>{`@keyframes toastIn{from{opacity:0;transform:translate(-50%,8px) scale(0.98)}to{opacity:1;transform:translate(-50%,0) scale(1)}}`}</style>
    </section>
  );
}
