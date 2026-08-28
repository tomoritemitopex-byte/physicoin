"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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

const FALLBACK_POOL: PhysiEvent[] = [
  { id: "evt_1", title: "FUHSI Clinical Skills Workshop", venue: "Skills Lab A", event_date: "2026-09-02", event_time: "10:00", scope_type: "programme", scope_value: "Medicine" },
  { id: "evt_2", title: "Anatomy Dept Seminar – Neuroanatomy", venue: "LT 1", event_date: "2026-09-03", event_time: "13:00", scope_type: "faculty", scope_value: "FUHSI" },
  { id: "evt_3", title: "Nursing Council Accreditation Visit", venue: "Admin Block", event_date: "2026-09-04", event_time: "09:00", scope_type: "university", scope_value: "FUHSI" },
  { id: "evt_4", title: "Pharmacology Quiz Series", venue: "LT 3", event_date: "2026-09-05", event_time: "15:30", scope_type: "personal", scope_value: null },
];

export function VerificationEngine() {
  const [events, setEvents] = useState<PhysiEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [active, setActive] = useState<PhysiEvent | null>(null);
  const [open, setOpen] = useState(false);
  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState<Vote | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<"success" | "error" | "info">("info");
  const [toast, setToast] = useState<{ type: "success" | "error" | "info"; msg: string } | null>(null);
  const [stats, setStats] = useState({ verified: 0, yes: 0, no: 0 });
  const [autoOn, setAutoOn] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchEvents = useCallback(async () => {
    setLoadingEvents(true);
    try {
      const res = await fetch("/api/events", { cache: "no-store" });
      const data = await res.json();
      if (res.ok && data.ok && Array.isArray(data.events) && data.events.length > 0) {
        setEvents(data.events);
      } else if (data.events?.length === 0) {
        setEvents(FALLBACK_POOL);
      } else {
        setEvents((prev) => (prev.length ? prev : FALLBACK_POOL));
      }
    } catch {
      setEvents((prev) => (prev.length ? prev : FALLBACK_POOL));
    } finally {
      setLoadingEvents(false);
    }
  }, []);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }, [toast]);

  const pickRandom = useCallback(() => {
    const pool = events.length > 0 ? events : FALLBACK_POOL;
    if (pool.length === 0) return;
    const ev = pool[Math.floor(Math.random() * pool.length)];
    setActive(ev);
    setOpen(true);
    setMessage(null);
    // subtle haptic
    try { if ("vibrate" in navigator) navigator.vibrate(12); } catch {}
  }, [events]);

  const scheduleRandom = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!autoOn) return;
    const delay = 12000 + Math.random() * 23000;
    timerRef.current = setTimeout(() => {
      // don't stack if already open
      setOpen((isOpen) => {
        if (!isOpen) pickRandom();
        return isOpen;
      });
      scheduleRandom();
    }, delay);
  }, [pickRandom, autoOn]);

  useEffect(() => {
    scheduleRandom();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [scheduleRandom]);

  async function handleVote(vote: Vote) {
    if (!active) return;
    if (!nickname.trim()) {
      setTone("error");
      const msg = "Enter your nickname first — it must match a physi_users row to persist.";
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
        const msg = `Demo ${vote} for “${active.title}” — not persisted. Create profile + real events in Neon to persist.`;
        setMessage(msg);
        setToast({ type: "info", msg });
      } else {
        setTone("success");
        const delta = vote === "YES" ? "+0.02 authority" : vote === "NO" ? "−0.01 authority" : "no change";
        const msg = `✓ ${vote} recorded · weight ${data.authority_weight ?? "?"} · ${delta}${data.authority_final_after ? ` → ${data.authority_final_after}` : ""}`;
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

      <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.06] p-6 shadow-2xl backdrop-blur sm:p-8">
        <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-20 h-56 w-56 rounded-full bg-amber-500/10 blur-3xl" />

        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.32em] text-amber-300">Verification Engine · Authority-weighted</p>
            <h3 className="mt-2 flex items-center gap-2 text-2xl font-black text-white">Random in-app verification <span className="rounded-full bg-white px-2.5 py-0.5 text-[10px] font-black tracking-widest text-slate-900">POPUP</span></h3>
            <p className="mt-1 max-w-xl text-sm leading-6 text-slate-400">Popup picks a random <span className="font-mono text-xs text-sky-300">physi_events</span> row (live from <span className="font-mono text-xs text-amber-300">/api/events</span>) and asks you to vote <b className="text-white">YES / NO / CANCEL</b>. Weighted by <span className="font-mono text-xs text-emerald-300">authority_final</span>.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold ${autoOn ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-white/10 bg-white/5 text-slate-400"}`}><span className={`h-2 w-2 rounded-full ${autoOn ? "bg-emerald-400 animate-pulse" : "bg-slate-500"}`} /> {autoOn ? "Auto-popup on" : "Auto-popup off"}</span>
            <button onClick={() => setAutoOn((v) => !v)} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/10">{autoOn ? "Pause" : "Resume"}</button>
            <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs font-bold text-amber-300">{loadingEvents ? "Loading…" : `${events.length} events`}</span>
          </div>
        </div>

        <div className="relative mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 backdrop-blur"><p className="text-xs font-bold uppercase tracking-widest text-slate-400">Verified this session</p><p className="mt-1 text-3xl font-black tabular-nums text-white">{stats.verified}</p><p className="text-xs text-slate-500">POST /api/verify</p></div>
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4"><p className="text-xs font-bold uppercase tracking-widest text-emerald-300">YES votes</p><p className="mt-1 text-3xl font-black tabular-nums text-white">{stats.yes}</p><p className="text-xs text-emerald-200/70">+0.02 authority</p></div>
          <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4"><p className="text-xs font-bold uppercase tracking-widest text-rose-300">NO votes</p><p className="mt-1 text-3xl font-black tabular-nums text-white">{stats.no}</p><p className="text-xs text-rose-200/70">−0.01 authority</p></div>
        </div>

        <div className="relative mt-6 rounded-2xl border border-white/10 bg-slate-950/60 p-4 backdrop-blur">
          <label className="grid gap-2 text-sm font-semibold text-slate-200">Verifier nickname <span className="font-normal text-slate-500">(must exist in physi_users — create profile first)</span>
            <div className="flex gap-2">
              <div className="relative flex-1"><span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500">@</span><input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="Tope" className="w-full rounded-2xl border border-white/10 bg-slate-900/60 py-3 pl-8 pr-4 text-sm font-semibold text-white outline-none placeholder:text-slate-500 focus:border-amber-400/40" /></div>
              <button onClick={fetchEvents} className="shrink-0 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-black text-white hover:bg-white/10">↻ Refresh</button>
            </div>
          </label>
          <p className="mt-2 text-xs text-slate-500">Votes hit <span className="font-mono text-sky-300">POST /api/verify</span> with <span className="font-mono text-amber-300">authority_weight</span>; CANCEL skips without penalty.</p>
        </div>

        <div className="relative mt-4 flex flex-wrap gap-2">
          <button onClick={pickRandom} disabled={loadingEvents} className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-black text-slate-950 shadow-lg transition hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-amber-400">◆</span> Trigger verification now
          </button>
          <button onClick={() => { if (timerRef.current) clearTimeout(timerRef.current); setToast({ type: "info", msg: "Auto-popup rescheduled (12–35s)" }); scheduleRandom(); }} className="rounded-full border border-white/15 bg-transparent px-5 py-2.5 text-sm font-black text-white hover:bg-white/5">Reschedule random</button>
          <span className="self-center text-xs font-medium text-slate-500">Popup also fires automatically every 12–35s when enabled.</span>
        </div>

        {message && <p className={`relative mt-4 rounded-2xl border px-4 py-3 text-sm font-semibold leading-6 ${tone==="success" ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : tone==="error" ? "border-rose-400/30 bg-rose-400/10 text-rose-200" : "border-sky-400/30 bg-sky-400/10 text-sky-200"}`}>{message}</p>}

        <div className="relative mt-6">
          <div className="flex items-center justify-between"><p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Live event pool — {loadingEvents ? "loading…" : `${events.length} fetched`}</p><button onClick={fetchEvents} className="text-xs font-bold text-sky-300 hover:text-white">↻ Pull from /api/events</button></div>
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
          <p className="mt-3 text-xs text-slate-500">Live contracts: <span className="font-mono text-amber-300">physi_events</span> + <span className="font-mono text-emerald-300">physi_verifications</span> + <span className="font-mono text-sky-300">physi_users.authority_final</span></p>
        </div>
      </section>

      {open && active ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button aria-label="Close overlay" onClick={dismiss} className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" />
          <div className="relative w-full max-w-lg overflow-hidden rounded-[2rem] border border-white/10 bg-slate-900 p-6 shadow-2xl animate-[popupIn_0.35s_cubic-bezier(0.16,1,0.3,1)]">
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
            <p className="relative mt-4 rounded-2xl border border-white/10 bg-white/5 p-3 text-sm leading-6 text-slate-300 backdrop-blur">Did this event really happen as listed? Your vote is weighted by your authority. <b className="text-emerald-300">YES</b> +0.02 · <b className="text-rose-300">NO</b> −0.01 · <b className="text-slate-300">CANCEL</b> skip.</p>
            <div className="relative mt-6 grid grid-cols-3 gap-3">
              <button onClick={() => handleVote("YES")} disabled={!!busy} className="rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60">{busy==="YES" ? <span className="inline-flex items-center gap-2"><span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-900 border-t-transparent" />…</span> : "YES"}</button>
              <button onClick={() => handleVote("NO")} disabled={!!busy} className="rounded-2xl bg-rose-400 px-4 py-3 text-sm font-black text-slate-950 shadow-lg shadow-rose-500/20 transition hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60">{busy==="NO" ? "…" : "NO"}</button>
              <button onClick={() => handleVote("CANCEL")} disabled={!!busy} className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-black text-white transition hover:bg-white/10 disabled:opacity-60">{busy==="CANCEL" ? "…" : "CANCEL"}</button>
            </div>
            <p className="relative mt-3 text-center text-xs text-slate-500">Posts to <span className="font-mono text-sky-300">POST /api/verify</span> · authority-weighted · glass popup</p>
          </div>
        </div>
      ) : null}
      <style>{`@keyframes popupIn{from{opacity:0;transform:scale(0.96) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)}}@keyframes toastIn{from{opacity:0;transform:translate(-50%,8px) scale(0.98)}to{opacity:1;transform:translate(-50%,0) scale(1)}}`}</style>
    </>
  );
}
