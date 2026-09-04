"use client";
import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { BUILDINGS, LEVELS, Building } from "@/lib/campus";
import { GhostForm, ghostsForCount, ghostForSeed } from "@/lib/ghostAvatar";
import GhostAvatar, { GhostRow } from "@/components/road/GhostAvatar";

type EventRow = {
  id: string;
  title: string;
  venue: string;
  event_date: string;
  event_time: string;
  scope_type: string;
  scope_value: string | null;
  status: string;
  required_points?: number | string;
  created_at?: string;
  created_by?: string | null;
  slot_key?: string;
  vote_weight_yes?: number;
  vote_weight_no?: number;
  tally_text?: string;
  progress_pct?: number;
  severity?: string;
};

function isVerified(ev: EventRow) {
  if (ev.status === "verified") return true;
  const yes = Number(ev.vote_weight_yes ?? 0);
  return yes >= (Number(ev.required_points ?? 0) || 8);
}

/** Ephemeral avatar drift — no DB writes. Morphs on verification poll tick. */
function useEphemeralGhosts(count: number) {
  const [epoch, setEpoch] = useState(() => Date.now());
  const [forms, setForms] = useState<GhostForm[]>(() => ghostsForCount(count, Date.now()));
  const prevCountRef = useRef(count);

  useEffect(() => {
    if (count !== prevCountRef.current) {
      prevCountRef.current = count;
      const e = Date.now() + Math.floor(Math.random() * 9999);
      setEpoch(e);
      setForms(ghostsForCount(count, e));
    }
  }, [count]);

  // drift every 4.5s while mounted (pure UI wobble, no DB)
  useEffect(() => {
    if (count === 0) return;
    const iv = setInterval(() => {
      setForms((prev) => prev.map((g, i) => ghostForSeed(g.id, Date.now() + i * 7919)));
    }, 4500);
    return () => clearInterval(iv);
  }, [count]);

  return forms;
}

function BuildingCard({ b, active, onClick, count }: { b: Building; active: boolean; onClick: () => void; count: number }) {
  return (
    <button
      onClick={onClick}
      className={`group relative flex flex-col items-start gap-2 overflow-hidden rounded-[18px] border p-3 text-left transition-all duration-280`}
      style={{
        background: active ? "rgba(255,255,255,0.96)" : "rgba(255,255,255,0.08)",
        backdropFilter: "blur(16px) saturate(1.22)",
        WebkitBackdropFilter: "blur(16px) saturate(1.22)",
        borderColor: active ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.14)",
        boxShadow: active ? "0 10px 28px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.9)" : "0 8px 24px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.16)",
        transform: active ? "scale(1.02)" : "scale(1)",
      }}
    >
      <div className="flex w-full items-center justify-between">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl text-[18px] shadow-inner" style={{ background: b.color, color: "white" }}>
          {b.icon}
        </span>
        {count > 0 && <span className="rounded-full bg-black px-2 py-0.5 font-mono text-[10px] font-bold text-white">{count}</span>}
      </div>
      <div>
        <p className={`text-[13px] font-black leading-none tracking-tight ${active ? "text-black" : "text-white"}`}>{b.code}</p>
        <p className={`mt-0.5 line-clamp-1 text-[11px] font-medium leading-tight ${active ? "text-slate-700" : "text-slate-300"}`}>{b.label}</p>
        <p className={`font-mono text-[10px] ${active ? "text-slate-500" : "text-slate-400"}`}>{b.desc}</p>
      </div>
      {active && <span className="absolute right-2 top-2 h-2 w-2 animate-pulse rounded-full bg-emerald-500 ring-2 ring-white" />}
    </button>
  );
}

export default function CampusMap({ events, onVerify }: { events: EventRow[]; onVerify?: (ev: EventRow) => void }) {
  const [buildingId, setBuildingId] = useState<string | null>(null);
  const [level, setLevel] = useState<string | null>(null);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [pollTick, setPollTick] = useState(0);
  const building = useMemo(() => BUILDINGS.find((b) => b.id === buildingId) || null, [buildingId]);

  // counts per building (loose: events whose title/code hints or any level if no building filter)
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

  // when building changes, reset level (but not if auto-restored from profile)
  useEffect(() => { if (buildingId && !levelRestored) setLevel(null); }, [buildingId, levelRestored]);

  // auto-restore level from localStorage profile
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

  // filtered events for selected building+level
  const filtered = useMemo(() => {
    if (!level) return [] as EventRow[];
    // filter by level scope_value exact match OR general fallback title contains level
    return events.filter((ev) => {
      const sv = String(ev.scope_value || "").toLowerCase();
      const lv = level.toLowerCase();
      if (sv === lv) return true;
      if (sv === "" && String(ev.title).toLowerCase().includes(lv)) return true;
      if (String(ev.scope_type).toLowerCase() === "general") return true;
      return false;
    });
  }, [events, level]);

  // No fake fallback — honest empty state
  const displayEvents = useMemo(() => {
    if (!level) return [] as EventRow[];
    if (filtered.length > 0) return filtered.slice(0, 12);
    return [];
  }, [filtered, level]);

  // ephemeral ghosts per event — derived from verification count + poll tick (no DB)
  const [verifyCounts, setVerifyCounts] = useState<Record<string, number>>({});
  // poll verify counts for displayEvents
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
      if (!cancel) setPollTick((t) => t + 1);
    }
    poll();
    const iv = setInterval(poll, 15000);
    return () => {
      cancel = true;
      clearInterval(iv);
    };
  }, [level, displayEvents.map((e) => e.id).join(",")]);

  const handleVerify = useCallback(
    async (ev: EventRow, vote: "YES" | "NO" = "YES") => {
      setVerifying(ev.id);
      try {
        let uid: string | null = null;
        try {
          const raw = localStorage.getItem("physi_profile");
          if (raw) uid = JSON.parse(raw)?.id ?? null;
        } catch {}
        if (!uid) {
          if (vote === "YES") {
            setVerifyCounts((m) => ({ ...m, [ev.id]: (m[ev.id] ?? 0) + 1 }));
          }
          setPollTick((t) => t + 1);
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
          setPollTick((t) => t + 1);
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
    },
    [onVerify]
  );

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-emerald-300">campus map · tap a building</p>
          <h2 className="text-[18px] font-black tracking-tight text-white">Faculties & Programmes</h2>
        </div>
        {buildingId && (
          <button onClick={() => setBuildingId(null)} className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 font-mono text-[11px] font-bold text-white hover:bg-white hover:text-black">
            ← All buildings
          </button>
        )}
      </div>

      {/* Buildings grid */}
      {!buildingId ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {BUILDINGS.map((b) => (
            <BuildingCard key={b.id} b={b} active={false} onClick={() => setBuildingId(b.id)} count={buildingCounts[b.id] ?? 0} />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {BUILDINGS.map((b) => (
              <BuildingCard key={b.id} b={b} active={b.id === buildingId} onClick={() => setBuildingId(b.id)} count={buildingCounts[b.id] ?? 0} />
            ))}
          </div>

          {/* Levels inside building */}
          <div className="rounded-[18px] border border-white/10 p-3" style={{ background: "rgba(13,59,42,0.45)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full text-[13px]" style={{ background: building?.color, color: "white" }}>
                {building?.icon}
              </span>
              <div>
                <p className="text-[13px] font-black text-white">
                  {building?.code} · {building?.label}
                </p>
                <p className="font-mono text-[10px] text-white/60">tap a level to see timetable</p>
              </div>
              <span className="ml-auto rounded-full bg-white px-2.5 py-1 font-mono text-[10px] font-black text-black">{building?.short}</span>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
              {LEVELS.map((lv) => {
                const active = level === lv;
                return (
                  <button
                    key={lv}
                    onClick={() => setLevel(lv)}
                    className={`rounded-[14px] border px-3 py-3 text-center font-black tracking-tight transition-all ${active ? "bg-white text-black border-white shadow-[0_6px_18px_rgba(0,0,0,0.25)] scale-[1.02]" : "bg-white/[0.06] text-white border-white/10 hover:bg-white/10"}`}
                  >
                    <span className="block text-[14px]">{lv}</span>
                    <span className="font-mono text-[10px] font-medium opacity-60">{active ? "selected" : "level"}</span>
                  </button>
                );
              })}
            </div>

            {/* Events / timetable for level */}
            {level && (
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="font-mono text-[11px] font-bold tracking-wide text-emerald-200">
                    {building?.code} · {level} · {displayEvents.length} {displayEvents.length === 1 ? "slot" : "slots"}
                  </p>
                  <span className="rounded-full bg-black/30 px-2 py-0.5 font-mono text-[10px] text-white/60">anonymous ghosts · ephemeral</span>
                </div>

                {displayEvents.length === 0 ? (
                  <div className="rounded-[14px] border border-dashed border-white/10 bg-white/[0.03] px-4 py-6 text-center">
                    <p className="text-[13px] font-bold text-white">No timetable yet for {building?.code} {level}</p>
                    <p className="mt-1 font-mono text-[11px] text-slate-400">Be first to gist — tap + on the rail</p>
                  </div>
                ) : (
                  displayEvents.map((ev) => {
                    const verified = isVerified(ev);
                    const cnt = verifyCounts[ev.id] ?? 0;
                    return (
                      <EventRowCard key={ev.id} ev={ev} verified={verified} count={cnt} verifying={verifying === ev.id} onVerify={() => handleVerify(ev)} pollTick={pollTick} />
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <p className="text-center font-mono text-[9.5px] leading-tight text-white/25">buildings = programmes (PHYS/MBBS/DPT/BNSc/BMLS/PHARM/NUTR/IT) · levels 100L–600L · events = timetable · ghosts drift ephemerally — no identity stored</p>
    </div>
  );
}

function useHallResolveAlias(venue: string) {
  const [resolved, setResolved] = useState<null | { canonical: string; alias: string }>(null);
  useEffect(() => {
    if (!venue) return;
    let cancel=false;
    fetch(`/api/halls/resolve?alias=${encodeURIComponent(venue)}`, { cache: "no-store" })
      .then(r=>r.json()).then(j=>{
        if(cancel) return;
        if(j.resolved && j.canonical && String(j.canonical).toLowerCase() !== String(venue).toLowerCase()){
          setResolved({ canonical: j.canonical, alias: j.alias });
        } else setResolved(null);
      }).catch(()=>{});
    return ()=>{ cancel=true; };
  }, [venue]);
  return resolved;
}

function EventRowCard({ ev, verified, count, verifying, onVerify, pollTick }: { ev: EventRow; verified: boolean; count: number; verifying: boolean; onVerify: () => void; pollTick: number }) {
  const forms = useEphemeralGhosts(count);
  const hallResolved = useHallResolveAlias(String(ev.venue||""));
  // also morph on pollTick
  const [driftKey, setDriftKey] = useState(0);
  useEffect(() => {
    // pollTick triggers ghost drift already via count epoch, but also nudge key for CSS enter
    setDriftKey((k) => k + 1);
  }, [pollTick, count]);

  return (
    <div
      className={`relative overflow-hidden rounded-[16px] border p-3 ${verified ? "border-emerald-400/30 bg-emerald-500/10" : "border-white/10 bg-white/[0.05]"}`}
      style={{ backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <h4 className="truncate text-[13px] font-black text-white">{ev.title}</h4>
            {verified ? <span className="rounded-full bg-emerald-500 px-2 py-0.5 font-mono text-[10px] font-black text-white">✓ verified</span> : <span className="rounded-full bg-white/10 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-300">pending</span>}
            {ev.severity && <span className={`rounded-full px-2 py-0.5 font-mono text-[9px] font-bold ${ev.severity === "cancelled" ? "bg-red-500 text-white" : ev.severity === "shift" ? "bg-amber-400 text-black" : "bg-sky-500 text-white"}`}>{ev.severity}</span>}
          </div>
          <p className="mt-0.5 flex flex-wrap gap-2 font-mono text-[11px] text-slate-300">
            <span className="inline-flex items-center gap-1">
              📍 {hallResolved ? hallResolved.canonical : ev.venue}
              {hallResolved && <span className="ml-1 text-[10px] italic text-amber-300">(was: {hallResolved.alias})</span>}
            </span>
            <span className="opacity-40">·</span>
            <span>
              {String(ev.event_date).slice(0, 10)} · {String(ev.event_time).slice(0, 5)}
            </span>
            <span className="opacity-40">·</span>
            <span className="rounded-full bg-black/20 px-1.5 py-0.5 text-[10px]">{ev.scope_type} {ev.scope_value ? `· ${ev.scope_value}` : ""}</span>
          </p>
        </div>
        <button
          onClick={onVerify}
          disabled={verifying}
          className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-black transition ${verifying ? "bg-white/20 text-white cursor-wait" : "bg-white text-black hover:bg-slate-100 shadow"}`}
        >
          {verifying ? "…" : verified ? "Verify +" : "Verify"}
        </button>
      </div>

      {/* Anonymous ghost row — drifts ephemerally, never shows handles */}
      <div key={driftKey} className="mt-2.5 flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-2.5 py-1.5">
        {count > 0 ? (
          <>
            <GhostRow forms={forms} size={28} max={5} />
            <span className="ml-auto hidden sm:inline font-mono text-[10px] font-bold text-emerald-300">tap Verify → ghost morphs</span>
          </>
        ) : (
          <>
            <div className="flex -space-x-1.5 opacity-40">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-7 w-7 rounded-full border-2 border-[#022c1e] bg-white/10" style={{ backdropFilter: "blur(8px)" }} />
              ))}
            </div>
            <span className="ml-2 font-mono text-[10px] text-slate-400">no one verified yet — be first (anonymous)</span>
          </>
        )}
      </div>
    </div>
  );
}
