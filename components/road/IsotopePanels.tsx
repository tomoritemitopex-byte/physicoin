"use client";
import { useEffect, useState } from "react";
import { decayByHalfLife, decayCurve, REP_HALF_LIFE_DAYS, PROFILE_HALF_LIFE_DAYS, decayedRep } from "@/lib/rep";
import { getStreak, rescueStreak } from "@/lib/streak";
import { getBazaar, placeBet, claimBlast, bazaarTimeLeftMs, oracleResult } from "@/lib/oracle";
export function IsotopePanel({ rep }:{rep:number}){
  const [days,setDays]=useState(0);
  useEffect(()=>{ try{ const v=localStorage.getItem("physi_last_mine")||localStorage.getItem("physi_last_verify")||""; if(!v) return; const d=Math.floor((Date.now()-Date.parse(v))/86400000); setDays(Math.max(0,d)); }catch{} },[]);
  const dec= decayedRep(rep, days);
  const curve= decayCurve(rep,30);
  const max=Math.max(...curve,1), min=Math.min(...curve), range=max-min||1;
  return (
    <div className="rounded-xl border border-amber-400/15 bg-amber-500/5 p-3">
      <div className="flex items-center justify-between"><span className="font-mono text-[9px] font-bold uppercase text-amber-200/80">Isotope N(t)=N0·0.5^(t/half) · {REP_HALF_LIFE_DAYS}d half · profile {PROFILE_HALF_DAYS}d</span><span className="rounded-full bg-black/30 px-1.5 py-0.5 font-mono text-[9px] text-amber-100/70">{rep.toFixed(1)}→{dec.toFixed(1)} · {days}d</span></div>
      <svg width="100%" height={28} viewBox="0 0 140 28" className="mt-1"><path d={curve.map((v,i)=> `${i===0?"M":"L"} ${(i/(curve.length-1))*140} ${22-((v-min)/range)*16}`).join(" ")} fill="none" stroke="#f59e0b" strokeWidth={1.4} strokeLinecap="round"/><path d={`${curve.map((v,i)=> `${i===0?"M":"L"} ${(i/(curve.length-1))*140} ${22-((v-min)/range)*16}`).join(" ")} L 140 22 L 0 22 Z`} fill="#f59e0b" opacity={0.12}/></svg>
      <p className="mt-1 font-mono text-[9px] text-amber-100/60">client deterministic · verifiable · decayByHalfLife(N0,days,half)</p>
    </div>
  );
}
// fix const name
const PROFILE_HALF_DAYS=PROFILE_HALF_LIFE_DAYS;
export function StreakRescueCard(){
  const [s,setS]=useState(()=> getStreak());
  useEffect(()=>{ const id=setInterval(()=> setS(getStreak()), 2000); return()=>clearInterval(id); },[]);
  const low= s.decayed < s.streak;
  return (
    <div className="rounded-xl border border-orange-400/15 bg-orange-500/5 p-3">
      <div className="flex items-center justify-between"><span className="font-mono text-[11px] font-bold text-orange-200">🔥 Streak {s.streak}→{s.decayed} · half {7}d</span>{low && <button onClick={()=> setS({ streak: rescueStreak(), last: null, decayed: rescueStreak()})} className="rounded-full bg-white px-3 py-1 text-[11px] font-black text-black">Rescue +5</button>}</div>
      <p className="mt-1 font-mono text-[10px] text-orange-100/60">miss decays N·0.5^(d/7) · friend one-tap rescue entangles via BroadcastChannel + Vault</p>
      {!low && <button onClick={()=>{ const v=rescueStreak("you"); setS(getStreak()); }} className="mt-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-bold text-white/70">test rescue (entangle)</button>}
    </div>
  );
}
export function BazaarBlastCard({ squad }:{squad:string[]}){
  const [b,setB]=useState(()=> getBazaar());
  const [left,setLeft]=useState(()=> bazaarTimeLeftMs());
  useEffect(()=>{ const id=setInterval(()=>{ setB(getBazaar()); setLeft(bazaarTimeLeftMs()); }, 1000); const ch=(()=>{ try{ const c=new BroadcastChannel("physicoin_bazaar"); c.onmessage=()=> setB(getBazaar()); return c;}catch{ return null; }})(); return()=>{ clearInterval(id); try{ch?.close();}catch{} }; },[]);
  const hh=Math.floor(left/3600000), mm=Math.floor((left%3600000)/60000);
  return (
    <div className="rounded-xl border border-violet-400/15 bg-violet-500/5 p-3">
      <div className="flex items-center justify-between"><span className="font-mono text-[11px] font-bold text-violet-200">🎰 Oracle Bazaar Blast · 24h flash</span><span className="rounded-full bg-black/30 px-2 py-0.5 font-mono text-[10px] text-violet-100">{hh}h {mm}m left · pot {b.pot} · need 5</span></div>
      <p className="mt-1 font-mono text-[10px] text-violet-100/60">squads bet candies on oracle BTC/football · losers pot blast winner</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button onClick={()=>{ placeBet(squad.length? squad:["you","a","b"], "btc", "BTC_UP", 1); setB(getBazaar()); }} className="rounded-full bg-white px-3 py-1 text-[11px] font-black text-black">Bet BTC_UP 1</button>
        <button onClick={()=>{ placeBet(squad.length? squad:["you","a","b"], "btc", "BTC_DOWN", 1); setB(getBazaar()); }} className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-bold text-white">Bet BTC_DOWN 1</button>
        <button onClick={()=>{ placeBet(squad.length? squad:["you","a","b"], "football", "ARS", 1); setB(getBazaar()); }} className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-bold text-white">Bet ARS 1</button>
        {b.blastReady && <button onClick={()=>{ const pot=claimBlast(); setB(getBazaar()); alert(`blast! winner ${b.winner||"oracle"} pot ${pot} → +5 unlock`); }} className="rounded-full bg-amber-400 px-3 py-1 text-[11px] font-black text-black">💥 Blast claim {b.pot}</button>}
      </div>
      <p className="mt-1 font-mono text-[9px] text-violet-200/50">oracle BTC {oracleResult("btc")} · FB {oracleResult("football")} · deterministic daily</p>
    </div>
  );
}
