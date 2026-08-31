"use client";
import { useEffect, useState } from "react";

// Thumb-Gravity Glass Rail 60px — single bottom floating glass pill at 60px thumb arc: Road·Map·List + 60px FAB + bell + More #0d3b2a/70 blur16 spring 280ms
export default function GlassRail({ viewMode, setViewMode, onFab, bellCount, bellOpen, setBellOpen, fabFlash, hasNew, onMore }: { viewMode: string; setViewMode: (v: any) => void; onFab: () => void; bellCount: number; bellOpen: boolean; setBellOpen: (v: any) => void; fabFlash: boolean; hasNew: boolean; onMore?: () => void }) {
  const [seen, setSeen] = useState(0);
  useEffect(() => { try { const v = Number(localStorage.getItem("physi_bell_seen") || "0"); setSeen(v); } catch {} }, [bellOpen]);
  return (
    <div className="physicoin-glass-rail fixed bottom-3 left-1/2 z-40 -translate-x-1/2 one-rail-transition" style={{ transition: "transform 280ms cubic-bezier(.34,1.56,.64,1), opacity 280ms ease" }}>
      <div className="one-rail" style={{ background: "rgba(13,59,42,0.70)", backdropFilter: "blur(16px) saturate(1.22)", WebkitBackdropFilter: "blur(16px) saturate(1.22)", minHeight: 60 }}>
        {/* Road·Map·List thumb arc — spring 280ms */}
        <div className="flex items-center gap-1 rounded-full bg-white/5 p-1 one-rail-transition" style={{ transition: "all 280ms cubic-bezier(.34,1.56,.64,1)" }}>
          {(["road", "map", "list"] as const).map((m) => {
            const isMap = m === "road" || m === "map";
            const active = isMap ? viewMode === "map" : viewMode === m;
            // Road and Map both map to "map" view
            const label = m === "road" ? "Road" : m === "map" ? "Map" : "List";
            const target = isMap ? "map" : "list";
            return (
              <button key={m} onClick={() => setViewMode(target)} className={`rounded-full px-3 py-2 text-[11px] font-black tracking-wide one-rail-transition ${active ? "bg-white text-black shadow" : "bg-transparent text-white/80 hover:text-white"}`} style={{ transition: "all 280ms cubic-bezier(.34,1.56,.64,1)" }}>
                {label}
              </button>
            );
          })}
        </div>
        <div className="mx-1 h-8 w-px bg-white/10 shrink-0" />
        {/* FAB 60px */}
        <button onClick={onFab} aria-label="Create" className={`flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-full border-2 text-[26px] font-black leading-none one-rail-transition ${fabFlash ? "fab-gold-flash bg-amber-400 text-black border-amber-300" : "bg-white text-black border-white hover:scale-[1.03] shadow-[0_8px_24px_rgba(0,0,0,0.35)]"}`} style={{ transition: "transform 280ms cubic-bezier(.34,1.56,.64,1)" }}>
          +
        </button>
        <div className="mx-1 h-8 w-px bg-white/10 shrink-0" />
        {/* bell glass #0d3b2a/70 blur16 */}
        <button onClick={() => setBellOpen((v: boolean) => !v)} aria-label="Notifications" className="relative flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full border border-white/10 text-white one-rail-transition" style={{ background: "rgba(13,59,42,0.70)", backdropFilter: "blur(16px) saturate(1.22)", WebkitBackdropFilter: "blur(16px) saturate(1.22)", transition: "all 280ms cubic-bezier(.34,1.56,.64,1)" }}>
          <span className="text-[18px]">🔔</span>
          {(bellCount > 0 || hasNew) && <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-black text-white ring-2 ring-black">{bellCount > 0 ? bellCount : 1}</span>}
        </button>
        {/* More ⋯ */}
        <button onClick={() => onMore?.()} aria-label="More" className="flex h-[44px] shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/10 px-3 text-[11px] font-black text-white hover:bg-white hover:text-black one-rail-transition" style={{ transition: "all 280ms cubic-bezier(.34,1.56,.64,1)" }}>
          ⋯ More
        </button>
      </div>
      <p className="mt-1 text-center font-mono text-[9px] tracking-wide text-white/30">single rail · 60px arc · #0d3b2a/70 blur16 · Road·Map·List + FAB 60px + bell + More · spring 280ms · top pure forest 0 chrome · no duplicate bars</p>
    </div>
  );
}
