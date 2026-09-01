"use client";
import { useEffect, useState, useCallback } from "react";

type BunkEvent = {
  id: string; title: string; venue: string; event_date: string; event_time: string;
  no_show_count?: number; live_status?: string; alert?: boolean; status?: string;
};

export default function BunkRadar({ userId }: { userId?: string | null }) {
  const [events, setEvents] = useState<BunkEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [initial, setInitial] = useState(true);

  const uid = (() => {
    if (userId) return userId;
    try { const raw = localStorage.getItem("physi_profile"); if (raw) return JSON.parse(raw)?.id ?? null; } catch {}
    return null;
  })();

  const fetchBunk = useCallback(async () => {
    try {
      const r = await fetch("/api/bunk", { cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (j?.ok) setEvents(j.events || []);
    } catch {} finally { setLoading(false); setInitial(false); }
  }, []);

  useEffect(() => { fetchBunk(); const iv = setInterval(fetchBunk, 15000); return () => clearInterval(iv); }, [fetchBunk]);

  async function confirmNoShow(evId: string) {
    setMsg(null);
    try {
      const r = await fetch("/api/bunk", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event_id: evId, reporter_id: uid, vote: "no_show" }) });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) throw new Error(j?.message || "Couldn't send");
      setMsg(j.message || "Noted — thanks");
      fetchBunk();
    } catch (e) { setMsg((e as Error).message); }
  }
  async function confirmHappening(evId: string) {
    setMsg(null);
    try {
      const r = await fetch("/api/bunk", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event_id: evId, reporter_id: uid, vote: "happening" }) });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) throw new Error(j?.message || "Couldn't send");
      setMsg(j.message || "Thanks for confirming");
      fetchBunk();
    } catch (e) { setMsg((e as Error).message); }
  }

  function badge(ev: BunkEvent) {
    const s = String(ev.live_status || "").toLowerCase();
    if (s === "no_show_alert") return <span className="inline-flex items-center gap-1 rounded-full bg-red-500 px-2 py-0.5 font-mono text-[10px] font-black text-white">🚨 No-show alert</span>;
    if (s === "happening") return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 font-mono text-[10px] font-black text-white">🟢 Happening now</span>;
    if (s === "upcoming") return <span className="inline-flex items-center gap-1 rounded-full bg-sky-500 px-2 py-0.5 font-mono text-[10px] font-black text-white">⏰ Coming up</span>;
    return <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 font-mono text-[10px] font-bold text-white/70">✅ Ended</span>;
  }

  return (
    <div className="rounded-[20px] border border-white/10 p-3" style={{ background: "rgba(255,255,255,0.06)", backdropFilter: "blur(16px) saturate(1.14)", WebkitBackdropFilter: "blur(16px) saturate(1.14)" }}>
      <div className="flex items-center justify-between">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-amber-300">class bunk radar · live</p>
          <h3 className="text-[16px] font-black text-white">Is class holding?</h3>
          <p className="font-mono text-[11px] text-white/60">Anonymous heads-up — 3 confirmations triggers an alert</p>
        </div>
        <button onClick={fetchBunk} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-[11px] font-bold text-white hover:bg-white hover:text-black">{loading && !initial ? "…" : "↻ Refresh"}</button>
      </div>

      <div className="mt-3 space-y-2">
        {initial ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[76px] animate-pulse rounded-[14px] bg-white/[0.04] border border-white/10" />
            ))}
          </div>
        ) : events.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/10 bg-white/[0.03] px-3 py-4 text-center font-mono text-[11px] text-white/50">No classes found yet — add one on the road</p>
        ) : (
          events.slice(0, 8).map(ev => (
            <div key={ev.id} className={`flex items-center gap-2 rounded-[14px] border p-2 ${ev.alert ? "border-red-400/30 bg-red-500/10" : "border-white/10 bg-black/20"}`}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-black text-white">{ev.title} <span className="font-mono text-[11px] font-medium text-white/60">· {ev.venue}</span></p>
                <p className="font-mono text-[11px] text-white/60">{String(ev.event_date).slice(0, 10)} · {String(ev.event_time).slice(0, 5)} · {ev.no_show_count ? `${ev.no_show_count} say no-show` : "no reports yet"}</p>
                <div className="mt-1">{badge(ev)}</div>
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                <button onClick={() => confirmNoShow(ev.id)} className="rounded-full bg-white px-3 py-1.5 font-mono text-[11px] font-black text-black hover:bg-red-50">Lecturer didn't show</button>
                <button onClick={() => confirmHappening(ev.id)} className="rounded-full border border-white/15 bg-white/5 px-3 py-1 font-mono text-[10px] font-bold text-white hover:bg-white hover:text-black">It&apos;s holding</button>
              </div>
            </div>
          ))
        )}
      </div>
      {msg && <p className="mt-2 rounded-xl bg-white px-3 py-2 font-mono text-[11px] font-bold text-black">{msg}</p>}
      <p className="mt-2 font-mono text-[10px] text-white/40">Tip: if you&apos;re at the venue and no lecturer after 15 mins, tap “Lecturer didn&apos;t show” — others get a heads-up.</p>
    </div>
  );
}
