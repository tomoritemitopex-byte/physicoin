"use client";
import React, { useEffect, useState, useMemo, useCallback } from "react";
import { BUILDINGS, LEVELS } from "@/lib/campus";
import { NODE_POSITIONS, orderedBuildings } from "./roadGeometry";
import { autoBumpStreak } from "@/lib/streak";

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
function progressPct(ev: EventRow): number {
  if (ev.progress_pct != null) return Math.round(Number(ev.progress_pct));
  const yes = Number(ev.vote_weight_yes ?? 0);
  const req = Number(ev.required_points ?? 8) || 8;
  if (ev.status === "verified") return 100;
  return Math.min(100, Math.round((yes / req) * 100));
}
function tallyLabel(ev: EventRow): string {
  if (ev.tally_text) return ev.tally_text;
  const yes = Number(ev.vote_weight_yes ?? 0);
  const req = Number(ev.required_points ?? 8) || 8;
  if (isVerified(ev)) return `✓ Confirmed — ${yes} of ${req} said yes`;
  const need = Math.max(0, Math.ceil(req - yes));
  return `${yes} of ${req} said yes — needs ${need} more`;
}

function addXp(amount: number, label: string) {
  try {
    const raw = localStorage.getItem("physi_profile");
    if (raw) {
      const p = JSON.parse(raw);
      p.mining_balance = Number((Number(p.mining_balance || 0) + amount).toFixed(2));
      localStorage.setItem("physi_profile", JSON.stringify(p));
    }
    window.dispatchEvent(new CustomEvent("physi-earn", { detail: label }));
  } catch {}
  try { autoBumpStreak("verify"); } catch {}
}

function XpBurst({ text }: { text: string }) {
  return (
    <span className="pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-[#b9f66a] px-3 py-1 font-mono text-xs font-black text-[#07111f] shadow-[0_8px_24px_rgba(185,246,106,0.4)] animate-[xpUp_1.6s_ease-out_forwards]">
      {text}
      <style>{`@keyframes xpUp {0%{transform:translate(-50%,0) scale(0.9);opacity:0}15%{opacity:1;transform:translate(-50%,-6px) scale(1)}100%{opacity:0;transform:translate(-50%,-28px) scale(1)}}`}</style>
    </span>
  );
}

export default function WindingRoad({ events, onVerify }: { events: EventRow[]; onVerify?: (ev: EventRow) => void }) {
  const [buildingId, setBuildingId] = useState<string | null>(null);
  const [level, setLevel] = useState<string | null>(null);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [xpFor, setXpFor] = useState<string | null>(null);
  const [xpText, setXpText] = useState<string>("+1 XP");
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
        const lvl = JSON.parse(raw)?.level;
        if (lvl) { setLevel(lvl); setLevelRestored(true); }
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
    if (filtered.length > 0) return filtered.slice(0, 8);
    return [];
  }, [filtered, level]);

  const ordered = useMemo(() => orderedBuildings(), []);

  const handleVerify = useCallback(async (ev: EventRow, vote: "YES" | "NO" = "YES") => {
    setVerifying(ev.id);
    try {
      let uid: string | null = null;
      try { const raw = localStorage.getItem("physi_profile"); if (raw) uid = JSON.parse(raw)?.id ?? null; } catch {}
      if (!uid) {
        try { window.dispatchEvent(new CustomEvent("physi-needs-profile")); } catch {}
        try { window.dispatchEvent(new CustomEvent("physi-toast", { detail: "Create a handle to vote — 1 $PHY stake required" })); } catch {}
        setVerifying(null);
        return;
      }
      // ensure session cookie exists
      try {
        const chk = await fetch("/api/auth/session", { cache: "no-store" });
        const cj = await chk.json().catch(() => ({} as any));
        if (!chk.ok || !cj.authenticated) {
          await fetch("/api/auth/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ user_id: uid }) });
        }
      } catch {}
      const r = await fetch("/api/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ verifier_id: uid, event_id: ev.id, vote }),
      });
      const j = await r.json().catch(() => ({} as any));
      if (r.ok && j.ok !== false) {
        if (onVerify) onVerify(ev);
        // single XP number — mining_balance is XP
        const label = vote === "YES" ? "+1 XP · verified" : "+1 XP";
        addXp(1, vote === "YES" ? "Verified +1 $PHY" : "Voted +1 XP");
        setXpFor(ev.id); setXpText(label);
        setTimeout(() => setXpFor(null), 1600);
        try { window.dispatchEvent(new CustomEvent("physi-toast", { detail: vote === "YES" ? "✓ +1 XP · staked 1 $PHY (refund if majority)" : "Voted · +1 XP" })); } catch {}
        // no refetch poll — single bar will update on next feed poll; keep UI clean
      } else {
        const msg = j?.message || j?.error || (r.status === 401 ? "Sign in to vote — missing session" : r.status === 402 ? "Need 1 $PHY to vote — check in first" : "Vote failed");
        try { window.dispatchEvent(new CustomEvent("physi-toast", { detail: msg })); } catch {}
      }
    } catch {
      try { window.dispatchEvent(new CustomEvent("physi-toast", { detail: "Vote failed — try again" })); } catch {}
    } finally {
      setVerifying(null);
    }
  }, [onVerify]);

  const handleSwipe = useCallback((ev: EventRow, dir: "yes" | "no" | "skip") => {
    if (dir === "yes") handleVerify(ev, "YES");
    else if (dir === "no") handleVerify(ev, "NO");
  }, [handleVerify]);

  // clean card renderer — one green tick bar, not 50 rows
  function CleanCard({ ev }: { ev: EventRow }) {
    const verified = isVerified(ev);
    const pct = progressPct(ev);
    const label = tallyLabel(ev);
    return (
      <div className="relative overflow-hidden rounded-[18px] border border-white/10 bg-[#0d1b2e]/80 p-4 backdrop-blur transition hover:border-white/15">
        {/* venue hero */}
        <p className="flex items-center gap-1.5 text-[22px] font-black leading-tight tracking-tight text-white">
          <span aria-hidden>📍</span> {ev.venue}
          {(ev as any).group_size > 1 && <span className="rounded-full bg-amber-500/20 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-300">{(ev as any).group_size} halls</span>}
        </p>
        <p className="mt-1 truncate text-[13px] font-medium leading-4 text-white/60">{ev.title}</p>
        <p className="mt-1 font-mono text-xs text-white/40">{String(ev.event_date).slice(0, 10)} · {String(ev.event_time).slice(0, 5)} · {ev.severity ? ev.severity.toUpperCase() : "ADVISORY"}</p>

        {/* ONE green tick bar — billion-interface: single progress, no 50-row table */}
        <div className="mt-3" aria-label={label}>
          <div className="flex items-center gap-2">
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
              <div className={`h-full rounded-full transition-all duration-500 ease-out ${verified ? "bg-[#b9f66a] shadow-[0_0_10px_rgba(185,246,106,0.5)]" : "bg-[var(--physi-cyan)]"}`} style={{ width: `${pct}%` }} />
            </div>
            <span className={`font-mono text-xs font-bold ${verified ? "text-[#b9f66a]" : "text-white/70"}`}>{verified ? "✓" : `${pct}%`}</span>
          </div>
          <p className="mt-1.5 font-mono text-[11px] leading-none text-white/45">{label}</p>
        </div>

        {/* actions — two big taps, 44px min, micro-interaction scale */}
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={(e) => { e.stopPropagation(); handleVerify(ev, "YES"); }}
            disabled={!!verifying}
            aria-label={`Confirm ${ev.title} at ${ev.venue}`}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#b9f66a] text-xl font-black text-[#07111f] shadow-lg hover:scale-[1.04] active:scale-[0.96] disabled:opacity-50 transition"
            style={{ minWidth: 48, minHeight: 48 }}
          >
            {verifying === ev.id ? "…" : "✓"}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleVerify(ev, "NO"); }}
            disabled={!!verifying}
            aria-label={`No ${ev.title} at ${ev.venue}`}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-base font-bold text-white/70 hover:bg-white hover:text-[#07111f] active:scale-[0.96] disabled:opacity-50 transition"
            style={{ minWidth: 48, minHeight: 48 }}
          >
            {verifying === ev.id ? "…" : "✕"}
          </button>
          <span className="font-mono text-[11px] text-white/30">tap ✓ / ✕ · swipe → ✓</span>
        </div>
        {xpFor === ev.id && <XpBurst text={xpText} />}
      </div>
    );
  }

  return (
    <>
      {/* building nodes */}
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

      {buildingId && building && (
        <div id="building-panel" className="relative z-10 mt-2" style={{ scrollSnapAlign: "start" }}>
          <div className="mx-auto max-w-lg flex items-center gap-3 rounded-2xl border border-white/10 bg-white/90 px-5 py-3 backdrop-blur-xl" style={{ scrollSnapAlign: "start" }}>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl text-[22px]" style={{ background: building!.color, color: "#ffffff" }}>{building!.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-black text-[#07111f]">{building!.code} · {building!.label}</p>
              <p className="font-mono text-[10px] text-black/50">tap a level below to see timetable</p>
            </div>
            <span className="rounded-full bg-[var(--physi-cyan)]/15 px-3 py-1 font-mono text-[11px] font-black text-[var(--physi-cyan)]">{building!.short}</span>
            <button onClick={() => setBuildingId(null)} className="rounded-full border border-black/10 bg-black/5 px-2.5 py-1 font-mono text-[11px] font-bold text-black/60 hover:bg-black hover:text-white transition">← all</button>
          </div>

          <div className="mx-auto mt-4 flex flex-wrap justify-center gap-2 max-w-lg" style={{ scrollSnapAlign: "start" }}>
            {LEVELS.map((lv) => {
              const active = level === lv;
              return (
                <button key={lv} onClick={() => setLevel(active ? null : lv)} aria-pressed={active} className={`rounded-xl border px-4 py-2.5 text-center font-black tracking-tight transition-all ${active ? "bg-[var(--physi-cyan)] text-[#07111f] border-[var(--physi-cyan)] shadow-[0_6px_18px_rgba(77,225,255,0.25)] scale-[1.03]" : "bg-white text-[#07111f] border-black/10 hover:bg-black/5"}`}>
                  <span className="block text-[14px]">{lv}</span>
                  <span className="font-mono text-[10px] font-medium opacity-60">{active ? "selected" : "level"}</span>
                </button>
              );
            })}
          </div>

          {level && (
            <div className="mx-auto mt-5 max-w-lg space-y-3" style={{ scrollSnapAlign: "start" }}>
              <div className="flex items-center justify-between px-1">
                <p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-white/80">{building.code} · {level} · {displayEvents.length} slots</p>
                <span className="rounded-full bg-white/10 px-2 py-0.5 font-mono text-[10px] text-white/60">1 bar · clean screen</span>
              </div>

              {displayEvents.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 px-6 py-8 text-center">
                  <p className="text-[14px] font-bold text-white">No timetable yet for {building.code} {level}</p>
                  <p className="mt-1 font-mono text-[12px] text-white/50">Be first — Post gist → 1-tap quiz</p>
                </div>
              ) : (
                displayEvents.map((ev) => (
                  <div key={ev.id} className="swipe-zone" onTouchStart={(e) => { (e.currentTarget as any)._sx = e.touches[0].clientX; (e.currentTarget as any)._sy = e.touches[0].clientY; }} onTouchEnd={(e) => {
                    const t = e.currentTarget as any;
                    const dx = e.changedTouches[0].clientX - (t._sx ?? 0);
                    const dy = Math.abs(e.changedTouches[0].clientY - (t._sy ?? 0));
                    if (Math.abs(dx) > 60 && dy < 50) { handleSwipe(ev, dx > 0 ? "yes" : "no"); }
                  }}>
                    <span className="swipe-action swipe-yes">✓ Yes</span>
                    <span className="swipe-action swipe-no">✕ No</span>
                    <CleanCard ev={ev} />
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {!buildingId && (
        <div className="relative z-10 mt-4 mx-auto max-w-lg space-y-3">
          <div className="flex items-center justify-between px-2">
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-white/80">All buildings · live feed · clean</p>
            <span className="rounded-full bg-white/10 px-2 py-0.5 font-mono text-[10px] text-white/60">{events.length} events</span>
          </div>
          {events.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 px-6 py-8 text-center">
              <p className="text-[14px] font-bold text-white">No events yet</p>
              <p className="mt-1 font-mono text-xs text-white/50">Post gist → 1-tap quiz starts the loop</p>
            </div>
          ) : (
            events.slice(0, 8).map((ev) => (
              <div key={ev.id} className="swipe-zone" onTouchStart={(e) => { (e.currentTarget as any)._sx = e.touches[0].clientX; (e.currentTarget as any)._sy = e.touches[0].clientY; }} onTouchEnd={(e) => {
                const t = e.currentTarget as any;
                const dx = e.changedTouches[0].clientX - (t._sx ?? 0);
                const dy = Math.abs(e.changedTouches[0].clientY - (t._sy ?? 0));
                if (Math.abs(dx) > 60 && dy < 50) { handleSwipe(ev, dx > 0 ? "yes" : "no"); }
              }}>
                <span className="swipe-action swipe-yes">✓ Yes</span>
                <span className="swipe-action swipe-no">✕ No</span>
                <CleanCard ev={ev} />
              </div>
            ))
          )}
        </div>
      )}

      <div className="swipe-hint px-4 mt-6">
        <span className="hint-yes">✓ Yes</span>
        <span className="hint-skip">↑ Skip</span>
        <span className="hint-no">✕ No</span>
      </div>
    </>
  );
}
