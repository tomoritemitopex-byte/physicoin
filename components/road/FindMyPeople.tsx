"use client";
import { useEffect, useState, useCallback } from "react";
import { BUILDINGS } from "@/lib/campus";
import { ghostForSeed } from "@/lib/ghostAvatar";
import GhostAvatar from "@/components/road/GhostAvatar";

/**
 * FindMyPeople — Squad locator + heat dots + wave back (5min TTL)
 * Student copy: "Find my people" / "Who's around?" / "Say hi"
 * No jargon: no quorum/zk/rep — use coins/badges/XP only in tooltips if needed.
 */
export default function FindMyPeople({ userId, programme, level }: { userId?: string | null; programme?: string; level?: string }) {
  // Initialize from physi_profile if available, fallback to props, then defaults
  const [prog, setProg] = useState(() => {
    try {
      const raw = localStorage.getItem("physi_profile");
      if (raw) {
        const profile = JSON.parse(raw);
        return (profile?.programme || programme || "PHYS").toUpperCase();
      }
      return programme || "PHYS";
    } catch {
      return programme || "PHYS";
    }
  });
  const [lvl, setLvl] = useState(() => {
    try {
      const raw = localStorage.getItem("physi_profile");
      if (raw) {
        const profile = JSON.parse(raw);
        return profile?.level || level || "200L";
      }
      return level || "200L";
    } catch {
      return level || "200L";
    }
  });
  const [building, setBuilding] = useState(() => {
    try {
      const raw = localStorage.getItem("physi_profile");
      if (raw) {
        const profile = JSON.parse(raw);
        return profile?.lastBuildingId || "phys";
      }
      // Also check for last used building in localStorage
      const lastBuilding = localStorage.getItem("physi_last_building");
      if (lastBuilding) return lastBuilding;
      return "phys";
    } catch {
      const lastBuilding = localStorage.getItem("physi_last_building");
      if (lastBuilding) return lastBuilding;
      return "phys";
    }
  });
  const [heat, setHeat] = useState<Record<string, number>>({});
  const [dots, setDots] = useState<any[]>([]);
  const [waves, setWaves] = useState<any[]>([]);
  const [pinging, setPinging] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [waveInboxOpen, setWaveInboxOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const uid = (() => {
    if (userId) return userId;
    try { const raw = localStorage.getItem("physi_profile"); if (raw) return JSON.parse(raw)?.id ?? null; } catch {}
    return null;
  })();

  const fetchHeat = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ programme: prog, level: lvl });
      if (uid) qs.set("viewer_id", uid);
      const r = await fetch(`/api/squad?${qs.toString()}`, { cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (j?.ok) { setHeat(j.heat || {}); setDots(j.dots || []); setWaves(j.waves || []); }
    } catch {} finally { setLoading(false); }
  }, [prog, lvl, uid]);

  useEffect(() => { fetchHeat(); const iv = setInterval(fetchHeat, 15000); return () => clearInterval(iv); }, [fetchHeat]);

  async function doPing() {
    if (!uid) { setMsg("Create your profile first (top of the page)"); return; }
    setPinging(true); setMsg(null);
    try {
      let coords: { lat: number; lng: number } | null = null;
      try {
        if (navigator.geolocation) {
          coords = await new Promise(res => {
            let done = false;
            const t = setTimeout(() => { if (!done) { done = true; res(null); } }, 2500);
            navigator.geolocation.getCurrentPosition(p => { if (!done) { done = true; clearTimeout(t); res({ lat: p.coords.latitude, lng: p.coords.longitude }); } }, () => { if (!done) { done = true; clearTimeout(t); res(null); } }, { enableHighAccuracy: false, timeout: 2400 });
          });
        }
      } catch {}
      const r = await fetch("/api/squad", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ user_id: uid, programme: prog, level: lvl, building_id: building, lat: coords?.lat ?? null, lng: coords?.lng ?? null }) });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) throw new Error(j?.message || "Couldn't ping");
      setMsg("You're on the map for 12 minutes — your squad can see a dot");
      fetchHeat();
    } catch (e) { setMsg((e as Error).message); } finally { setPinging(false); }
  }

  async function doWave(toUserId: string) {
    if (!uid) { setMsg("Create profile to say hi"); return; }
    try {
      const r = await fetch("/api/squad/wave", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ from_user: uid, to_user: toUserId, message: "👋 hey — you around?" }) });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) throw new Error(j?.message || "Wave failed");
      setMsg("Waved! They'll see it for 5 minutes");
      fetchHeat();
    } catch (e) { setMsg((e as Error).message); }
  }

  return (
    <div className="rounded-[20px] border border-white/10 p-3" style={{ background: "rgba(255,255,255,0.06)", backdropFilter: "blur(16px) saturate(1.14)", WebkitBackdropFilter: "blur(16px) saturate(1.14)" }}>
      <div className="flex items-center justify-between">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-300">find my people · anonymous</p>
          <h3 className="text-[16px] font-black text-white">Who's around?</h3>
          <p className="font-mono text-[11px] text-white/60">Dots are anonymous — only programme & level shown</p>
        </div>
        <span className="rounded-full bg-white px-2.5 py-1 font-mono text-[10px] font-black text-black">{dots.length} nearby</span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] font-bold text-white/70">Programme</span>
          <select value={prog} onChange={e => setProg(e.target.value.toUpperCase())} className="rounded-xl border border-white/10 bg-black/30 px-2 py-2 font-mono text-[12px] text-white">
            {BUILDINGS.map(b => <option key={b.id} value={b.code}>{b.code} · {b.short}</option>)}
            <option value="PHYS">PHYS</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] font-bold text-white/70">Level</span>
          <select value={lvl} onChange={e => setLvl(e.target.value)} className="rounded-xl border border-white/10 bg-black/30 px-2 py-2 font-mono text-[12px] text-white">
            {["100L","200L","300L","400L","500L","600L"].map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </label>
      </div>
      <div className="mt-2 flex gap-2">
        <select value={building} onChange={e => setBuilding(e.target.value)} className="flex-1 rounded-xl border border-white/10 bg-black/30 px-2 py-2 font-mono text-[12px] text-white">
          {BUILDINGS.map(b => <option key={b.id} value={b.id}>{b.icon} {b.code} · {b.label}</option>)}
        </select>
        <button onClick={doPing} disabled={pinging} className="rounded-full bg-white px-4 py-2 text-[13px] font-black text-black disabled:opacity-50 hover:bg-emerald-50">{pinging ? "…" : "📍 I'm here"}</button>
      </div>

      {/* Heat dots on mini campus strip */}
      {loading ? (
        <div className="mt-3 grid grid-cols-4 gap-2">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="h-[72px] animate-pulse rounded-[14px] bg-white/[0.04]" />
          ))}
        </div>
      ) : (
      <div className="mt-3 grid grid-cols-4 gap-2">
        {BUILDINGS.slice(0, 8).map(b => {
          const c = heat[b.id] ?? 0;
          const intensity = c >= 5 ? "hot" : c >= 2 ? "mid" : c > 0 ? "low" : "none";
          return (
            <div key={b.id} className="relative flex flex-col items-center gap-1 rounded-[14px] border p-2 text-center" style={{ background: intensity === "hot" ? "rgba(239,68,68,0.18)" : intensity === "mid" ? "rgba(245,158,11,0.16)" : intensity === "low" ? "rgba(16,185,129,0.14)" : "rgba(255,255,255,0.04)", borderColor: intensity !== "none" ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)" }}>
              <span className="text-[18px]">{b.icon}</span>
              <span className="font-mono text-[10px] font-black text-white">{b.code}</span>
              <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 font-mono text-[10px] font-bold ${intensity === "hot" ? "bg-red-500 text-white" : intensity === "mid" ? "bg-amber-400 text-black" : intensity === "low" ? "bg-emerald-400 text-black" : "bg-white/10 text-white/40"}`}>{c}</span>
              {intensity !== "none" && <span className="pointer-events-none absolute -right-1 -top-1 h-2 w-2 animate-pulse rounded-full bg-emerald-400" />}
            </div>
          );
        })}
      </div>
      )}

      {/* Dots row — ghost avatars */}
      {dots.length > 0 && (
        <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-2">
          <p className="font-mono text-[10px] font-bold uppercase tracking-wide text-white/60">{lvl} · {prog} · tap 👋 to say hi (5 min)</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {dots.slice(0, 12).map((d: any) => {
              const g = ghostForSeed(d.anon_seed || d.id, Date.now());
              const isMe = d.is_me;
              return (
                <div key={d.id} className={`flex items-center gap-1 rounded-full border px-2 py-1 ${isMe ? "border-emerald-400/40 bg-emerald-500/10" : "border-white/10 bg-white/5"}`}>
                  <GhostAvatar form={g} size={24} />
                  <span className="font-mono text-[10px] text-white/70">{isMe ? "you" : "someone"}</span>
                  {!isMe && uid && (
                    <button onClick={() => doWave(d.user_id || String(d.id).slice(0, 8))} className="ml-1 rounded-full bg-white px-2 py-0.5 font-mono text-[10px] font-black text-black hover:bg-emerald-50">👋</button>
                  )}
                </div>
              );
            })}
          </div>
          {waves.length > 0 && (
            <div className="mt-2 flex items-center gap-2">
              <button onClick={() => setWaveInboxOpen(v => !v)} className="rounded-full bg-emerald-400 px-3 py-1 font-mono text-[11px] font-black text-black">💬 {waves.length} hi{waves.length > 1 ? "s" : ""} for you {waveInboxOpen ? "▾" : "▸"}</button>
            </div>
          )}
          {waveInboxOpen && waves.length > 0 && (
            <ul className="mt-2 space-y-1">
              {waves.map((w: any) => (
                <li key={w.id} className="rounded-lg bg-white px-2 py-1.5 font-mono text-[11px] text-black">{w.message} <span className="text-slate-500">· {new Date(w.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · 5 min</span></li>
              ))}
            </ul>
          )}
        </div>
      )}
      {msg && <p className="mt-2 rounded-xl bg-white px-3 py-2 font-mono text-[11px] font-bold text-black">{msg}</p>}
      {dots.length === 0 && <p className="mt-2 font-mono text-[11px] text-white/50">No one from {prog} {lvl} has pinged yet — be first and tap “I'm here”</p>}
    </div>
  );
}
