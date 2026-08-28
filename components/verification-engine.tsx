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
      if (res.ok && data.ok && Array.isArray(data.events)) setEvents(data.events);
      else setEvents([]);
    } catch { setEvents([]); } finally { setLoadingEvents(false); }
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
        const msg = `✓ ${vote} recorded · ${vote === "YES" ? "Verified" : vote === "NO" ? "Not verified" : "Skipped"}`;
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
    } finally { setBusy(null); }
  }

  function dismiss() { setOpen(false); }

  return (
    <>
      {toast && (
        <div className={`pointer-events-none fixed bottom-6 left-1/2 z-[80] -translate-x-1/2 rounded-full border px-4 py-2.5 text-sm font-semibold shadow-2xl backdrop-blur animate-[toastIn_0.35s_ease] ${toast.type==="success" ? "border-emerald-400/30 bg-emerald-400/15 text-emerald-100" : toast.type==="error" ? "border-rose-400/30 bg-rose-400/15 text-rose-100" : "border-sky-400/30 bg-sky-400/15 text-sky-100"}`}>{toast.msg}</div>
      )}

      {/* PHYSI verify — bespoke ballot deck (not generic card) */}
      <section className="physi-verify">
        {/* bespoke verify head — rule + mono index */}
        <div className="flex items-center justify-between gap-3 border-b border-white/6 bg-white/[0.015] px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-flex h-7 w-7 items-center justify-center rounded-lg border border-amber-400/20 bg-amber-400/10 font-mono text-[11px] font-bold text-amber-300">⦿</span>
            <div>
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-300">PHYSI · Verify — Ballot Deck</p>
              <h3 className="text-[16px] font-semibold tracking-tight text-white">Quick check <span className="font-mono text-[10px] font-bold tracking-widest text-slate-500">/ BALLOT · Green check = real</span></h3>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1 font-mono text-[10px] tracking-wide text-slate-400">{loadingEvents ? "Loading…" : `${String(events.length).padStart(2,"0")} in pool`}</span>
            {nickname ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 font-mono text-[11px] font-semibold text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> @{nickname}</span>
            ) : (
              <span className="rounded-full border border-rose-400/15 bg-rose-400/10 px-2.5 py-1 font-mono text-[11px] font-semibold text-rose-300">No profile</span>
            )}
          </div>
        </div>

        <div className="p-5 sm:p-6">
          <p className="max-w-2xl text-[13.5px] leading-6 text-slate-400">Tap <span className="font-semibold text-white">Bell</span> to pull one random event — then mark <span className="font-mono text-xs font-semibold text-emerald-300">YES</span> · <span className="font-mono text-xs font-semibold text-rose-300">NO</span> · <span className="font-mono text-xs font-semibold text-slate-300">Skip</span>. Every vote is ledgered.</p>

          {/* bespoke tally strip — mono, not generic colored cards */}
          <div className="mt-5 grid grid-cols-3 divide-x divide-white/6 overflow-hidden rounded-xl border border-white/6 bg-white/[0.02]">
            {[
              { label: "Checked", value: String(stats.verified).padStart(2,"0"), sub: "this session" },
              { label: "YES", value: String(stats.yes).padStart(2,"0"), sub: "verified" },
              { label: "NO", value: String(stats.no).padStart(2,"0"), sub: "not verified" },
            ].map((m) => (
              <div key={m.label} className="px-4 py-3 text-center sm:px-5 sm:py-4">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{m.label}</p>
                <p className="mt-1 font-mono text-[20px] font-bold tabular-nums tracking-tight text-white">{m.value}</p>
                <p className="font-mono text-[10px] tracking-wide text-slate-600">{m.sub}</p>
              </div>
            ))}
          </div>

          {/* bespoke bell trigger strip — distinct from timetable sync */}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <div className="physi-bell-strip">
              <button onClick={pickRandom} disabled={loadingEvents || events.length===0} className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2 text-sm font-bold text-slate-900 shadow hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 transition">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-[13px]">🔔</span> Bell — trigger verification
              </button>
              <span className="hidden sm:inline font-mono text-[11px] tracking-wide text-amber-200/70">Manual only — no auto spam</span>
            </div>
            <button onClick={fetchEvents} className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 font-mono text-xs font-semibold text-slate-300 hover:bg-white/[0.06]">↻ Refresh pool</button>
            <span className="font-mono text-[11px] tracking-wide text-slate-500">Random from live pool · Green check = real</span>
          </div>

          {!nickname && (
            <p className="mt-3 rounded-xl border border-amber-400/15 bg-amber-400/8 px-3 py-2.5 font-mono text-xs leading-5 text-amber-200">⚠ Create your profile (Overview → Profile) first — verification uses your global <span className="font-semibold text-white">@{`nickname`}</span>, no duplicate input.</p>
          )}

          {message && <p className={`mt-3 rounded-xl border px-3 py-2.5 text-sm font-medium leading-6 ${tone==="success" ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200" : tone==="error" ? "border-rose-400/20 bg-rose-400/10 text-rose-200" : "border-sky-400/20 bg-sky-400/10 text-sky-200"}`}>{message}</p>}

          {/* bespoke event pool — verify tiles, not generic cards */}
          <div className="mt-6">
            <div className="flex items-center justify-between gap-3">
              <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500">Live pool — {loadingEvents ? "loading…" : `${events.length} fetched`}</p>
              <button onClick={fetchEvents} className="font-mono text-[11px] font-semibold tracking-wide text-sky-300 hover:text-white">↻ Pull from event API</button>
            </div>
            {loadingEvents ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">{[0,1,2,3].map((i) => <div key={i} className="animate-pulse rounded-xl border border-white/6 bg-white/[0.02] p-4"><div className="h-4 w-3/4 rounded bg-white/10" /><div className="mt-2 h-3 w-1/2 rounded bg-white/5" /></div>)}</div>
            ) : events.length === 0 ? (
              <div className="mt-3 rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center">
                <p className="font-mono text-sm font-semibold text-white">No events yet</p>
                <p className="mt-1 text-sm text-slate-500">Create one in the Roadmap — it will appear here for verification.</p>
              </div>
            ) : (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {events.slice(0,4).map((e) => (
                  <button key={e.id} onClick={() => { setActive(e); setOpen(true); }} className="group text-left rounded-xl border border-white/6 bg-white/[0.03] p-4 transition hover:border-amber-400/15 hover:bg-white/[0.05]">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold leading-tight text-white group-hover:text-amber-200">{e.title}</p>
                      <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2 py-1 font-mono text-[10px] font-semibold tracking-wide text-slate-400">→ Verify</span>
                    </div>
                    <p className="mt-2 font-mono text-[11px] leading-5 tracking-wide text-slate-500">{e.venue} · {String(e.event_date).slice(0,10)} {String(e.event_time).slice(0,5)} {e.scope_type ? `· ${e.scope_type}` : ""}</p>
                  </button>
                ))}
              </div>
            )}
            <p className="mt-3 font-mono text-[11px] tracking-wide text-slate-600">Green check = real · Your vote helps keep things accurate · Daily check-in capped.</p>
          </div>
        </div>
      </section>

      {open && active ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button aria-label="Close overlay" onClick={dismiss} className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" />
          <div className="relative w-full max-w-[520px] overflow-hidden rounded-[18px] border border-white/10 bg-[#0e1324] p-6 shadow-2xl animate-[popupIn_0.35s_cubic-bezier(0.16,1,0.3,1)]">
            <div className="pointer-events-none absolute -top-20 -right-20 h-56 w-56 rounded-full bg-amber-400/10 blur-3xl" />
            <div className="relative flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-400/10 px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-300"><span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" /> PHYSI ballot</span>
              <button onClick={dismiss} className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 font-mono text-xs text-white hover:bg-white/10">✕</button>
            </div>
            <h4 className="relative mt-4 text-[18px] font-semibold leading-tight tracking-tight text-white">{active.title}</h4>
            <div className="relative mt-2 flex flex-wrap gap-1.5 font-mono text-[11px] tracking-wide">
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-slate-300">📍 {active.venue}</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-slate-300">🕒 {String(active.event_date).slice(0,10)} {String(active.event_time).slice(0,5)}</span>
              {active.scope_type ? <span className="rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1 text-slate-500">Scope {active.scope_type}{active.scope_value ? ` · ${active.scope_value}` : ""}</span> : null}
            </div>
            {active.created_by_nickname ? <p className="relative mt-2 font-mono text-[11px] tracking-wide text-slate-600">by <span className="font-semibold text-slate-400">{active.created_by_nickname}</span></p> : null}
            <p className="relative mt-4 rounded-xl border border-white/8 bg-white/[0.03] p-3 text-sm leading-6 text-slate-300">Did this happen as listed? <span className="font-semibold text-emerald-300">YES</span> = real · <span className="font-semibold text-rose-300">NO</span> = not real · <span className="font-semibold text-slate-200">Skip</span> = not sure.</p>
            {!nickname && <p className="relative mt-2 rounded-xl border border-rose-400/15 bg-rose-400/10 px-3 py-2 font-mono text-xs font-semibold text-rose-200">Create profile first — voting needs global auth.</p>}
            {/* bespoke ballot tiles */}
            <div className="relative mt-5 physi-ballot">
              <button onClick={() => handleVote("YES")} disabled={!!busy || !nickname} className="physi-ballot-tile group" data-tone="yes" aria-label="Vote YES">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] opacity-70">Ballot A</p>
                <p className="mt-1 text-[18px] font-black tracking-tight">YES</p>
                <p className="font-mono text-[10px] tracking-wide opacity-70">{busy==="YES" ? "…" : "Verified"}</p>
              </button>
              <button onClick={() => handleVote("NO")} disabled={!!busy || !nickname} className="physi-ballot-tile" data-tone="no" aria-label="Vote NO">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] opacity-70">Ballot B</p>
                <p className="mt-1 text-[18px] font-black tracking-tight">NO</p>
                <p className="font-mono text-[10px] tracking-wide opacity-70">{busy==="NO" ? "…" : "Not real"}</p>
              </button>
              <button onClick={() => handleVote("CANCEL")} disabled={!!busy || !nickname} className="physi-ballot-tile" data-tone="skip" aria-label="Vote Skip">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] opacity-60">Ballot —</p>
                <p className="mt-1 text-[16px] font-bold tracking-tight">Skip</p>
                <p className="font-mono text-[10px] tracking-wide opacity-60">{busy==="CANCEL" ? "…" : "Not sure"}</p>
              </button>
            </div>
            <p className="relative mt-3 text-center font-mono text-[11px] tracking-wide text-slate-600">Checked as @{nickname || "—"} · Green check = real</p>
          </div>
        </div>
      ) : null}
      <style>{`@keyframes popupIn{from{opacity:0;transform:scale(0.96) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)}}@keyframes toastIn{from{opacity:0;transform:translate(-50%,8px) scale(0.98)}to{opacity:1;transform:translate(-50%,0) scale(1)}}`}</style>
    </>
  );
}
