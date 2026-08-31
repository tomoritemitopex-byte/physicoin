"use client";
// Ghost Road: ghost dots 10% peers anon glide behind NOW pulse on rail from physi_canonical_log 7d count>7 only no PII opt-out
export type GhostDot = { id:string; hash:string; yPct:number; delay:number };
export const GHOST_OPT_OUT_KEY="physi_ghost_opt_out";
export function isGhostOptOut():boolean{ try{ return localStorage.getItem(GHOST_OPT_OUT_KEY)==="1"; }catch{return false;}}
export function setGhostOptOut(v:boolean){ try{ localStorage.setItem(GHOST_OPT_OUT_KEY, v?"1":"0"); }catch{}}
export async function fetchGhostDots():Promise<GhostDot[]>{
  if(isGhostOptOut()) return [];
  try{
    const r=await fetch("/api/ghosts",{cache:"no-store"}); const j=await r.json();
    if(!j?.dots) return [];
    // 10% sample already server-side, anon hash only
    return (j.dots as GhostDot[]).slice(0,12);
  }catch{ return []; }
}
export function anonGlideStyle(dot:GhostDot, nowPulse:number){
  // glide behind NOW: y = dot.yPct*svgH, pulse via nowPulse
  return { animationDelay: `${dot.delay}s`, opacity: 0.52 } as any;
}
