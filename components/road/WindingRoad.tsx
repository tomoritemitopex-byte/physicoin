"use client";
import React, { useEffect, useState, useMemo, useCallback } from "react";
import { BUILDINGS, LEVELS } from "@/lib/campus";
import { NODE_POSITIONS, orderedBuildings } from "./roadGeometry";
import GhostDrift, { GhostDots } from "./GhostDrift";

type EventRow = {
  id: string; title: string; venue: string; event_date: string; event_time: string;
  scope_type: string; scope_value: string | null; status: string;
  created_at: string; created_by?: string | null;
  slot_key?: string; required_points?: number | string; vote_weight_yes?: number; vote_weight_no?: number;
  tally_text?: string; progress_pct?: number; contenders?: any[]; venue_options?: string[]; group_size?: number; is_grouped?: boolean; severity?: string;
};

function isVerified(ev: EventRow) {
  if (ev.status === "verified") return true;
  const yes = Number(ev.vote_weight_yes ?? 0);
  return yes >= (Number(ev.required_points ?? 0) || 8);
}

export default function WindingRoad({ events, onVerify }: { events: EventRow[]; onVerify?: (ev: EventRow) => void }) {
  const [buildingId, setBuildingId] = useState<string | null>(null);
  const [level, setLevel] = useState<string | null>(null);
  const [verifying, setVerifying] = useState<string | null>(null);
  const building = useMemo(() => BUILDINGS.find((b) => b.id === buildingId) || null, [buildingId]);

  const buildingCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const b of BUILDINGS) m[b.id] = 0;
    for (const ev of events) {
      for (const b of BUILDINGS) {
        if (String(ev.title).toLowerCase().includes(b.code.toLowerCase()) || String(ev.venue).toLowerCase().includes(b.code.toLowerCase())) {
          m[b.id]++;
        }
      }
    }
    return m;
  }, [events]);

  const [levelRestored, setLevelRestored] = useState(false);
  useEffect(() => {
    if (buildingId && !levelRestored) setLevel(null);
  }, [buildingId, levelRestored]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem("physi_profile");
    if (raw) {
      try {
        const level_ = JSON.parse(raw)?.level;
        if (level_) { setLevel(level_); setLevelRestored(true); }
      } catch {}
    }
  }, []);

  const filtered = useMemo(() => {
    if (!level) return [] as EventRow[];
    return events.filter((ev) => {
      const sv = String(ev.scope_value || "").toLowerCase();
      const lv = level.toLowerCase();
      if (sv === lv) return true;
      if (sv === "" && String(ev.title).toLowerCase().includes(lv)) return true;
      if (String(ev.scope_type).toLowerCase() === "general") return true;
      return false;
    });
  }, [events, level]);

  const displayEvents = useMemo(() => {
    if (!level) return [] as EventRow[];
    if (filtered.length > 0) return filtered.slice(0, 14);
    return [];
  }, [filtered, level]);

  const [verifyCounts, setVerifyCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!level || displayEvents.length === 0) return;
    let cancel = false;
    async function poll() {
      for (const ev of displayEvents) {
        try {
          const r = await fetch(`/api/verify?event_id=${encodeURIComponent(ev.id)}`, { cache: "no-store" });
          const j = await r.json().catch(() => ({} as any));
          const rows: any[] = j.verifications ?? j.rows ?? [];
          const yes = rows.filter((x: any) => String(x.vote).toUpperCase() === "YES").length;
          if (!cancel) setVerifyCounts((m) => ({ ...m, [ev.id]: yes }));
        } catch {
          if (!cancel) setVerifyCounts((m) => ({ ...m, [ev.id]: 0 }));
        }
      }
    }
    poll();
    const iv = setInterval(poll, 15000);
    return () => { cancel = true; clearInterval(iv); };
  }, [level, displayEvents.map((e) => e.id).join(",")]);

  const ordered = useMemo(() => orderedBuildings(), []);

  const handleVerify = useCallback(async (ev: EventRow, vote: "YES" | "NO" = "YES") => {
    setVerifying(ev.id);
    try {
      let uid: string | null = null;
      try { const raw = localStorage.getItem("physi_profile"); if (raw) uid = JSON.parse(raw)?.id ?? null; } catch {}
      if (!uid) {
        if (vote === "YES") setVerifyCounts((m) => ({ ...m, [ev.id]: (m[ev.id] ?? 0) + 1 }));
        if (onVerify) onVerify(ev);
        setVerifying(null);
        return;
      }
      const r = await fetch("/api/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ verifier_id: uid, event_id: ev.id, vote }),
      });
      const j = await r.json().catch(() => ({} as any));
      if (r.ok && j.ok !== false) {
        if (vote === "YES") setVerifyCounts((m) => ({ ...m, [ev.id]: (m[ev.id] ?? 0) + 1 }));
        if (onVerify) onVerify(ev);
      } else {
        if (onVerify) onVerify(ev);
      }
    } catch {
      if (onVerify) onVerify(ev);
    } finally {
      setVerifying(null);
    }
  }, [onVerify]);

  const handleSwipe = useCallback((ev: EventRow, dir: "yes" | "no" | "skip") => {
    if (dir === "yes") handleVerify(ev, "YES");
    else if (dir === "no") handleVerify(ev, "NO");
  }, [handleVerify]);

  return (
    <>
      {/* ── Building nodes (interactive overlay; road SVG is SSR'd by WindingRoadStatic) ── */}
      {ordered.map((b) => {
        const pos = NODE_POSITIONS[b.id];
        if (!pos) return null;
        const active = buildingId === b.id;
        const cnt = buildingCounts[b.id] ?? 0;
        return (
          <button
            key={b.id}
            className={`building-node ${active ? "active" : ""}`}
            style={{ left: `${pos.x}%`, top: `${pos.y}%`, position: "absolute", zIndex: active ? 20 : 10 }}
            onClick={() => setBuildingId(active ? null : b.id)}
            aria-label={`${b.label} — ${cnt} events. Tap to enter`}
            aria-pressed={active}
            aria-controls={active ? "building-panel" : undefined}
          >
            <div className="node-icon" style={{ background: active ? "rgba(255,255,255,0.96)" : `${b.color}`, color: active ? "#0c1e3a" : "#ffffff" }}>
              <span style={{ fontSize: 26 }}>{b.icon}</span>
            </div>
            {cnt > 0 && <span className="node-count">{cnt}</span>}
            <span className="node-label">{b.code} · {b.label}</span>
          </button>
        );
      })}

      {/* ── Building detail panel + events ── */}
      {buildingId && building && (
        <div id="building-panel" className="relative z-10 mt-2" style={{ scrollSnapAlign: "start" }}>
          <div className="mx-auto max-w-lg flex items-center gap-3 rounded-2xl border border-sky/20 bg-white/90 px-5 py-3 backdrop-blur-xl" style={{ scrollSnapAlign: "start" }}>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl text-[22px]" style={{ background: building!.color, color: "#ffffff" }}>{building!.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-black text-ink">{building!.code} · {building!.label}</p>
              <p className="font-mono text-[10px] text-stone">tap a level below to see timetable</p>
            </div>
            <span className="rounded-full bg-sky/15 px-3 py-1 font-mono text-[11px] font-black text-sky">{building!.short}</span>
            <button onClick={() => setBuildingId(null)} className="rounded-full border border-sky/20 bg-sky/10 px-2.5 py-1 font-mono text-[11px] font-bold text-sky hover:bg-sky hover:text-white transition">← all</button>
          </div>

          {/* level pills */}
          <div className="mx-auto mt-4 flex flex-wrap justify-center gap-2 max-w-lg" style={{ scrollSnapAlign: "start" }}>
            {LEVELS.map((lv) => {
              const active = level === lv;
              return (
                <button
                  key={lv}
                  onClick={() => setLevel(active ? null : lv)}
                  aria-pressed={active}
                  className={`rounded-xl border px-4 py-2.5 text-center font-black tracking-tight transition-all ${active ? "bg-sky text-white border-sky shadow-[0_6px_18px_rgba(3,105,161,0.25)] scale-[1.03]" : "bg-white text-ink border-sky/20 hover:bg-sky/10"}`}
                >
                  <span className="block text-[14px]">{lv}</span>
                  <span className="font-mono text-[10px] font-medium opacity-60">{active ? "selected" : "level"}</span>
                </button>
              );
            })}
          </div>

          {/* events — campus glass feed */}
          {level && (
            <div className="mx-auto mt-5 max-w-lg space-y-3" style={{ scrollSnapAlign: "start" }}>
              <div className="flex items-center justify-between px-1">
                <p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-ink/80">{building.code} · {level} · {displayEvents.length} slots</p>
                <span className="rounded-full bg-sky/15 px-2 py-0.5 font-mono text-[10px] text-sky/80">anonymous ghosts · ephemeral</span>
              </div>

              {displayEvents.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-sky/20 bg-white/50 px-6 py-8 text-center">
                  <p className="text-[14px] font-bold text-ink">No timetable yet for {building.code} {level}</p>
                  <p className="mt-1 font-mono text-[12px] text-stone">Be first to gist — tap + on the rail</p>
                </div>
              ) : (
                displayEvents.map((ev, i) => {
                  const verified = isVerified(ev);
                  const cnt = verifyCounts[ev.id] ?? 0;
                  const timeLeft = ev.event_date ? Math.max(0, Math.round((new Date(ev.event_date + "T" + (ev.event_time || "00:00")).getTime() - Date.now()) / 3600000)) : 24;
                  const urgencyPct = Math.max(0, Math.min(100, 100 - (timeLeft / 24) * 100));
                  return (
                    <div key={ev.id} className="swipe-zone whatsapp-event" onTouchStart={(e) => { (e.currentTarget as any)._sx = e.touches[0].clientX; (e.currentTarget as any)._sy = e.touches[0].clientY; }} onTouchEnd={(e) => {
                      const t = e.currentTarget as any;
                      const dx = e.changedTouches[0].clientX - (t._sx ?? 0);
                      const dy = Math.abs(e.changedTouches[0].clientY - (t._sy ?? 0));
                      if (Math.abs(dx) > 60 && dy < 50) { handleSwipe(ev, dx > 0 ? "yes" : "no"); }
                      else if (dy > 60 && Math.abs(dx) < 50) { handleSwipe(ev, "skip"); }
                    }}>
                      <span className="swipe-action swipe-yes">✓ Yes</span>
                      <span className="swipe-action swipe-no">✕ No</span>
                      <span className="swipe-action swipe-skip">↗ Skip</span>

                      <div className="event-header">
                        <GhostDrift seedKey={`b-${ev.id}`} size={28} label={`${cnt} verified`} />
                        <div className="flex-1 min-w-0">
                          <span className="event-time">{String(ev.event_time || "").slice(0, 5)} · {String(ev.event_date || "").slice(0, 10)}</span>
                          <p className="event-venue">{ev.venue}</p>
                          <p className="event-title">{ev.title}</p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-1 font-mono text-[10px] font-bold ${verified ? "bg-green text-white" : "bg-sky/10 text-sky"}`}>{verified ? "✓" : "·"}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-sky/10 px-1.5 py-0.5 text-[10px] text-sky/80">{ev.severity ? ev.severity.toUpperCase() : "advisory"}</span>
                        <span className="font-mono text-[10px] text-stone/60">·</span>
                        <span className="font-mono text-[10px] text-stone/60">{ev.scope_type}{ev.scope_value ? ` · ${ev.scope_value}` : ""}</span>
                      </div>

                      <div className="urgency-bar"><div className="urgency-fill" style={{ width: `${urgencyPct}%` }} /></div>
                      <div className="flex items-center justify-between">
                        <span className="urgency-label">{timeLeft < 1 ? "expired" : `${timeLeft}h left · ${cnt} verified`}</span>
                        <GhostDots baseKey={`w-${ev.id}`} count={cnt} />
                      </div>

                      <div className="mt-3 flex items-center gap-3">
                        <button onClick={(e) => { e.stopPropagation(); handleVerify(ev, "YES"); }} disabled={verifying === ev.id} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-green text-xl font-bold text-white shadow-lg hover:bg-green/80 disabled:opacity-50" style={{ minWidth: 48, minHeight: 48 }} aria-label={`Verify ${ev.title} at ${ev.venue}`}>{verifying === ev.id ? "…" : "✓"}</button>
                        <button onClick={(e) => { e.stopPropagation(); handleVerify(ev, "NO"); }} disabled={verifying === ev.id} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-brick/20 bg-white text-base font-bold text-brick hover:bg-brick hover:text-white disabled:opacity-50" style={{ minWidth: 48, minHeight: 48 }} aria-label={`Reject ${ev.title} at ${ev.venue}`}>✕</button>
                        <span className="font-mono text-[10px] text-stone/60">swipe → Yes / ← No / ↑ Skip</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}

      {/* ── No building selected — all events feed ── */}
      {!buildingId && (
        <div className="relative z-10 mt-4 mx-auto max-w-lg space-y-3">
          <div className="flex items-center justify-between px-2">
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-ink/80">All buildings · live feed</p>
            <span className="rounded-full bg-sky/15 px-2 py-0.5 font-mono text-[10px] text-sky/80">{events.length} events</span>
          </div>
          {events.slice(0, 12).map((ev) => {
            const verified = isVerified(ev);
            const cnt = verifyCounts[ev.id] ?? 0;
            return (
              <div key={ev.id} className="swipe-zone whatsapp-event" onTouchStart={(e) => { (e.currentTarget as any)._sx = e.touches[0].clientX; (e.currentTarget as any)._sy = e.touches[0].clientY; }} onTouchEnd={(e) => {
                const t = e.currentTarget as any;
                const dx = e.changedTouches[0].clientX - (t._sx ?? 0);
                const dy = Math.abs(e.changedTouches[0].clientY - (t._sy ?? 0));
                if (Math.abs(dx) > 60 && dy < 50) { handleSwipe(ev, dx > 0 ? "yes" : "no"); }
                else if (dy > 60 && Math.abs(dx) < 50) { handleSwipe(ev, "skip"); }
              }}>
                <span className="swipe-action swipe-yes">✓ Yes</span>
                <span className="swipe-action swipe-no">✕ No</span>
                <span className="swipe-action swipe-skip">↗ Skip</span>
                <div className="event-header">
                  <GhostDrift seedKey={`f-${ev.id}`} size={28} label={`${cnt} verified`} />
                  <div className="flex-1 min-w-0">
                    <span className="event-time">{String(ev.event_time || "").slice(0, 5)} · {String(ev.event_date || "").slice(0, 10)}</span>
                    <p className="event-venue">{ev.venue}</p>
                    <p className="event-title">{ev.title}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-1 font-mono text-[10px] font-bold ${verified ? "bg-green text-white" : "bg-sky/10 text-sky"}`}>{verified ? "✓" : "·"}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="rounded-full bg-sky/10 px-1.5 py-0.5 text-[10px] text-sky/80">{ev.severity ? ev.severity.toUpperCase() : "advisory"}</span>
                  <span className="font-mono text-[10px] text-stone/60">·</span>
                  <span className="font-mono text-[10px] text-stone/60">{ev.scope_type}{ev.scope_value ? ` · ${ev.scope_value}` : ""}</span>
                </div>
                <div className="urgency-bar"><div className="urgency-fill" style={{ width: `${Math.max(0, Math.min(100, 100 - (Number(ev.vote_weight_yes ?? 0) / Math.max(1, Number(ev.required_points ?? 1))) * 100))}%` }} /></div>
                <div className="flex items-center justify-between mt-1">
                  <span className="urgency-label">{cnt} verified</span>
                  <GhostDots baseKey={`f-${ev.id}`} count={cnt} size={14} />
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <button onClick={(e) => { e.stopPropagation(); handleVerify(ev, "YES"); }} disabled={verifying === ev.id} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-green text-xl font-bold text-white shadow-lg hover:bg-green/80 disabled:opacity-50" style={{ minWidth: 48, minHeight: 48 }} aria-label={`Confirm ${ev.title} at ${ev.venue}`}>{verifying === ev.id ? "…" : "✓"}</button>
                  <button onClick={(e) => { e.stopPropagation(); handleVerify(ev, "NO"); }} disabled={verifying === ev.id} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-brick/20 bg-white text-base font-bold text-brick hover:bg-brick hover:text-white disabled:opacity-50" style={{ minWidth: 48, minHeight: 48 }} aria-label={`No ${ev.title} at ${ev.venue}`}>✕</button>
                  <span className="font-mono text-[10px] text-stone/60">swipe → ✓ / ← ✕</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* swipe hint */}
      <div className="swipe-hint px-4">
        <span className="hint-yes">✓ Yes</span>
        <span className="hint-skip">↑ Skip</span>
        <span className="hint-no">✕ No</span>
      </div>
    </>
  );
}