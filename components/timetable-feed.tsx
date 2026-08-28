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

const CONF: Record<Confidence, { label: string; dot: string; badge: string; bar: string }> = {
  green: { label: "Green check = real", dot: "bg-emerald-400", badge: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300", bar: "bg-emerald-400" },
  yellow: { label: "Needs check", dot: "bg-amber-400", badge: "border-amber-400/25 bg-amber-400/10 text-amber-300", bar: "bg-amber-400" },
  red: { label: "Needs check", dot: "bg-rose-400", badge: "border-rose-400/25 bg-rose-400/10 text-rose-300", bar: "bg-rose-400" },
};

function Skeleton() {
  return (
    <div className="physi-ledger-slot animate-pulse">
      <div className="physi-day-rail"><div className="h-3 w-8 rounded bg-white/10" /><div className="h-6 w-8 rounded bg-white/10" /></div>
      <div className="space-y-2 flex-1"><div className="h-3 w-3/4 rounded bg-white/10" /><div className="h-3 w-1/2 rounded bg-white/5" /></div>
      <div className="h-8 w-16 rounded-full bg-white/5" />
    </div>
  );
}

function EmptyIllustration({ filter }: { filter: string }) {
  return (
    <div className="rounded-[16px] border border-dashed border-white/10 bg-white/[0.02] px-8 py-12 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 font-mono text-xs font-bold text-slate-400">PHYSI</div>
      <p className="mt-4 text-sm font-semibold text-white">{filter === "all" ? "No timetable slots yet" : `No ${filter} slots`}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
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
      if (showToast) setToast({ type: "success", msg: `Synced ${data.slots?.length ?? 0} slots · ${data.source ?? "timetable"} · ${new Date().toLocaleTimeString()}` });
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
    <section className="physi-panel physi-ledger">
      {toast && (
        <div className={`pointer-events-none fixed bottom-6 left-1/2 z-[80] -translate-x-1/2 rounded-full border px-4 py-2.5 text-sm font-semibold shadow-2xl backdrop-blur animate-[toastIn_0.35s_ease] ${toast.type === "success" ? "border-emerald-400/30 bg-emerald-400/15 text-emerald-100" : "border-rose-400/30 bg-rose-400/15 text-rose-100"}`}>{toast.msg}</div>
      )}

      {/* PHYSI ledger head — bespoke index bar */}
      <div className="physi-ledger-head">
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-[10px] font-black tracking-tighter text-slate-900">Idx</span>
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-300">PHYSI · Ledger — Timetable</p>
            <p className="text-[13px] font-semibold tracking-tight text-white">Live timetable <span className="font-mono text-[10px] font-bold tracking-widest text-slate-500">/ PHYSI · ADVISORY</span></p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-2">
          <span className="rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1 font-mono text-[10px] tracking-wide text-slate-400">idx {String(filtered.length).padStart(2,"0")} / {String(slots.length).padStart(2,"0")}</span>
          <span className="hidden lg:inline font-mono text-[10px] tracking-wide text-slate-600">Green check = real · Others need a check</span>
        </div>
      </div>

      <div className="p-5 sm:p-6">
        {/* bespoke sync rail — not generic pill bar */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-slate-500">Sync rail</p>
            <p className="mt-1 max-w-xl text-[13.5px] leading-5 text-slate-400">Advisory only — Green check = real · Points have no cash value.</p>
            <p className="mt-1 font-mono text-[11px] tracking-wide text-slate-600">Source: <span className="text-slate-300">{source || "—"}</span> · Last sync {lastSync} {metrics ? <span>· {metrics.users} users · {metrics.events} events</span> : null}</p>
          </div>
          <button onClick={() => { fetchTimetable(true); fetchStats(); }} disabled={syncing || loading} className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2 text-xs font-bold text-slate-900 shadow hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 transition">
            {syncing ? <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-900 border-t-transparent" /> Syncing…</> : "↻ Sync ledger"}
          </button>
        </div>

        {/* counts — bespoke ledger total strip (distinct from verify/mint) */}
        <div className="mt-5 grid grid-cols-3 gap-2">
          {([
            { k: "green", label: "Green", sub: "Verified", count: counts.green, active: filter==="green" },
            { k: "yellow", label: "Yellow", sub: "Needs look", count: counts.yellow, active: filter==="yellow" },
            { k: "red", label: "Red", sub: "Needs look", count: counts.red, active: filter==="red" },
          ] as const).map((c) => (
            <button key={c.k} onClick={() => setFilter(c.k as Confidence)} className={`relative overflow-hidden rounded-xl border px-3 py-3 text-left transition ${c.active ? "border-white bg-white text-slate-900 shadow" : "border-white/8 bg-white/[0.03] text-white hover:bg-white/[0.05]"}`}>
              <p className={`font-mono text-[10px] font-semibold uppercase tracking-[0.14em] ${c.active ? "text-slate-500" : "text-slate-500"}`}>{c.label} · {c.sub}</p>
              <p className={`mt-1 font-mono text-[22px] font-bold tabular-nums leading-none ${c.active ? "text-slate-900" : "text-white"}`}>{loading ? "—" : String(c.count).padStart(2,"0")}</p>
              <span className={`absolute right-2 top-2 h-1.5 w-1.5 rounded-full ${c.k==="green" ? "bg-emerald-400" : c.k==="yellow" ? "bg-amber-400" : "bg-rose-400"}`} />
            </button>
          ))}
        </div>

        {/* filter rail — mono segmented */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(CONF) as Confidence[]).map((k) => (
              <span key={k} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${CONF[k].badge}`}><span className={`h-1.5 w-1.5 rounded-full ${CONF[k].dot}`} /> {k}</span>
            ))}
          </div>
          <div className="flex gap-1 rounded-full border border-white/8 bg-black/20 p-1">
            {(["all","green","yellow","red"] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-3.5 py-1.5 text-xs font-semibold capitalize transition ${filter===f ? "bg-white text-slate-900 shadow" : "text-slate-400 hover:text-white"}`}>{f}</button>
            ))}
          </div>
        </div>

        {/* feed — PHYSI ledger slots */}
        <div className="mt-5 grid gap-2.5">
          {loading ? (
            <>
              <Skeleton /><Skeleton /><Skeleton />
              <p className="text-center font-mono text-[11px] tracking-wide text-slate-500 animate-pulse">Fetching from live timetable API…</p>
            </>
          ) : error ? (
            <div className="rounded-xl border border-rose-400/20 bg-rose-400/10 p-6 text-center">
              <p className="text-sm font-semibold text-rose-200">Couldn&apos;t load timetable</p>
              <p className="mt-1 text-xs text-rose-300/80">{error}</p>
              <button onClick={() => { fetchTimetable(true); fetchStats(); }} className="mt-3 rounded-full bg-white px-4 py-2 text-xs font-bold text-slate-900">Retry</button>
            </div>
          ) : filtered.length === 0 ? <EmptyIllustration filter={filter} /> : (
            filtered.map((c) => (
              <div key={c.id} data-confidence={c.confidence} className="physi-ledger-slot group hover:border-white/15 hover:bg-white/[0.04] transition">
                {/* day rail */}
                <div className="physi-day-rail">
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{c.day.slice(0,3)}</span>
                  <span className="font-mono text-[13px] font-bold tabular-nums text-white">{c.time.slice(0,5)}</span>
                  {c.date && <span className="font-mono text-[10px] tracking-wide text-slate-500">{String(c.date).slice(5,10)}</span>}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 font-mono text-[10px] font-semibold ${CONF[c.confidence].badge}`}><span className={`h-1.5 w-1.5 rounded-full ${CONF[c.confidence].dot}`} /> {CONF[c.confidence].label}</span>
                    <span className="rounded-full border border-white/8 bg-white/[0.04] px-2.5 py-1 font-mono text-[11px] font-semibold text-white">{c.code}</span>
                  </div>
                  <p className="mt-2 truncate text-[14px] font-semibold tracking-tight text-white">{c.title}</p>
                  <p className="text-xs leading-5 text-slate-400">{c.venue} · <span className="text-slate-300">{c.lecturer}</span></p>
                  <p className="mt-1 font-mono text-[11px] leading-4 text-slate-500">{c.syncNote}</p>
                </div>
                <div className="flex flex-col items-end gap-1.5 self-center">
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-[11px] font-medium text-slate-300">{c.confidence==="green" ? "Verified" : c.confidence==="yellow" ? "Pending" : "Stale"}</span>
                  {c.status && <span className="rounded-full bg-white px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wide text-slate-900">{c.status}</span>}
                </div>
              </div>
            ))
          )}
        </div>

        <p className="mt-4 flex items-center gap-2 font-mono text-[11px] tracking-wide text-slate-600"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400/70" /> Ledger spine = confidence · Mono rail = day/time · Sync pulls fresh status</p>
      </div>
      <style>{`@keyframes toastIn{from{opacity:0;transform:translate(-50%,8px) scale(0.98)}to{opacity:1;transform:translate(-50%,0) scale(1)}}`}</style>
    </section>
  );
}
