"use client";
import React, { useEffect, useState, useMemo, useCallback } from "react";
import { BUILDINGS, LEVELS } from "@/lib/campus";
import { GhostForm, ghostsForCount, ghostForSeed } from "@/lib/ghostAvatar";
import GhostAvatar from "@/components/road/GhostAvatar";

/** WindingRoad — Candy Crush-style serpentine road through the campus.
 * Events + verify calls flow up to the parent RoadmapPage via `events` prop.
 */

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

/** Ephemeral avatar drift — no DB writes. */
function useEphemeralGhosts(count: number) {
  const [forms, setForms] = useState<GhostForm[]>(() => ghostsForCount(count, Date.now()));
  const prevCountRef = React.useRef(count);
  useEffect(() => {
    if (count !== prevCountRef.current) {
      prevCountRef.current = count;
      setForms(ghostsForCount(count, Date.now() + Math.floor(Math.random() * 9999)));
    }
  }, [count]);
  useEffect(() => {
    if (count === 0) return;
    const iv = setInterval(() => {
      setForms((prev) => prev.map((g, i) => ghostForSeed(g.id, Date.now() + i * 7919)));
    }, 4500);
    return () => clearInterval(iv);
  }, [count]);
  return forms;
}

/* ── Serpentine road path control points ── */
const ROAD_WIDTH = 18;
const ROAD_STROKE = 3;
const NODE_POSITIONS: Record<string, { x: number; y: number }> = {
  phys:   { x: 50,  y: 60  },
  mbbs:   { x: 14,  y: 196 },
  pharm:  { x: 86,  y: 196 },
  dpt:    { x: 14,  y: 332 },
  bnsc:   { x: 86,  y: 332 },
  bmls:   { x: 50,  y: 468 },
  nutr:   { x: 14,  y: 604 },
  it:     { x: 86,  y: 604 },
};
const CLOCK_TOWER_POS = { x: 50, y: 468 };

function buildSvgPath(nodeIds: string[]): string {
  const pts = nodeIds
    .map((id) => NODE_POSITIONS[id])
    .filter(Boolean)
    .sort((a, b) => a.y - b.y);
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1], cur = pts[i];
    const cpx = (prev.x + cur.x) / 2;
    d += ` C ${cpx} ${prev.y}, ${cpx} ${cur.y}, ${cur.x} ${cur.y}`;
  }
  return d;
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
    // Clear level when building changes — but not if auto-restored from profile (applies to all buildings)
    if (buildingId && !levelRestored) setLevel(null);
  }, [buildingId, levelRestored]);
  useEffect(() => {
    // Auto-restore level from localStorage profile on mount for student-native default
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
    // No fake-event fallback — honest empty state
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

  const count = level ? Math.min(displayEvents.length, 6) : 0;
  const forms = useEphemeralGhosts(count);

  const orderedBuildings = useMemo(() => {
    return BUILDINGS.slice().sort((a, b) => (NODE_POSITIONS[a.id]?.y ?? 0) - (NODE_POSITIONS[b.id]?.y ?? 0));
  }, []);
  const svgPath = useMemo(() => buildSvgPath(orderedBuildings.map((b) => b.id)), [orderedBuildings]);

  const handleVerify = useCallback(async (ev: EventRow, vote: "YES" | "NO" = "YES") => {
    setVerifying(ev.id);
    try {
      let uid: string | null = null;
      try { const raw = localStorage.getItem("physi_profile"); if (raw) uid = JSON.parse(raw)?.id ?? null; } catch {}
      if (!uid) {
        if (vote === "YES") {
          setVerifyCounts((m) => ({ ...m, [ev.id]: (m[ev.id] ?? 0) + 1 }));
        }
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
        if (vote === "YES") {
          setVerifyCounts((m) => ({ ...m, [ev.id]: (m[ev.id] ?? 0) + 1 }));
        }
        if (onVerify) onVerify(ev);
      } else {
        // Failed POST — do not increment; notify parent to refresh
        if (onVerify) onVerify(ev);
      }
    } catch {
      // Network error — do not increment; notify parent to refresh
      if (onVerify) onVerify(ev);
    } finally {
      setVerifying(null);
    }
  }, [onVerify]);

  // swipe handlers
  const handleSwipe = useCallback((ev: EventRow, dir: "yes" | "no" | "skip") => {
    if (dir === "yes") handleVerify(ev, "YES");
    else if (dir === "no") handleVerify(ev, "NO");
    // skip = no-op
  }, [handleVerify]);

  return (
    <div className="winding-road-container relative min-h-screen w-full overflow-y-auto px-2 pb-28" style={{ scrollSnapType: "y mandatory" }}>
      {/* ── Forest 2.5D depth layers (fixed) ── */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden" aria-hidden="true">
        {/* layer 3 — far mountains */}
        <div className="absolute bottom-0 left-0 w-[140%] h-[45%] rounded-b-[50%] opacity-30" style={{ background: "linear-gradient(to top, rgba(16,55,32,0.9), transparent)", filter: "blur(3px)", transform: "translateX(-20%)", }} />
        {/* layer 2 — mid forest */}
        <div className="absolute bottom-0 left-0 w-[130%] h-[38%] rounded-b-[50%] opacity-35" style={{ background: "linear-gradient(to top, rgba(22,78,44,0.75), transparent)", filter: "blur(1.5px)", transform: "translateX(-15%)", }} />
        {/* layer 1 — near forest */}
        <div className="absolute bottom-0 left-0 w-[120%] h-[32%] rounded-b-[50%] opacity-40" style={{ background: "linear-gradient(to top, rgba(34,110,60,0.55), transparent)", filter: "blur(0px)", }} />
        {/* sky glow */}
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 h-[400px] w-[900px] rounded-full opacity-20" style={{ background: "radial-gradient(ellipse at center, rgba(26,95,72,0.45), transparent 70%)" }} />
        {/* candy well subtle glow */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-[60%] h-14 rounded-full opacity-20" style={{ background: "radial-gradient(ellipse at center, rgba(52,211,153,0.15), transparent 70%)", filter: "blur(12px)" }} />
      </div>

      {/* ── Road SVG ── */}
      <svg className="road-svg" viewBox="0 0 100 720" preserveAspectRatio="xMidYMid slice" style={{ minHeight: "100vh" }} role="img" aria-label="Serpentine campus road with 8 department buildings">
        <defs>
          <filter id="road-shadow"><feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="rgba(2,44,30,0.45)" /></filter>
          <filter id="road-glow"><feDropShadow dx="0" dy="0" stdDeviation="8" flood-color="rgba(52,211,153,0.35)" /></filter>
        </defs>
        {svgPath && (
          <>
            <path d={svgPath} fill="none" stroke="#0d3b2a" strokeWidth={ROAD_WIDTH} strokeLinecap="round" strokeLinejoin="round" filter="url(#road-shadow)" />
            <path d={svgPath} fill="none" stroke="#f0fdf4" strokeWidth={ROAD_WIDTH + ROAD_STROKE} strokeLinecap="round" strokeLinejoin="round" opacity="0.35" />
            <path d={svgPath} fill="none" stroke="#34d399" strokeWidth={ROAD_STROKE} strokeLinecap="round" strokeLinejoin="round" opacity="0.6" filter="url(#road-glow)" />
          </>
        )}
        {/* roadside grass wisps */}
        {orderedBuildings.slice(0, -1).map((b, i) => {
          const p1 = NODE_POSITIONS[b.id];
          const next = orderedBuildings[i + 1];
          const p2 = next ? NODE_POSITIONS[next.id] : p1;
          const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
          return (
            <React.Fragment key={i}>
              <path d={`M ${p1.x} ${p1.y + 1.2} Q ${mx} ${my + 2} ${p2.x} ${p2.y + 1.2}`} fill="none" stroke="rgba(52,211,153,0.08)" strokeWidth="1.5" />
              <path d={`M ${p1.x} ${p1.y - 1} Q ${mx} ${my - 1.5} ${p2.x} ${p2.y - 1}`} fill="none" stroke="rgba(134,239,172,0.06)" strokeWidth="1" />
            </React.Fragment>
          );
        })}
      </svg>

      {/* ── Building nodes along the road ── */}
      {orderedBuildings.map((b) => {
        const pos = NODE_POSITIONS[b.id];
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
            <div className="node-icon" style={{ background: active ? "rgba(255,255,255,0.96)" : `${b.color || "#34d399"}cc`, color: active ? "#022c1e" : "white" }}>
              <span style={{ fontSize: 26 }}>{b.icon}</span>
            </div>
            {cnt > 0 && <span className="node-count">{cnt}</span>}
            <span className="node-label">{b.code} · {b.label}</span>
          </button>
        );
      })}

      {/* ── Clock tower milestone ── */}
      <div className="clock-tower" style={{ left: `${CLOCK_TOWER_POS.x}%`, top: `${CLOCK_TOWER_POS.y}%`, position: "absolute", zIndex: 25 }}>
        <div className="tower-icon" role="img" aria-label="300L midpoint clock tower">🕛</div>
        <span className="tower-label">300L · midpoint</span>
      </div>

      {/* ── Building detail panel + events ── */}
      {buildingId && building && (
        <div id="building-panel" className="relative z-10 mt-2" style={{ scrollSnapAlign: "start" }}>
          {/* building header */}
          <div className="mx-auto max-w-lg flex items-center gap-3 rounded-2xl border border-white/10 bg-[#1a5f48]/80 px-5 py-3 backdrop-blur-xl" style={{ scrollSnapAlign: "start" }}>
          <span className="flex h-10 w-10 items-center justify-center rounded-xl text-[22px]" style={{ background: building!.color, color: "white" }}>{building!.icon}</span>
          <div className="flex-1 min-w-0">
          <p className="text-[15px] font-black text-white">{building!.code} · {building!.label}</p>
          <p className="font-mono text-[10px] text-white/50">tap a level below to see timetable</p>
          </div>
          <span className="rounded-full bg-white/10 px-3 py-1 font-mono text-[11px] font-black text-white">{building!.short}</span>
            <button onClick={() => setBuildingId(null)} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-[11px] font-bold text-white hover:bg-white hover:text-black">← all</button>
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
                  className={`rounded-xl border px-4 py-2.5 text-center font-black tracking-tight transition-all ${active ? "bg-white text-black border-white shadow-[0_6px_18px_rgba(0,0,0,0.25)] scale-[1.03]" : "bg-white/[0.06] text-white border-white/10 hover:bg-white/10"}`}
                >
                  <span className="block text-[14px]">{lv}</span>
                  <span className="font-mono text-[10px] font-medium opacity-60">{active ? "selected" : "level"}</span>
                </button>
              );
            })}
          </div>

          {/* events — WhatsApp feed */}
          {level && (
            <div className="mx-auto mt-5 max-w-lg space-y-3" style={{ scrollSnapAlign: "start" }}>
              <div className="flex items-center justify-between px-1">
                <p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-emerald-200">{building.code} · {level} · {displayEvents.length} slots</p>
                <span className="rounded-full bg-black/30 px-2 py-0.5 font-mono text-[10px] text-white/60">anonymous ghosts · ephemeral</span>
              </div>

              {displayEvents.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-6 py-8 text-center">
                  <p className="text-[14px] font-bold text-white">No timetable yet for {building.code} {level}</p>
                  <p className="mt-1 font-mono text-[12px] text-slate-400">Be first to gist — tap + on the rail</p>
                </div>
              ) : (
                displayEvents.map((ev, i) => {
                  const verified = isVerified(ev);
                  const cnt = verifyCounts[ev.id] ?? 0;
                  const ghostForm = forms[i % forms.length];
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
                      {/* swipe action hints */}
                      <span className="swipe-action swipe-yes">✓ Yes</span>
                      <span className="swipe-action swipe-no">✕ No</span>
                      <span className="swipe-action swipe-skip">↗ Skip</span>

                      <div className="event-header">
                        {ghostForm && (
                          <GhostAvatar form={ghostForm} size={28} label={`${cnt} verified`} animate={true} />
                        )}
                        <div className="flex-1 min-w-0">
                          <span className="event-time">{String(ev.event_time || "").slice(0, 5)} · {String(ev.event_date || "").slice(0, 10)}</span>
                          <p className="event-venue">{ev.venue}</p>
                          <p className="event-title">{ev.title}</p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-1 font-mono text-[10px] font-bold ${verified ? "bg-emerald-500 text-[#022c1e]" : "bg-white/10 text-slate-300"}`}>{verified ? "✓" : "·"}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-black/20 px-1.5 py-0.5 text-[10px] text-slate-300">{ev.severity ? ev.severity.toUpperCase() : "advisory"}</span>
                        <span className="font-mono text-[10px] text-white/40">·</span>
                        <span className="font-mono text-[10px] text-white/40">{ev.scope_type}{ev.scope_value ? ` · ${ev.scope_value}` : ""}</span>
                      </div>

                      {/* 24h fading urgency bar */}
                      <div className="urgency-bar">
                        <div className="urgency-fill" style={{ width: `${urgencyPct}%` }} />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="urgency-label">{timeLeft < 1 ? "expired" : `${timeLeft}h left · ${cnt} verified`}</span>
                        <div className="ghost-row">
                          {Array.from({ length: Math.min(cnt, 5) }).map((_, gi) => {
                            const gf = ghostForSeed(`w-${ev.id}-${gi}`, Date.now());
                            return <span key={gi} className="ghost-dot inline-block rounded-full" style={{ background: gf.fg, width: 16, height: 16, border: "2px solid rgba(2,44,30,0.5)" }} aria-hidden="true" />;
                          })}
                        </div>
                      </div>

                      {/* verify buttons — ✓ sends YES, ✕ sends NO */}
                      <div className="mt-3 flex items-center gap-3">
                        <button onClick={(e) => { e.stopPropagation(); handleVerify(ev, "YES"); }} disabled={verifying === ev.id} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-xl font-bold text-[#022c1e] shadow-lg hover:bg-emerald-400 disabled:opacity-50" style={{ minWidth: 48, minHeight: 48 }} aria-label={`Verify ${ev.title} at ${ev.venue}`}>{verifying === ev.id ? "…" : "✓"}</button>
                        <button onClick={(e) => { e.stopPropagation(); handleVerify(ev, "NO"); }} disabled={verifying === ev.id} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-base font-bold text-slate-200 hover:bg-white hover:text-[#022c1e] disabled:opacity-50" style={{ minWidth: 48, minHeight: 48 }} aria-label={`Reject ${ev.title} at ${ev.venue}`}>✕</button>
                        <span className="font-mono text-[10px] text-white/40">swipe → Yes / ← No / ↑ Skip</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}

      {/* ── When no building selected — show all events as the road feed ── */}
      {!buildingId && (
        <div className="relative z-10 mt-4 mx-auto max-w-lg space-y-3">
          <div className="flex items-center justify-between px-2">
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-emerald-200">All buildings · live feed</p>
            <span className="rounded-full bg-black/30 px-2 py-0.5 font-mono text-[10px] text-white/60">{events.length} events</span>
          </div>
          {events.slice(0, 12).map((ev) => {
            const verified = isVerified(ev);
            const cnt = verifyCounts[ev.id] ?? 0;
            const ghostForm = forms[0];
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
                  {ghostForm && <GhostAvatar form={ghostForm} size={28} label={`${cnt} verified`} animate={true} />}
                  <div className="flex-1 min-w-0">
                    <span className="event-time">{String(ev.event_time || "").slice(0, 5)} · {String(ev.event_date || "").slice(0, 10)}</span>
                    <p className="event-venue">{ev.venue}</p>
                    <p className="event-title">{ev.title}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-1 font-mono text-[10px] font-bold ${verified ? "bg-emerald-500 text-[#022c1e]" : "bg-white/10 text-slate-300"}`}>{verified ? "✓" : "·"}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="rounded-full bg-black/20 px-1.5 py-0.5 text-[10px] text-slate-300">{ev.severity ? ev.severity.toUpperCase() : "advisory"}</span>
                  <span className="font-mono text-[10px] text-white/40">·</span>
                  <span className="font-mono text-[10px] text-white/40">{ev.scope_type}{ev.scope_value ? ` · ${ev.scope_value}` : ""}</span>
                </div>
                <div className="urgency-bar"><div className="urgency-fill" style={{ width: `${Math.max(0, Math.min(100, 100 - (Number(ev.vote_weight_yes ?? 0) / Math.max(1, Number(ev.required_points ?? 1))) * 100))}%` }} /></div>
                <div className="flex items-center justify-between mt-1">
                  <span className="urgency-label">{cnt} verified</span>
                  <div className="ghost-row">{Array.from({ length: Math.min(cnt, 5) }).map((_, gi) => { const gf = ghostForSeed(`f-${ev.id}-${gi}`, Date.now()); return <span key={gi} className="ghost-dot inline-block rounded-full" style={{ background: gf.fg, width: 14, height: 14, border: "2px solid rgba(2,44,30,0.5)" }} aria-hidden="true" /> })}</div>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <button onClick={(e) => { e.stopPropagation(); handleVerify(ev, "YES"); }} disabled={verifying === ev.id} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-xl font-bold text-white shadow-lg hover:bg-emerald-400 disabled:opacity-50" style={{ minWidth: 48, minHeight: 48 }} aria-label={`Confirm ${ev.title} at ${ev.venue}`}>{verifying === ev.id ? "…" : "✓"}</button>
                  <button onClick={(e) => { e.stopPropagation(); handleVerify(ev, "NO"); }} disabled={verifying === ev.id} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-base font-bold text-slate-200 hover:bg-white hover:text-[#022c1e] disabled:opacity-50" style={{ minWidth: 48, minHeight: 48 }} aria-label={`No ${ev.title} at ${ev.venue}`}>✕</button>
                  <span className="font-mono text-[10px] text-white/40">swipe → ✓ / ← ✕</span>
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
    </div>
  );
}
