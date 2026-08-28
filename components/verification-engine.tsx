"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-context";

type PhysiEvent = {
  id: string;
  title: string;
  venue: string;
  event_date: string;
  event_time: string;
  scope_type?: string;
  scope_value?: string | null;
  status?: string;
  created_by_nickname?: string | null;
};

type Vote = "YES" | "NO" | "CANCEL";

export function VerificationEngine() {
  const { auth } = useAuth();
  const nickname = auth?.nickname ?? "";

  const [events, setEvents] = useState<PhysiEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [active, setActive] = useState<PhysiEvent | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<Vote | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<"success" | "error" | "info">("info");
  const [toast, setToast] = useState<{ type: "success" | "error" | "info"; msg: string } | null>(null);
  const [stats, setStats] = useState({ verified: 0, yes: 0, no: 0 });

  const fetchEvents = useCallback(async () => {
    setLoadingEvents(true);
    try {
      const res = await fetch("/api/events", { cache: "no-store" });
      const data = await res.json();
      if (res.ok && data.ok && Array.isArray(data.events)) {
        setEvents(data.events);
      } else {
        setEvents([]);
      }
    } catch {
      setEvents([]);
    } finally {
      setLoadingEvents(false);
    }
  }, []);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }, [toast]);

  const pickRandom = useCallback(() => {
    if (events.length === 0) {
      setToast({ type: "info", msg: "No events to verify — create one in Roadmap first." });
      return;
    }
    const ev = events[Math.floor(Math.random() * events.length)];
    setActive(ev);
    setOpen(true);
    setMessage(null);
    try { if ("vibrate" in navigator) navigator.vibrate(12); } catch {}
  }, [events]);

  async function handleVote(vote: Vote) {
    if (!active) return;
    if (!nickname.trim()) {
      setTone("error");
      const msg = "Create your profile first — verification needs your global nickname.";
      setMessage(msg);
      setToast({ type: "error", msg });
      try { if ("vibrate" in navigator) navigator.vibrate([40,30,40]); } catch {}
      return;
    }
    setBusy(vote);
    setMessage(null);
    setTone("info");
    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: nickname.trim(), event_id: active.id, vote }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Verification failed");

      setStats((s) => ({ verified: s.verified + 1, yes: s.yes + (vote === "YES" ? 1 : 0), no: s.no + (vote === "NO" ? 1 : 0) }));
      if (data.mock) {
        setTone("info");
        const msg = `Demo ${vote} for “${active.title}” — not saved. Create profile + real events to save.`;
        setMessage(msg);
        setToast({ type: "info", msg });
      } else {
        setTone("success");
        const delta = vote === "YES" ? "Verified" : vote === "NO" ? "Not verified" : "Skipped";
        const msg = `✓ ${vote} recorded · ${delta}`;
        setMessage(msg);
        setToast({ type: "success", msg });
      }
      try { if ("vibrate" in navigator) navigator.vibrate(vote==="YES" ? [15,30,15] : [20,20]); } catch {}
      setTimeout(() => setOpen(false), 1100);
    } catch (e) {
      setTone("error");
      const msg = e instanceof Error ? e.message : "Could not verify";
      setMessage(msg);
      setToast({ type: "error", msg });
      try { if ("vibrate" in navigator) navigator.vibrate([40,30,40]); } catch {}
    } finally {
      setBusy(null);
    }
  }

  function dismiss() { setOpen(false); }

  return (
    <>
      {/* toasts */}
      {toast && (
        <div className={`pointer-events-none fixed bottom-6 left-1/2 z-[80] -translate-x-1/2 rounded-full border px-4 py-2.5 text-sm font-bold shadow-2xl backdrop-blur animate-[toastIn_0.35s_ease] ${toast.type==="success" ? "border-emerald-400/30 bg-emerald-400/15 text-emerald-100" : toast.type==="error" ? "border-rose-400/30 bg-rose-400/15 text-rose-100" : "border-sky-400/30 bg-sky-400/15 text-sky-100"}`}>{toast.msg}</div>
      )}

      <section className="relative overflow-hidden rounded-card border border-white/10 bg-white/[0.06] p-6 shadow-2xl backdrop-blur sm:p-8">
        <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-20 h-56 w-56 rounded-full bg-amber-500/10 blur-3xl" />

        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.32em] text-amber-300">Check · Verified</p>
            <h3 className="mt-2 flex items-center gap-2 text-2xl font-black text-white">Quick check <span className="rounded-full bg-white px-2.5 py-0.5 text-[10px] font-black tracking-widest text-slate-900">BELL</span></h3>
            <p className="mt-1 max-w-xl text-sm leading-6 text-slate-400">Tap <b className="text-white">🔔 Bell</b> to check a random event — vote <b className="text-white">YES</b>, <b className="text-white">NO</b> or <b className="text-white">Skip</b>. Green check = real.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs font-bold text-amber-300">{loadingEvents ? "Loading…" : `${events.length} events`}</span>
            {nickname ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-300"><span className="h-2 w-2 rounded-full bg-emerald-400" /> @{nickname}</span>
            ) : (
              <span className="rounded-full border border-rose-400/20 bg-rose-400/10 px-3 py-1 text-xs font-bold text-rose-300">No profile · create above</span>
            )}
          </div>
        </div>

        <div className="relative mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 backdrop-blur"><p className="text-xs font-bold uppercase tracking-widest text-slate-400">Checked this session</p><p className="mt-1 text-3xl font-black tabular-nums text-white">{stats.verified}</p><p className="text-xs text-slate-500">Green check = real</p></div>
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4"><p className="text-xs font-bold uppercase tracking-widest text-emerald-300">YES votes</p><p className="mt-1 text-3xl font-black tabular-nums text-white">{stats.yes}</p><p className="text-xs text-emerald-200/70">Verified</p></div>
          <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4"><p className="text-xs font-bold uppercase tracking-widest text-rose-300">NO votes</p><p className="mt-1 text-3xl font-black tabular-nums text-white">{stats.no}</p><p className="text-xs text-rose-200/70">Not verified</p></div>
        </div>

        <div className="relative mt-6 flex flex-wrap items-center gap-3">
          <button onClick={pickRandom} disabled={loadingEvents || events.length===0} className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-black text-slate-950 shadow-lg transition hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-base">🔔</span> Bell — trigger verification
          </button>
          <button onClick={fetchEvents} className="rounded-full border border-white/15 bg-transparent px-5 py-3 text-sm font-black text-white hover:bg-white/5">↻ Refresh pool</button>
          <span className="self-center text-xs font-medium text-slate-500">Manual only — no auto popup spam. Bell pulls one random live event.</span>
        </div>

        {!nickname && (
          <p className="relative mt-3 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm font-semibold text-amber-200">⚠️ Create your profile (Overview → ProfilePilot) first — verification uses your global <b className="text-white">@{`nickname`}</b> from auth, no duplicate input.</p>
        )}

        {message && <p className={`relative mt-4 rounded-2xl border px-4 py-3 text-sm font-semibold leading-6 ${tone==="success" ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : tone==="error" ? "border-rose-400/30 bg-rose-400/10 text-rose-200" : "border-sky-400/30 bg-sky-400/10 text-sky-200"}`}>{message}</p>}

        <div className="relative mt-6">
          <div className="flex items-center justify-between"><p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Live event pool — {loadingEvents ? "loading…" : `${events.length} fetched`}</p><button onClick={fetchEvents} className="text-xs font-bold text-sky-300 hover:text-white">↻ Pull from event API</button></div>
          {loadingEvents ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">{[0,1,2,3].map((i) => <div key={i} className="animate-pulse rounded-2xl border border-white/10 bg-slate-900/40 p-4"><div className="h-4 w-3/4 rounded bg-white/10" /><div className="mt-2 h-3 w-1/2 rounded bg-white/10" /></div>)}</div>
          ) : events.length === 0 ? (
            <div className="mt-3 rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-8 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 text-xl">📋</div>
              <p className="mt-3 text-sm font-bold text-white">No events yet</p>
              <p className="mt-1 text-sm text-slate-400">Create one in the Event Roadmap — it will appear here for verification.</p>
            </div>
          ) : (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {events.slice(0,4).map((e) => (
                <button key={e.id} onClick={() => { setActive(e); setOpen(true); }} className="group text-left rounded-2xl border border-white/10 bg-slate-900/60 p-4 backdrop-blur transition hover:border-amber-400/20 hover:bg-slate-900/80">
                  <p className="text-sm font-black leading-tight text-white group-hover:text-amber-300">{e.title}</p>
                  <p className="mt-1 text-xs text-slate-400">{e.venue} · {String(e.event_date).slice(0,10)} {String(e.event_time).slice(0,5)} {e.scope_type ? `· ${e.scope_type}` : ""}</p>
                  <p className="mt-2 inline-flex rounded-full bg-white/5 px-2 py-1 text-[11px] font-bold text-slate-300">Tap to verify →</p>
                </button>
              ))}
            </div>
          )}
          <p className="mt-3 text-xs text-slate-500">Green check = real · Your vote helps keep things accurate · Daily check-in capped.</p>
        </div>
      </section>

      {open && active ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button aria-label="Close overlay" onClick={dismiss} className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" />
          <div className="relative w-full max-w-lg overflow-hidden rounded-card border border-white/10 bg-slate-900 p-6 shadow-2xl animate-[popupIn_0.35s_cubic-bezier(0.16,1,0.3,1)]">
            <div className="pointer-events-none absolute -top-20 -right-20 h-56 w-56 rounded-full bg-amber-400/10 blur-3xl" />
            <div className="relative flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-amber-300"><span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" /> Verify this event</span>
              <button onClick={dismiss} className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white hover:bg-white/10">✕</button>
            </div>
            <h4 className="relative mt-4 text-xl font-black leading-tight text-white">{active.title}</h4>
            <div className="relative mt-2 space-y-1 text-sm text-slate-300">
              <p className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-xs">📍 {active.venue}</p>
              <p className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-xs">🕒 {String(active.event_date).slice(0,10)} {String(active.event_time).slice(0,5)}</p>
              {active.scope_type ? <p className="text-xs uppercase tracking-widest text-slate-400">Scope: {active.scope_type}{active.scope_value ? ` · ${active.scope_value}` : ""} {active.status ? `· ${active.status}` : ""}</p> : null}
              {active.created_by_nickname ? <p className="text-xs text-slate-500">by <b className="text-slate-300">{active.created_by_nickname}</b></p> : null}
            </div>
            <p className="relative mt-4 rounded-2xl border border-white/10 bg-white/5 p-3 text-sm leading-6 text-slate-300 backdrop-blur">Did this happen as listed? <b className="text-emerald-300">YES</b> = real · <b className="text-rose-300">NO</b> = not real · <b className="text-slate-300">Skip</b> = not sure.</p>
            {!nickname && <p className="relative mt-2 rounded-xl border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-xs font-bold text-rose-200">Create profile first — voting needs global auth.</p>}
            <div className="relative mt-6 grid grid-cols-3 gap-3">
              <button onClick={() => handleVote("YES")} disabled={!!busy || !nickname} className="rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60">{busy==="YES" ? <span className="inline-flex items-center gap-2"><span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-900 border-t-transparent" />…</span> : "YES"}</button>
              <button onClick={() => handleVote("NO")} disabled={!!busy || !nickname} className="rounded-2xl bg-rose-400 px-4 py-3 text-sm font-black text-slate-950 shadow-lg shadow-rose-500/20 transition hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60">{busy==="NO" ? "…" : "NO"}</button>
              <button onClick={() => handleVote("CANCEL")} disabled={!!busy || !nickname} className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-black text-white transition hover:bg-white/10 disabled:opacity-60">{busy==="CANCEL" ? "…" : "Skip"}</button>
            </div>
            <p className="relative mt-3 text-center text-xs text-slate-500">Checked as @{nickname || "—"} · Green check = real</p>
          </div>
        </div>
      ) : null}
      <style>{`@keyframes popupIn{from{opacity:0;transform:scale(0.96) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)}}@keyframes toastIn{from{opacity:0;transform:translate(-50%,8px) scale(0.98)}to{opacity:1;transform:translate(-50%,0) scale(1)}}`}</style>
    </>
  );
}
