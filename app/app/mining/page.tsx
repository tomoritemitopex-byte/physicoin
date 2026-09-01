"use client";
import { useEffect, useState, useCallback, useRef } from "react";

type StoredProfile = { id:string; nickname:string; mining_balance:number|string; authority_final:number|string; authority_base:number|string; programme:string; level:string; };
type MiningLog = { id:string; user_id:string; earned_amount:number|string; authority_multiplier:number|string; created_at:string; };
const COOLDOWN_MS = 24*60*60*1000, BASE_REWARD=1, LS_LAST="physi_mining_last";
function fmtMs(ms:number){ if(ms<=0) return "00:00:00"; const s=Math.floor(ms/1000), h=String(Math.floor(s/3600)).padStart(2,"0"), m=String(Math.floor((s%3600)/60)).padStart(2,"0"), sec=String(s%60).padStart(2,"0"); return `${h}:${m}:${sec}`; }
function streakFromLogs(logs:MiningLog[]){
  if(!logs.length) return 0;
  const dates=new Set(logs.map(l=>{ const d=new Date(l.created_at); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; }));
  let c=0, cur=new Date(); for(let i=0;i<30;i++){ const k=`${cur.getFullYear()}-${cur.getMonth()}-${cur.getDate()}`; if(dates.has(k)) c++; else if(c>0) break; cur.setDate(cur.getDate()-1); } return c;
}

export default function MiningPage(){
  const [profile,setProfile]=useState<StoredProfile|null>(null);
  const [checked,setChecked]=useState(false);
  const [logs,setLogs]=useState<MiningLog[]>([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [cooldown,setCooldown]=useState(0);
  const [nextAt,setNextAt]=useState<Date|null>(null);
  const [err,setErr]=useState<string|null>(null);
  const [toast,setToast]=useState<string|null>(null);
  const timer=useRef<ReturnType<typeof setInterval>|null>(null);

  useEffect(()=>{ try{ const raw=localStorage.getItem("physi_profile"); if(raw){ const p=JSON.parse(raw); if(p?.id) setProfile(p); }}catch{} setChecked(true); },[]);
  useEffect(()=>{ if(!toast) return; const t=setTimeout(()=>setToast(null),2800); return()=>clearTimeout(t); },[toast]);

  const computeCooldown=useCallback((all:MiningLog[])=>{
    let last:number|null=null;
    if(all.length){ last=Math.max(...all.map(l=> new Date(l.created_at).getTime())); }
    try{ const v=localStorage.getItem(LS_LAST); if(v){ const t=new Date(v).getTime(); last=Math.max(last??0, t); }}catch{}
    if(!last){ setCooldown(0); setNextAt(null); return; }
    const rem=COOLDOWN_MS-(Date.now()-last);
    if(rem>0){ setCooldown(rem); setNextAt(new Date(last+COOLDOWN_MS)); } else { setCooldown(0); setNextAt(null); }
  },[]);

  const fetchMining=useCallback(async()=>{
    if(!profile?.id){ setLoading(false); return; }
    setLoading(true); setErr(null);
    try{
      const r=await fetch(`/api/mining?user_id=${encodeURIComponent(profile.id)}`,{ cache:"no-store"}); const j=await r.json();
      if(!r.ok||j.ok===false) throw new Error(j.error||"couldn't load");
      const rows:MiningLog[]=j.logs??[]; setLogs(rows); computeCooldown(rows);
    }catch(e:any){ setErr(e.message); } finally{ setLoading(false); }
  },[profile?.id, computeCooldown]);

  useEffect(()=>{ if(checked && profile?.id) fetchMining(); else if(checked && !profile) setLoading(false); },[checked, profile, fetchMining]);
  useEffect(()=>{
    if(cooldown<=0){ if(timer.current) clearInterval(timer.current); return; }
    timer.current=setInterval(()=> setCooldown(p=>{ if(p<=1000){ if(timer.current) clearInterval(timer.current); setNextAt(null); return 0; } return p-1000; }),1000);
    return()=>{ if(timer.current) clearInterval(timer.current); };
  },[cooldown>0]);

  async function checkIn(){
    if(!profile?.id) return;
    if(cooldown>0){ setToast(`Come back in ${fmtMs(cooldown)}`); return; }
    setBusy(true); setErr(null);
    try{
      const r=await fetch("/api/mining",{ method:"POST", headers:{ "content-type":"application/json" }, body: JSON.stringify({ user_id: profile.id, base_reward: BASE_REWARD })});
      const j=await r.json(); if(!r.ok||j.ok===false) throw new Error(j.error||"check-in failed");
      const earned=Number(j.earned ?? j.log?.earned_amount ?? BASE_REWARD);
      setToast(`+${earned.toFixed(0)} Rep — streak continues!`);
      try{ localStorage.setItem(LS_LAST,new Date().toISOString()); const nb=Number(profile.mining_balance??0)+earned; const np={...profile, mining_balance:nb}; setProfile(np); localStorage.setItem("physi_profile", JSON.stringify(np)); }catch{}
      setCooldown(COOLDOWN_MS); setNextAt(new Date(Date.now()+COOLDOWN_MS)); await fetchMining();
    }catch(e:any){ setErr(e.message); setToast(e.message); } finally{ setBusy(false); }
  }

  const streak=streakFromLogs(logs);
  const rep=profile? Number(profile.mining_balance??0).toFixed(0):"0";
  const mult=profile? Number(profile.authority_final??1).toFixed(2):"1.00";
  const preview=profile? (BASE_REWARD*Number(profile.authority_final??1)).toFixed(0):"1";

  if(!checked) return <div className="mx-auto max-w-[720px] px-4 py-10"><div className="h-32 animate-pulse rounded-2xl bg-white/[0.04]" /></div>;
  if(!profile) return (
    <div className="mx-auto max-w-[720px] px-4 py-10 text-center">
      <p className="font-mono text-xs uppercase tracking-[0.12em] text-slate-500">Daily Rep · streak</p>
      <h1 className="mt-2 text-2xl font-bold text-white">You need a handle first</h1>
      <p className="mt-2 text-sm text-slate-400">Create a handle to start your daily Rep streak.</p>
      <a href="/app/profile" className="mt-6 inline-flex rounded-full bg-white px-6 py-3 text-sm font-semibold text-[#070a12]">Create handle →</a>
    </div>
  );

  return (
    <div className="mx-auto max-w-[720px] px-4 py-8 sm:px-6 space-y-5">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.12em] text-slate-500">Rep · daily streak · WAT</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">Good morning, @{profile.nickname}</h1>
        <p className="mt-1 text-sm text-slate-400">One tap per 24h. Keep streak → your votes weigh more.</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          ["Rep", rep, "score"],
          ["Streak", String(streak), streak===1 ? "day" : "days"],
          ["Boost", `×${mult}`, streak>=3 ? "1.2x active" : "at 3 days"],
        ].map(([k,v,sub])=> (
          <div key={k} className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-3 py-3 text-center">
            <p className="font-mono text-xs uppercase tracking-wide text-slate-500">{k}</p>
            <p className="mt-1 font-mono text-lg font-bold text-white">{v}</p>
            <p className="font-mono text-xs text-slate-500">{sub}</p>
          </div>
        ))}
      </div>

      <div className="rounded-[20px] border border-white/[0.07] bg-white/[0.04] p-6 backdrop-blur">
        {cooldown>0 ? (
          <div className="rounded-2xl border border-amber-500/15 bg-amber-500/[0.06] p-4">
            <div className="flex items-center justify-between gap-3">
              <div><p className="text-sm font-semibold text-white">You&apos;re good for today ✓</p><p className="mt-1 font-mono text-xs text-amber-200/70">{nextAt ? `Next: ${nextAt.toLocaleString("en-GB",{weekday:"short",hour:"2-digit",minute:"2-digit",day:"2-digit",month:"short"})}` : "Come back tomorrow"}</p></div>
              <div className="rounded-xl bg-[#0b1020] px-3 py-2 text-center"><p className="font-mono text-xs text-slate-500">cooldown</p><p className="font-mono text-lg font-bold text-white">{fmtMs(cooldown)}</p></div>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-emerald-400" style={{ width:`${100-(cooldown/COOLDOWN_MS)*100}%`}} /></div>
          </div>
        ) : (
          <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.06] p-5 text-center sm:text-left sm:flex sm:items-center sm:justify-between">
            <div><p className="text-sm font-semibold text-white">Ready to earn Rep</p><p className="mt-1 text-sm text-emerald-200/70">One tap → +{preview} Rep · streak {streak}</p></div>
            <button onClick={checkIn} disabled={busy} className="mt-3 inline-flex rounded-full bg-white px-6 py-3 text-sm font-semibold text-[#070a12] hover:bg-slate-100 disabled:opacity-50 sm:mt-0">{busy ? "Checking…" : `Check in +${preview} Rep →`}</button>
          </div>
        )}
        {err && <p className="mt-3 rounded-xl border border-red-500/15 bg-red-500/10 px-3 py-2 text-sm text-red-300">{err}</p>}
        <p className="mt-3 text-center font-mono text-xs text-slate-500">24h cooldown · stored server + browser · Rep has no cash value</p>
      </div>

      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5">
        <div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-white">Recent Rep</h3><span className="font-mono text-xs text-slate-500">{logs.length} total</span></div>
        {loading ? <div className="mt-3 space-y-2">{[0,1,2].map(i=> <div key={i} className="h-12 animate-pulse rounded-xl bg-white/[0.04]" />)}</div>
        : logs.length===0 ? <p className="mt-3 text-center text-sm text-slate-500">No Rep yet — tap check-in above.</p>
        : <ul className="mt-3 space-y-2">{logs.slice(0,5).map(l=> (
            <li key={l.id} className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-[#0b1020] px-3 py-2.5">
              <span className="font-mono text-sm font-semibold text-white">+{Number(l.earned_amount).toFixed(0)} Rep</span>
              <span className="font-mono text-xs text-slate-500">{new Date(l.created_at).toLocaleDateString("en-GB",{day:"2-digit",month:"short"})} · ×{Number(l.authority_multiplier).toFixed(2)}</span>
            </li>
          ))}</ul>}
      </div>

      <p className="text-center font-mono text-xs text-slate-600">PHYSI · Rep is contribution, not cash · advisory feed only</p>
      {toast && <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-full bg-[#0c1222] border border-white/10 px-4 py-2 text-sm text-white shadow-xl">{toast}</div>}
    </div>
  );
}
