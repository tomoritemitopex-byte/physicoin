"use client";
import { useEffect, useState, useCallback } from "react";
import { useCalendar } from "@/hooks/useCalendar";
import { VoterTrustPile, dotStyleForWeight } from "@/components/ui/VoterTrustPile";
import { EchoRing } from "@/components/road/EchoRing";

type BunkEvent = {
  id: string; title: string; venue: string; event_date: string; event_time: string;
  no_show_count?: number; live_status?: string; alert?: boolean; status?: string;
  prof_name?: string | null; prof_reliability?: number | null; prof_reliability_pct?: number | null;
  risk?: string; no_show_rate?: number | null; minutes_until?: number; is_due_soon?: boolean; notify_due?: boolean;
  scope_type?: string; scope_value?: string | null;
  avg_trust?: number | null; reporter_weights?: number[]; verified_witness_count?: number;
};

export default function BunkRadar({ userId }: { userId?: string | null }) {
  const [events, setEvents] = useState<BunkEvent[]>([]);
  const [alerts, setAlerts] = useState<BunkEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [initial, setInitial] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const { downloadIcs, loading: calLoading } = useCalendar(userId ?? null);

  const uid = (() => {
    if (userId) return userId;
    try { const raw = localStorage.getItem("physi_profile"); if (raw) return JSON.parse(raw)?.id ?? null; } catch {}
    return null;
  })();

  const profileScope = (() => {
    try {
      const raw = localStorage.getItem("physi_profile");
      if (raw) { const p = JSON.parse(raw); return { programme: p?.programme ?? "", level: p?.level ?? "" }; }
    } catch {}
    return { programme: "", level: "" };
  })();

  const fetchBunk = useCallback(async () => {
    try {
      const r = await fetch("/api/bunk", { cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (j?.ok) setEvents(j.events || []);
    } catch {} finally { setLoading(false); setInitial(false); }
  }, []);

  const fetchAlerts = useCallback(async () => {
    try {
      const body: any = {};
      if (uid) body.user_id = uid;
      if (profileScope.programme) body.programme = profileScope.programme;
      if (profileScope.level) body.level = profileScope.level;
      const r = await fetch("/api/alerts/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
      });
      const j = await r.json().catch(() => null);
      if (j?.ok && Array.isArray(j.events)) {
        // merge reliability into events by id
        const map = new Map(j.events.map((e: any) => [e.id, e]));
        setEvents(prev => prev.map(ev => {
          const a = map.get(ev.id) as any;
          if (!a) return ev;
          return { ...ev, prof_name: a.prof_name, prof_reliability: a.prof_reliability, prof_reliability_pct: a.prof_reliability_pct, risk: a.risk, no_show_rate: a.no_show_rate, minutes_until: a.minutes_until, is_due_soon: a.is_due_soon, notify_due: a.notify_due };
        }));
        // high-risk due soon
        setAlerts((j.events as any[]).filter(e => e.risk === "HIGH" && e.is_due_soon));
        // browser notification for HIGH due soon (10 min window)
        const highs = (j.events as any[]).filter(e => e.notify_due);
        if (highs.length > 0 && typeof window !== "undefined" && "Notification" in window) {
          try {
            if (Notification.permission === "granted") {
              for (const h of highs.slice(0, 1)) {
                new Notification(`⚠️ High no-show risk: ${h.title}`, { body: `${h.venue} in ~${h.minutes_until} min · ${h.prof_name || "prof"} — ${h.no_show_rate}% no-show rate` });
              }
            } else if (Notification.permission !== "denied") {
              Notification.requestPermission().catch(()=>{});
            }
          } catch {}
        }
      }
    } catch {}
  }, [uid, profileScope.programme, profileScope.level]);

  useEffect(() => {
    fetchBunk();
    fetchAlerts();
    const iv = setInterval(fetchBunk, 15000);
    const iv2 = setInterval(fetchAlerts, 30000);
    return () => { clearInterval(iv); clearInterval(iv2); };
  }, [fetchBunk, fetchAlerts]);

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

  function reliabilityBadge(ev: BunkEvent) {
    const r = String(ev.risk || "").toUpperCase();
    const pct = ev.prof_reliability_pct;
    const name = ev.prof_name;
    if (!name && pct == null && !r) return null;
    if (r === "HIGH") return <span title={name || ""} className="inline-flex items-center gap-1 rounded-full bg-red-500/20 border border-red-400/30 px-2 py-0.5 font-mono text-[10px] font-black text-red-200">⚠️ HIGH risk {pct != null ? `· ${100 - (pct as number)}% no-show` : ""}{name ? ` · ${name}` : ""}</span>;
    if (r === "MEDIUM") return <span title={name || ""} className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 border border-amber-400/30 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-200">● MEDIUM {pct != null ? `· ${pct}% reliable` : ""}{name ? ` · ${name}` : ""}</span>;
    if (pct != null || name) return <span title={name || ""} className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-400/20 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-200">✓ LOW {pct != null ? `· ${pct}% reliable` : ""}{name ? ` · ${name}` : ""}</span>;
    return null;
  }

  async function handleSubscribe() {
    try {
      await downloadIcs(profileScope.programme || undefined, profileScope.level || undefined);
      setMsg("Calendar downloaded — import into Google/Apple calendar");
    } catch (e) { setMsg((e as Error).message); }
  }

  return (
    <div className="rounded-[20px] border border-white/10 p-3" style={{ background: "rgba(255,255,255,0.06)", backdropFilter: "blur(16px) saturate(1.14)", WebkitBackdropFilter: "blur(16px) saturate(1.14)" }}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-amber-300">class bunk radar · live</p>
          <h3 className="text-[16px] font-black text-white">Is class holding?</h3>
          <p className="font-mono text-[11px] text-white/60">Anonymous heads-up — 3 confirmations triggers an alert</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <button onClick={fetchBunk} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-[11px] font-bold text-white hover:bg-white hover:text-black">{loading && !initial ? "…" : "↻ Refresh"}</button>
          <button onClick={handleSubscribe} disabled={calLoading} className="rounded-full bg-sky-500 px-3 py-1 font-mono text-[11px] font-black text-white hover:bg-sky-400 disabled:opacity-60">{calLoading ? "…" : "📅 Subscribe to calendar"}</button>
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2">
          <p className="font-mono text-[11px] font-black text-amber-200">⚠️ 10-min heads-up — HIGH no-show risk</p>
          {alerts.slice(0, 3).map(a => (
            <p key={a.id} className="font-mono text-[11px] text-amber-100/90">{a.title} @ {a.venue} · starts in {a.minutes_until} min {a.prof_name ? `· ${a.prof_name}` : ""} · {a.no_show_rate}% no-show rate</p>
          ))}
        </div>
      )}

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
          events.slice(0, 8).map(ev => {
            const avg = (ev as any).avg_trust as number | null;
            const weights = ((ev as any).reporter_weights as number[]) || [];
            const verifiedCount = (ev as any).verified_witness_count || 0;
            const isExpanded = !!expanded[ev.id];
            return (
            <div key={ev.id} className={`flex flex-col gap-1 rounded-[14px] border p-2 ${ev.alert || ev.notify_due ? "border-red-400/30 bg-red-500/10" : ev.risk==="HIGH" ? "border-amber-400/20 bg-amber-500/5" : "border-white/10 bg-black/20"}`}>
              <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-black text-white">{ev.title} <span className="font-mono text-[11px] font-medium text-white/60">· {ev.venue}</span></p>
                <p className="font-mono text-[11px] text-white/60">{String(ev.event_date).slice(0, 10)} · {String(ev.event_time).slice(0, 5)} · {ev.no_show_count ? `${ev.no_show_count} say no-show` : "no reports yet"}{ev.scope_value ? ` · ${ev.scope_value}` : ""}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1">{badge(ev)}{reliabilityBadge(ev)}
                  {ev.no_show_count ? (
                    <button onClick={()=> setExpanded(s=> ({...s, [ev.id]: !s[ev.id]}))} className="inline-flex items-center gap-1 rounded-full border border-amber-400/20 bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-200 hover:bg-amber-500/20">
                      🚨 {ev.no_show_count} reports{avg != null ? ` · ${Number(avg).toFixed(1)}× avg trust` : ""} {isExpanded ? "▴" : "▾"}
                    </button>
                  ) : null}
                  {verifiedCount > 0 && <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] font-black text-emerald-200">✓ {verifiedCount} verified witness{verifiedCount>1?"es":""}</span>}
                  <EchoRing eventId={ev.id} compact />
                </div>
                {ev.notify_due && <p className="mt-1 font-mono text-[11px] font-bold text-red-300">⏰ Starts in ~{ev.minutes_until} min — HIGH no-show risk, check before you go</p>}
                {isExpanded && weights.length > 0 && (
                  <div className="mt-2 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-2 py-1.5">
                    <span className="font-mono text-[10px] text-white/50">witnesses:</span>
                    <VoterTrustPile weights={weights} size={18} />
                    <span className="font-mono text-[10px] text-white/40">{weights.map(w=> `${Number(w).toFixed(w===1?0:2)}×`).join(" · ")}</span>
                  </div>
                )}
                {isExpanded && weights.length===0 && ev.no_show_count ? (
                  <p className="mt-2 font-mono text-[10px] text-white/40">Anonymous reports — weights hidden for privacy</p>
                ): null}
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                <button onClick={() => confirmNoShow(ev.id)} className="rounded-full bg-white px-3 py-1.5 font-mono text-[11px] font-black text-black hover:bg-red-50">Lecturer didn&apos;t show</button>
                <button onClick={() => confirmHappening(ev.id)} className="rounded-full border border-white/15 bg-white/5 px-3 py-1 font-mono text-[10px] font-bold text-white hover:bg-white hover:text-black">It&apos;s holding</button>
              </div>
              </div>
            </div>
          )})
        )}
      </div>
      {msg && <p className="mt-2 rounded-xl bg-white px-3 py-2 font-mono text-[11px] font-bold text-black">{msg}</p>}
      <p className="mt-2 font-mono text-[10px] text-white/40">Tip: if you&apos;re at the venue and no lecturer after 15 mins, tap “Lecturer didn&apos;t show” — others get a heads-up. Calendar exports your programme+level events (.ics).</p>
    </div>
  );
}
