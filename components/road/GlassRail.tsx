"use client";
import { useEffect, useState } from "react";
// Thumb-Gravity Glass Rail 60px — single bottom floating glass pill at 60px thumb arc: Road/Map/List + 60px FAB + bell #0d3b2a/70 blur16
export default function GlassRail({ viewMode, setViewMode, onFab, bellCount, bellOpen, setBellOpen, fabFlash, hasNew }:{ viewMode:string; setViewMode:(v:any)=>void; onFab:()=>void; bellCount:number; bellOpen:boolean; setBellOpen:(v:any)=>void; fabFlash:boolean; hasNew:boolean }){
  const [seen,setSeen]=useState(0);
  useEffect(()=>{ try{ const v=Number(localStorage.getItem("physi_bell_seen")||"0"); setSeen(v);}catch{} },[bellOpen]);
  return (
    <div className="physicoin-glass-rail fixed bottom-3 left-1/2 z-40 -translate-x-1/2">
      <div className="glass-rail-inner flex items-center gap-1.5 rounded-full border border-white/10 px-2 py-2 shadow-[0_16px_40px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.16)]" style={{ background:"rgba(13,59,42,0.70)", backdropFilter:"blur(16px) saturate(1.22)", WebkitBackdropFilter:"blur(16px) saturate(1.22)", minHeight:60 }}>
        {/* Road/Map/List thumb arc */}
        <div className="flex items-center gap-1 rounded-full bg-white/5 p-1">
          {(["map","list"] as const).map(m=> (
            <button key={m} onClick={()=>setViewMode(m)} className={`rounded-full px-3.5 py-2 text-[12px] font-black tracking-wide transition ${viewMode===m? "bg-white text-black shadow":"bg-transparent text-white/80 hover:text-white"}`}>{m==="map"?"Road":"List"}</button>
          ))}
          <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-1 text-[10px] font-bold text-white/60">thumb 60px</span>
        </div>
        <div className="mx-1 h-8 w-px bg-white/10" />
        {/* FAB 60px */}
        <button onClick={onFab} aria-label="Create" className={`flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-full border-2 text-[26px] font-black leading-none transition ${fabFlash?"fab-gold-flash bg-amber-400 text-black border-amber-300":"bg-white text-black border-white hover:scale-[1.03] shadow-[0_8px_24px_rgba(0,0,0,0.35)]"}`}>+</button>
        <div className="mx-1 h-8 w-px bg-white/10" />
        {/* bell glass #0d3b2a/70 blur16 */}
        <button onClick={()=>setBellOpen((v:boolean)=>!v)} aria-label="Notifications" className="relative flex h-[44px] w-[44px] items-center justify-center rounded-full border border-white/10 text-white" style={{ background:"rgba(13,59,42,0.70)", backdropFilter:"blur(16px) saturate(1.22)", WebkitBackdropFilter:"blur(16px) saturate(1.22)"}}>
          <span className="text-[18px]">🔔</span>
          {(bellCount>0||hasNew) && <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-black text-white ring-2 ring-black">{bellCount>0? bellCount:1}</span>}
        </button>
      </div>
      <p className="mt-1 text-center font-mono text-[9px] tracking-wide text-white/30">single rail · 60px arc · #0d3b2a/70 blur16</p>
    </div>
  );
}
