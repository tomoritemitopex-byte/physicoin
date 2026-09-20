"use client";
import { useEffect, useState, useCallback } from "react";

type EventRow = {
  id: string; title: string; venue: string; event_date: string; event_time: string;
  status: string; required_points?: number|string; vote_weight_yes?: number; vote_weight_no?: number;
  prev_venue?: string|null; tally_text?: string; progress_pct?: number; severity?: string;
  authority_points?: number|string;
};

const OFFLINE_KEY = "physi_last_events";

function quorum(ev: EventRow){
  const yesW = Number((ev as any).vote_weight_yes ?? (ev as any).authority_points ?? 0);
  const noW = Number((ev as any).vote_weight_no ?? 0);
  const total = yesW + noW;
  const ratio = total>0? yesW/total : 0;
  const required = Number(ev.required_points ?? 8) || 8;
  const pct = ev.progress_pct!=null ? Math.round(Number(ev.progress_pct)) : ev.status==="verified"?100: Math.min(100, Math.round((yesW/required)*100));
  const verified = ev.status==="verified" || yesW >= required;
  return { yesW, noW, total, ratio, required, pct, verified };
}

export default function TimetablePage(){
  const [ev, setEv] = useState<EventRow|null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [msg, setMsg] = useState<string|null>(null);

  useEffect(()=>{
    let cancelled=false;
    async function load(){
      try{
        const r=await fetch("/api/timetable?limit=20",{cache:"no-store"});
        const j=await r.json().catch(()=>({} as any));
        const list: EventRow[] = Array.isArray(j.events)? j.events : [];
        const pending = list.find(e=> e.status!=="verified") || list[0] || null;
        if(!cancelled){
          if(pending){ setEv(pending); try{ localStorage.setItem(OFFLINE_KEY, JSON.stringify({ts:Date.now(),events:list.slice(0,12)})); }catch{} }
          else throw new Error("empty");
        }
      }catch{
        if(!cancelled){
          try{
            const raw=localStorage.getItem(OFFLINE_KEY);
            if(raw){ const p=JSON.parse(raw); const list:EventRow[]=p.events||[]; const pend=list.find(e=>e.status!=="verified")||list[0]||null; if(pend){ setEv(pend); setOffline(true);} }
          }catch{}
        }
      } finally { if(!cancelled) setLoading(false); }
    }
    load();
    const onOff=()=> setOffline(!navigator.onLine);
    onOff();
    window.addEventListener("online", onOff); window.addEventListener("offline", onOff);
    return ()=>{ cancelled=true; window.removeEventListener("online", onOff); window.removeEventListener("offline", onOff); };
  },[]);

  const vote = useCallback(async(v:"YES"|"NO")=>{
    if(!ev) return;
    setVerifying(true); setMsg(null);
    try{
      let uid:string|null=null;
      try{ const raw=localStorage.getItem("physi_profile"); if(raw) uid=JSON.parse(raw)?.id??null; }catch{}
      if(!uid){ setMsg("Create a handle to vote — 1 $PHY stake required"); try{ window.dispatchEvent(new CustomEvent("physi-needs-profile")); }catch{} setVerifying(false); return; }
      try{
        const chk=await fetch("/api/auth/session",{cache:"no-store"});
        const cj=await chk.json().catch(()=>({} as any));
        if(!chk.ok||!cj.authenticated) await fetch("/api/auth/session",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({user_id:uid})});
      }catch{}
      const r=await fetch("/api/verify",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({verifier_id:uid, event_id:ev.id, vote:v})});
      const j=await r.json().catch(()=>({} as any));
      if(r.ok && j.ok!==false){ setMsg(v==="YES"?"✓ +1 $PHY · staked 1 $PHY (refund if majority)":"Voted · +1 $PHY"); }
      else{
        const code=String(j?.code||"");
        let m=String(j?.message||"");
        if(code==="UNAUTHORIZED"||r.status===401) m="Sign in to vote — create a handle first.";
        else if(code==="SELF_VOUCH"||r.status===403) m="Can't vote on your own post.";
        else if(code==="INSUFFICIENT_COINS"||code==="INSUFFICIENT_STAKE"||r.status===429||r.status===402) m="Need 1 PHY to vote — check in first.";
        else if(!m) m="Vote failed — try again";
        setMsg(m);
      }
    }catch{ setMsg("Vote failed — try again"); }
    finally{ setVerifying(false); }
  },[ev]);

  if(loading) return <div className="mx-auto max-w-[720px] px-4 py-10 text-center font-mono text-xs text-white/50">Loading clean screen…</div>;
  if(!ev) return (
    <div className="mx-auto max-w-[720px] px-4 py-10 text-center">
      <p className="font-mono text-xs uppercase tracking-[0.12em] text-slate-500">Timetable</p>
      <h1 className="mt-2 text-xl font-bold text-white">No pending events</h1>
      <p className="mt-1 text-sm text-slate-400">Post gist → 1-tap quiz starts the loop. {offline? "· offline · showing last ticks when back":""}</p>
      <a href="/app/roadmap" className="mt-6 inline-flex rounded-full bg-white px-6 py-3 text-sm font-semibold text-[#022c1e]">Open Road →</a>
    </div>
  );

  const q=quorum(ev);
  const venueChange = ev.prev_venue && String(ev.prev_venue).trim().toLowerCase()!==String(ev.venue).trim().toLowerCase() ? `${String(ev.prev_venue).trim()} → ${String(ev.venue).trim()}` : String(ev.venue);
  return (
    <div className="mx-auto max-w-[560px] px-4 py-6 pb-10">
      <p className="text-center font-mono text-[11px] uppercase tracking-[0.14em] text-white/50">Pending · one screen · no jargon</p>
      {offline && <p className="mt-2 text-center rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 font-mono text-[11px] font-bold text-amber-200">Offline — showing last green ticks</p>}
      {/* ONE SCREEN: venue change large type */}
      <div className="mt-6 overflow-hidden rounded-[24px] border border-white/10 bg-[#0d1b2e]/90 p-6 backdrop-blur shadow-[0_16px_48px_rgba(0,0,0,0.35)]">
        <p className="text-[30px] font-black leading-[0.9] tracking-tight text-white" style={{wordBreak:"break-word"}}><span aria-hidden>📍 </span>{venueChange}</p>
        <p className="mt-2 text-[14px] font-semibold text-white/70">{ev.title}</p>
        <p className="mt-1 font-mono text-xs text-white/40">{String(ev.event_date).slice(0,10)} · {String(ev.event_time).slice(0,5)} · {ev.severity?String(ev.severity).toUpperCase():"ADVISORY"}</p>

        {/* ONE progress bar — how many classmates agreed */}
        <div className="mt-6">
          <div className="flex items-end justify-between">
            <span className="font-mono text-[11px] font-bold tracking-wide text-white/60">AGREED</span>
            <span className="font-mono text-[13px] font-black text-white">{q.yesW.toFixed(0)}/{q.required.toFixed(0)} <span className="font-normal text-white/50">classmates</span></span>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <div className="h-4 flex-1 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={q.pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${q.yesW} of ${q.required} classmates agreed`}>
              <div className={`h-full rounded-full transition-all duration-500 ${q.verified ? "bg-[#b9f66a] shadow-[0_0_12px_rgba(185,246,106,0.5)]":"bg-[var(--physi-cyan)]"}`} style={{width:`${q.pct}%`}}/>
            </div>
            <span className={`font-mono text-sm font-black ${q.verified?"text-[#b9f66a]":"text-white"}`}>{q.verified?"✓":`${q.pct}%`}</span>
          </div>
          <p className="mt-2 font-mono text-[11px] text-white/45">{q.verified?`✓ Confirmed — ${q.yesW} classmates agreed`:`${q.yesW} agreed — needs ${Math.max(0,Math.ceil(q.required-q.yesW))} more for the green tick`}</p>
        </div>

        {/* two big buttons Yes/No — 44px min */}
        <div className="mt-7 flex gap-3">
          <button onClick={()=>vote("YES")} disabled={verifying} className="flex h-[56px] min-h-[44px] flex-1 items-center justify-center rounded-full bg-[#b9f66a] text-[16px] font-black text-[#07111f] shadow-lg hover:scale-[1.01] active:scale-[0.98] disabled:opacity-50 transition">{verifying?"…":"✓ Yes"}</button>
          <button onClick={()=>vote("NO")} disabled={verifying} className="flex h-[56px] min-h-[44px] flex-1 items-center justify-center rounded-full border border-white/15 bg-white/5 text-[16px] font-bold text-white hover:bg-white hover:text-[#07111f] active:scale-[0.98] disabled:opacity-50 transition">{verifying?"…":"✕ No"}</button>
        </div>
        {msg && <p className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-center text-sm font-medium text-white">{msg}</p>}
        <p className="mt-3 text-center font-mono text-[11px] text-white/30">tap ✓ / ✕ · one bar · no table</p>
      </div>
      <div className="mt-4 flex justify-center gap-2">
        <a href="/app/roadmap?view=list&filter=all" className="rounded-full border border-white/10 bg-white/5 px-4 py-2 font-mono text-xs text-white/70 hover:bg-white hover:text-black">All slots →</a>
        <a href="/app/mining" className="rounded-full bg-white px-4 py-2 font-mono text-xs font-bold text-[#07111f]">Check in to earn PHY →</a>
      </div>
    </div>
  );
}
