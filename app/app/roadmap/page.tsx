"use client";
import { useEffect, useState, useCallback, useMemo, useRef } from "react";

type EventRow = {
  id: string;
  title: string;
  venue: string;
  event_date: string;
  event_time: string;
  scope_type: string;
  scope_value: string | null;
  status: string;
  authority_points: number | string;
  required_points: number | string;
  created_at: string;
};

type PersonalBubble = {
  localId: string;
  title: string;
  venue: string;
  event_date: string;
  event_time: string;
  scope_type: string;
  scope_value: string | null;
  createdAt: number;
  countdown: number; // 10 -> 0
  quorumPct: number; // 0 -> 80+
  broadcasting: boolean;
  broadcasted: boolean;
};

function isVerified(ev: EventRow){
  if(ev.status==="verified") return true;
  const ap=Number(ev.authority_points??0);
  const rp=Number(ev.required_points??0);
  return rp>0 && ap>=rp;
}
function fmtDate(s:string){
  if(!s) return "";
  try{ const d=new Date(s); if(isNaN(d.getTime())) return String(s).slice(0,10); return d.toLocaleDateString("en-GB",{day:"2-digit",month:"short"});}catch{return String(s).slice(0,10);}
}
function fmtTime(s:string){ return String(s??"").slice(0,5); }

export default function RoadmapPage(){
  const [events,setEvents]=useState<EventRow[]>([]);
  const [loading,setLoading]=useState(true);
  const [err,setErr]=useState<string|null>(null);
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [personal,setPersonal]=useState<PersonalBubble[]>([]);
  const [voteBusy,setVoteBusy]=useState<string|null>(null);
  const [toast,setToast]=useState<string|null>(null);
  const [sheetOpen,setSheetOpen]=useState(true);
  const [statsUsers,setStatsUsers]=useState<number>(28);
  const [showCreate,setShowCreate]=useState(false);
  const [creating,setCreating]=useState(false);
  const [tick,setTick]=useState(0);
  const [now,setNow]=useState(()=>Date.now());
  // create form
  const [fTitle,setFTitle]=useState("");
  const [fVenue,setFVenue]=useState("");
  const [fDate,setFDate]=useState(()=>new Date().toISOString().slice(0,10));
  const [fTime,setFTime]=useState("10:00");
  const [fScope,setFScope]=useState("whole_school");
  const [fScopeVal,setFScopeVal]=useState("");

  const fetchFeed=useCallback(async()=>{
    try{
      setErr(null);
      const r=await fetch("/api/timetable?limit=100",{cache:"no-store"});
      const j=await r.json();
      if(!r.ok || j.ok===false) throw new Error(j.error||j.hint||"couldn't load");
      const evs:EventRow[]=j.events??[];
      evs.sort((a,b)=> String(a.event_date).localeCompare(String(b.event_date)) || String(a.event_time).localeCompare(String(b.event_time)));
      setEvents(evs);
      if(evs.length && !selectedId) setSelectedId(evs[0].id);
    }catch(e:any){ setErr(e.message||"feed failed"); } finally{ setLoading(false); }
  },[selectedId]);

  const fetchStats=useCallback(async()=>{
    try{
      const r=await fetch("/api/stats",{cache:"no-store"});
      const j=await r.json();
      if(j?.metrics?.users) setStatsUsers(Number(j.metrics.users)||28);
      else if(j?.counts?.physi_users) setStatsUsers(Number(j.counts.physi_users)||28);
    }catch{}
  },[]);

  useEffect(()=>{ fetchFeed(); fetchStats(); },[fetchFeed,fetchStats]);
  useEffect(()=>{ if(!toast) return; const t=setTimeout(()=>setToast(null),2600); return()=>clearTimeout(t); },[toast]);
  // ticking clock for time animation
  useEffect(()=>{ const i=setInterval(()=>{ setTick(t=>t+1); setNow(Date.now()); },1000); return()=>clearInterval(i); },[]);

  // quorum countdown for personal bubbles
  useEffect(()=>{
    if(personal.length===0) return;
    const iv=setInterval(()=>{
      setPersonal(prev=> prev.map(p=>{
        if(p.broadcasted) return p;
        // quorum ramps to 80% over ~6s
        const age=(Date.now()-p.createdAt)/1000;
        let qp=Math.min(80, Math.round((age/6)*80));
        if(qp<0) qp=0;
        // countdown starts only after 80% reached
        let cd=p.countdown;
        if(qp>=80){
          cd=Math.max(0, 10 - Math.floor(age - 6));
          if(age>=16) cd=0;
        } else {
          cd=10;
        }
        return {...p, quorumPct:qp, countdown: qp>=80?cd:10 };
      }));
    }, 500);
    return()=>clearInterval(iv);
  },[personal.length]);

  // auto-broadcast after countdown hits 0
  const broadcastQueue=useRef<Set<string>>(new Set());
  useEffect(()=>{
    personal.forEach(p=>{
      if(p.broadcasted || p.broadcasting) return;
      if(p.quorumPct>=80 && p.countdown===0 && !broadcastQueue.current.has(p.localId)){
        broadcastQueue.current.add(p.localId);
        setPersonal(pr=> pr.map(x=> x.localId===p.localId?{...x,broadcasting:true}:x));
        (async()=>{
          try{
            let createdBy:string|null=null;
            try{ const raw=localStorage.getItem("physi_profile"); if(raw) createdBy=JSON.parse(raw)?.id??null; }catch{}
            const body:any={
              title:p.title, venue:p.venue, event_date:p.event_date, event_time:p.event_time,
              scope_type:p.scope_type, scope_value:p.scope_value||null,
              status:"pending", authority_points:0, required_points:5,
            };
            if(createdBy) body.created_by=createdBy;
            const r=await fetch("/api/timetable",{method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify(body)});
            const j=await r.json();
            if(!r.ok || j.ok===false) throw new Error(j.error||"broadcast failed");
            setToast(`broadcasted “${p.title}” — now on road ●`);
            setPersonal(pr=> pr.map(x=> x.localId===p.localId?{...x,broadcasted:true,broadcasting:false}:x));
            // remove after 2s and refresh
            setTimeout(()=>{
              setPersonal(pr=> pr.filter(x=> x.localId!==p.localId));
              fetchFeed();
            },1600);
          }catch(e:any){
            setToast(e.message||"broadcast failed");
            setPersonal(pr=> pr.map(x=> x.localId===p.localId?{...x,broadcasting:false}:x));
            broadcastQueue.current.delete(p.localId);
          }
        })();
      }
    });
  },[personal,fetchFeed]);

  const hasEvents=events.length>0;
  const selectedEvent=useMemo(()=> events.find(e=>e.id===selectedId)??null,[events,selectedId]);
  const selectedPersonal=useMemo(()=> personal.find(p=>p.localId===selectedId)??null,[personal,selectedId]);
  const verifiedCount=useMemo(()=> events.filter(isVerified).length,[events]);
  const advisoryCount=useMemo(()=> events.filter(e=>!isVerified(e) && e.status==="pending").length,[events]);

  // combined road items: personal bubbles first (light-off) + real events
  type RoadItem = { kind:"personal"; p:PersonalBubble; id:string } | { kind:"event"; ev:EventRow; id:string };
  const roadItems:RoadItem[]=useMemo(()=>{
    const pers:RoadItem[]=personal.map(p=>({kind:"personal", p, id:p.localId} as RoadItem));
    const evs:RoadItem[]=events.map(ev=>({kind:"event", ev, id:ev.id} as RoadItem));
    return [...pers, ...evs];
  },[personal,events]);

  const nodes=useMemo(()=>{
    if(roadItems.length===0){
      // default 8 demo winding
      return Array.from({length:8},(_,i)=>({x: i%2===0? 138+ (i%4===0?18:0) : 372 -(i%4===1?12:0), y: 108+ i*118 }));
    }
    const startY=110;
    const stepY=118;
    return roadItems.map((_,i)=>{
      const y=startY + i*stepY;
      let x:number;
      if(roadItems.length===1) x=250;
      else if(i%2===0) x=140 + (i%4===0?18:0);
      else x=370 - (i%4===1?12:0);
      return {x,y};
    });
  },[roadItems]);

  const svgH=useMemo(()=> Math.max(560, (nodes[nodes.length-1]?.y||800)+140),[nodes]);
  const roadD=useMemo(()=>{
    if(nodes.length===0) return "";
    if(nodes.length===1) return `M ${nodes[0].x} ${nodes[0].y} L ${nodes[0].x} ${nodes[0].y}`;
    let d=`M ${nodes[0].x} ${nodes[0].y}`;
    for(let i=1;i<nodes.length;i++){
      const a=nodes[i-1], b=nodes[i];
      const dx=b.x-a.x;
      const c1x=a.x + dx*0.55 + (dx>0?74:-74);
      const c1y=a.y+42;
      const c2x=b.x - dx*0.25 + (dx>0?-48:48);
      const c2y=b.y-30;
      d+=` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${b.x} ${b.y}`;
    }
    return d;
  },[nodes]);

  // target-aware quorum target
  function quorumTarget(scope_type:string){
    if(scope_type==="level" || scope_type==="programme" || scope_type.includes("level")){
      return Math.max(3, Math.ceil(statsUsers*0.25));
    }
    return Math.max(5, statsUsers);
  }

  // state logic per item
  function stateFor(item:RoadItem){
    if(item.kind==="personal"){
      return { key:"personal", label:"light off", color:"#a1a1aa", outline:"#52525b", bg:"rgba(255,255,255,0.06)", dimmed:true } as const;
    }
    const ev=item.ev;
    const ap=Number(ev.authority_points??0);
    const rp=Number(ev.required_points??0);
    const pct=rp>0? Math.min(100, Math.round((ap/rp)*100)) : isVerified(ev)?100:0;
    if(isVerified(ev)) return { key:"canonical", label:"canonical ✓", color:"#10b981", outline:"#10b981", pct, pop:true } as const;
    if(pct>=85) return { key:"almost", label:"almost ●", color:"#84cc16", outline:"#a3e635", pct, scale: 1 + (pct-85)/80 } as const; // 85->100 => 1.0 ->1.187
    if(ev.status==="pending") return { key:"advisory", label:"advisory ●", color:"#f59e0b", outline:"#f59e0b", pct } as const;
    if(ev.status==="waiting" || pct<50) return { key:"waiting", label:"waiting ○", color:"#3b82f6", outline:"#3b82f6", pct } as const;
    return { key:"advisory", label:"advisory ●", color:"#f59e0b", outline:"#f59e0b", pct } as const;
  }

  async function vote(id:string, v:"YES"|"NO"|"CANCEL"){
    let verifierId:string|null=null;
    try{ const raw=localStorage.getItem("physi_profile"); if(raw) verifierId=JSON.parse(raw)?.id ?? null; }catch{}
    if(!verifierId){ setToast("create a profile first — we need your handle to count the vote"); return; }
    setVoteBusy(id+v);
    try{
      const r=await fetch("/api/verify",{method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({verifier_id:verifierId, event_id:id, vote:v})});
      const j=await r.json();
      if(!r.ok || j.ok===false) throw new Error(j.error||"vote failed");
      setToast(v==="YES"?"you said you were there — thanks!": v==="NO"?"marked as not there":"skipped — all good");
      fetchFeed();
    }catch(e:any){ setToast(e.message); } finally{ setVoteBusy(null); }
  }

  function handleCreate(e:React.FormEvent){
    e.preventDefault();
    if(!fTitle.trim()||!fVenue.trim()||!fDate||!fTime){ setToast("fill title, venue, date, time"); return; }
    const localId="pb_"+Math.random().toString(36).slice(2,9);
    const bubble:PersonalBubble={
      localId, title:fTitle.trim(), venue:fVenue.trim(), event_date:fDate, event_time:fTime,
      scope_type:fScope, scope_value: fScopeVal.trim()||null,
      createdAt:Date.now(), countdown:10, quorumPct:0, broadcasting:false, broadcasted:false
    };
    setPersonal(p=>[...p,bubble]);
    setSelectedId(localId);
    setSheetOpen(true);
    setShowCreate(false);
    setToast(`personal bubble created — light off (not broadcast yet)`);
    setFTitle(""); setFVenue(""); setFTime("10:00"); setFDate(new Date().toISOString().slice(0,10));
  }

  return (
    <div className="relative -mx-4 -mt-5 w-[100vw] max-w-[100vw] sm:-mx-6 lg:-mx-8">
      <style>{`@keyframes canonicalPop{0%{transform:scale(0.72)}50%{transform:scale(1.22)}100%{transform:scale(1)}} @keyframes tickPulse{0%,100%{opacity:1}50%{opacity:.55}} @keyframes roadShimmer{0%{stroke-dashoffset:0}100%{stroke-dashoffset:28}}`}</style>
      <div className="relative min-h-[calc(100vh-64px)] w-full overflow-hidden" style={{background:"linear-gradient(180deg, #0d3b2a 0%, #143d2e 42%, #1a5c3a 100%)"}}>
        {/* ambient gradient hints - forest greens */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0" style={{background:"linear-gradient(180deg, rgba(13,59,42,0.85) 0%, rgba(26,92,58,0.55) 55%, rgba(45,106,79,0.72) 100%)"}} />
          <div className="absolute -top-[8vh] left-1/2 h-[58vh] w-[120vw] -translate-x-1/2 rounded-[100%] opacity-[0.22]" style={{background:"radial-gradient(ellipse at center, rgba(82,183,136,0.28) 0%, rgba(64,145,108,0.20) 42%, rgba(45,106,79,0.16) 72%, transparent 75%)"}} />
          <div className="absolute top-[18vh] left-[-6%] h-[46vh] w-[46vh] rounded-full opacity-[0.16] blur-[40px]" style={{background:"radial-gradient(circle, rgba(82,183,136,0.95), transparent 70%)"}} />
          <div className="absolute top-[52vh] right-[-8%] h-[50vh] w-[50vh] rounded-full opacity-[0.18] blur-[42px]" style={{background:"radial-gradient(circle, rgba(45,106,79,0.9), transparent 70%)"}} />
          <div className="absolute bottom-[18vh] left-1/2 h-[38vh] w-[90vw] -translate-x-1/2 opacity-[0.12] blur-[30px]" style={{background:"radial-gradient(ellipse, rgba(64,145,108,0.55), transparent 72%)"}} />
        </div>

        {/* top pills Share / Save */}
        <div className="pointer-events-none absolute left-0 right-0 top-0 z-20 flex justify-center px-3 pt-3 sm:px-6">
          <div className="pointer-events-auto flex w-full max-w-[860px] items-center justify-between gap-2">
            <div className="flex items-center gap-2 rounded-full border border-white/[0.09] bg-black/70 px-3 py-2 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.6)] sm:px-4">
              <span className="hidden h-7 w-7 items-center justify-center rounded-full bg-white text-[11px] font-black text-black sm:flex">◉</span>
              <div>
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 sm:text-[11px]">timetable on the road</p>
                <p className="hidden text-[12px] font-semibold leading-none text-white sm:block">{loading?"Loading live road…": roadItems.length? `${events.length} live + ${personal.length} personal · tap a candy` : "tap a candy · create your gist"}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold sm:px-3 sm:py-1.5 sm:text-xs ${verifiedCount>0?"bg-emerald-500 text-white":"bg-white/10 text-slate-300"}`}> <span className="h-1.5 w-1.5 rounded-full bg-white/80"/> {verifiedCount} ✓</span>
              <span className="inline-flex items-center rounded-full bg-amber-500 px-2.5 py-1 text-[11px] font-bold text-white sm:px-3 sm:py-1.5 sm:text-xs">{advisoryCount} ●</span>
              <button onClick={()=>setShowCreate(true)} className="rounded-full bg-white px-3.5 py-1.5 text-[12px] font-black text-black hover:bg-slate-100 transition sm:px-4 sm:py-2 sm:text-[13px]">＋ New gist</button>
              <button onClick={fetchFeed} className="hidden rounded-full border border-white/15 bg-white/[0.08] px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-white hover:text-black transition sm:inline-flex">↻ refresh</button>
            </div>
          </div>
        </div>

        {/* Save / Share dark pills second row */}
        <div className="absolute right-3 top-[62px] z-20 hidden gap-2 sm:flex sm:right-6">
          <button onClick={()=>{navigator.clipboard?.writeText(window.location.href); setToast("link copied — share the road");}} className="rounded-full border border-white/10 bg-black/70 px-3.5 py-1.5 text-xs font-semibold text-white backdrop-blur">↗ Share</button>
          <button onClick={()=> setToast("saved to your map")} className="rounded-full border border-white/10 bg-black/70 px-3.5 py-1.5 text-xs font-semibold text-white backdrop-blur">♡ Save</button>
        </div>

        <p className="absolute left-1/2 top-[64px] z-10 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/10 bg-black/70 px-3 py-1 font-mono text-[10px] tracking-wide text-slate-400 backdrop-blur sm:hidden">
          {loading?"LOADING ROAD…": `${roadItems.length} NODES · TAP TO VOTE`}
        </p>

        {toast && <div className="fixed bottom-28 left-1/2 z-50 -translate-x-1/2 rounded-full bg-white px-5 py-2.5 text-[13px] font-medium text-black shadow-xl">{toast}</div>}

        {/* centered rectangular map 2/3 screen */}
        <div className="relative mx-auto flex min-h-[calc(100vh-64px)] w-full max-w-[560px] justify-center overflow-auto pb-[320px] pt-[96px] sm:pb-[340px] sm:pt-[84px]">
          {/* map card background — Fantastical Forest greens */}
          <div className="pointer-events-none absolute left-1/2 top-[88px] h-[86%] w-[96%] -translate-x-1/2 overflow-hidden rounded-[28px] border border-white/[0.10] shadow-[0_20px_80px_rgba(13,59,42,0.75)]" style={{background:"linear-gradient(180deg, rgba(45,106,79,0.42) 0%, rgba(64,145,108,0.34) 38%, rgba(82,183,136,0.22) 68%, rgba(13,59,42,0.24) 100%), linear-gradient(180deg, #2d6a4f 0%, #40916c 52%, #52b788 100%)", minHeight: svgH}} />
          {/* cartoon mountains / trees behind road */}
          <svg viewBox={`0 0 520 ${svgH}`} className="pointer-events-none absolute left-1/2 top-[88px] h-[86%] w-[96%] -translate-x-1/2 rounded-[28px] overflow-hidden" style={{height: svgH, minHeight: svgH}}>
            {/* mountains — forest greens */}
            <path d="M -10 210 L 90 78 L 170 175 L 250 54 L 340 168 L 430 92 L 560 210 Z" fill="rgba(13,59,42,0.32)" stroke="rgba(255,255,255,0.10)" strokeWidth={1} />
            <path d="M -10 240 L 70 150 L 145 210 L 250 120 L 370 210 L 470 155 L 560 240 Z" fill="rgba(26,92,58,0.28)" />
            {/* trees — cartoon forest greens */}
            {[42,92,410,462].map((x,i)=>(
              <g key={i} opacity={0.32}>
                <path d={`M ${x} 420 L ${x-22} 462 L ${x+22} 462 Z`} fill={i%2===0?"#0d3b2a":"#1a5c3a"} />
                <path d={`M ${x} 392 L ${x-18} 426 L ${x+18} 426 Z`} fill={i%2===0?"#2d6a4f":"#40916c"} opacity={0.95} />
                <rect x={x-4} y={462} width={8} height={14} rx={2} fill="#2f3e2a" opacity={0.9} />
              </g>
            ))}
            {/* rocks / foliage accents — forest floor */}
            <g opacity={0.32}>
              <ellipse cx={86} cy={310} rx={22} ry={13} fill="#6b8f71" />
              <ellipse cx={92} cy={306} rx={10} ry={6} fill="#a7c4a0" opacity={0.7} />
              <ellipse cx={438} cy={520} rx={20} ry={12} fill="#7a9e7e" />
              <ellipse cx={430} cy={516} rx={8} ry={5} fill="#d8f3dc" opacity={0.85} />
              <ellipse cx={78} cy={680} rx={18} ry={10} fill="#5a7a5a" />
              <path d="M 430 710 L 452 728 L 418 735 Z" fill="#b7e4c7" opacity={0.9} />
            </g>
          </svg>

          <svg viewBox={`0 0 520 ${svgH}`} className="relative h-auto w-full shrink-0" style={{minHeight: Math.min(880, svgH), height: svgH}} role="img" aria-label="winding road map">
            <defs>
              <linearGradient id="purpleRoad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#6d28d9" />
                <stop offset="50%" stopColor="#7c3aed" />
                <stop offset="100%" stopColor="#a855f7" />
              </linearGradient>
              <filter id="roadShadow"><feDropShadow dx="0" dy="6" stdDeviation="10" floodColor="rgba(0,0,0,0.55)"/></filter>
              <filter id="nodeGlow"><feDropShadow dx="0" dy="2" stdDeviation="6" floodColor="rgba(255,255,255,0.18)"/></filter>
            </defs>

            {/* road: purple base ~1/5 height vibe (46 -> 52) */}
            <path d={roadD} fill="none" stroke="#1a1033" strokeWidth={58} strokeLinecap="round" strokeLinejoin="round" opacity={0.95} style={{filter:"url(#roadShadow)"}} />
            <path d={roadD} fill="none" stroke="url(#purpleRoad)" strokeWidth={46} strokeLinecap="round" strokeLinejoin="round" />
            {/* white striped center */}
            <path d={roadD} fill="none" stroke="white" strokeWidth={3.2} strokeLinecap="round" strokeDasharray="14 14" opacity={0.92} style={{animation:"roadShimmer 1.2s linear infinite"}} />
            <path d={roadD} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={1} opacity={0.5} />

            {loading ? Array.from({length:3}).map((_,i)=>(
              <g key={i} opacity={0.28}><circle cx={i%2===0?150:370} cy={140+i*118} r={30} fill="rgba(255,255,255,0.08)"/></g>
            )) : roadItems.map((item, i)=>{
              const p=nodes[i];
              const st=stateFor(item);
              const isActive=selectedId===item.id;
              const isPersonal=item.kind==="personal";
              const leftSide=p.x<260;
              // amberish-green scaling & canonical pop
              let nodeR=30;
              let scale=1;
              let outline=st.outline;
              let anim="";
              if(st.key==="canonical"){ nodeR=34; anim="canonicalPop 420ms cubic-bezier(.2,.8,.3,1.4)"; outline="#10b981"; }
              else if(st.key==="almost"){ scale=(st as any).scale||1.12; nodeR= Math.round(30*scale); outline=(st as any).outline; }
              else if(st.key==="personal"){ nodeR=27; }
              // title label
              const title=isPersonal? item.p.title : item.ev.title;
              const venue=isPersonal? item.p.venue : item.ev.venue;
              const date=isPersonal? item.p.event_date : item.ev.event_date;
              const time=isPersonal? item.p.event_time : item.ev.event_time;
              const label=title.length>18? title.slice(0,18)+"…":title;
              const pillW=Math.max(136, Math.min(188, label.length*7.2+36));
              const pillX=leftSide? p.x+44 : p.x - pillW -12;
              const pctVal= !isPersonal ? (()=>{ const ap=Number(item.ev.authority_points??0); const rp=Number(item.ev.required_points??0); return rp>0? Math.min(100,Math.round((ap/rp)*100)): isVerified(item.ev)?100:0; })() : null;
              // personal quorum target
              const qTarget=isPersonal? quorumTarget(item.p.scope_type): 0;
              const showPct= pctVal!==null && pctVal>0 && !isVerified((item as any).ev);
              return (
                <g key={item.id} onClick={()=>{ setSelectedId(item.id); setSheetOpen(true); }} style={{cursor:"pointer", opacity: isPersonal && !isActive ? 0.62 : 1}}>
                  {isActive && <circle cx={p.x} cy={p.y} r={nodeR+20} fill="white" opacity={0.09} />}
                  <circle cx={p.x} cy={p.y+6} r={nodeR} fill="black" opacity={0.34} />
                  <g style={{transformOrigin:`${p.x}px ${p.y}px`, transform: st.key==="almost"? `scale(${scale})` : undefined, animation: anim || undefined}}>
                    <circle cx={p.x} cy={p.y} r={nodeR} fill={isPersonal?"#e7e5e4": "white"} stroke={outline} strokeWidth={isActive?3.8:3} filter="url(#nodeGlow)" opacity={isPersonal?0.72:1} />
                    <circle cx={p.x} cy={p.y} r={nodeR-10} fill={st.key==="canonical"?"#ecfdf5": st.key==="almost"?"#f7fee7": st.key==="advisory"?"#fffbeb": st.key==="waiting"?"#eff6ff":"#f4f4f5"} stroke="rgba(0,0,0,0.06)" strokeWidth={1} />
                    <text x={p.x} y={p.y+6} textAnchor="middle" fontSize={isPersonal?10: st.key==="canonical"?17:14} fontWeight={800} fill={st.key==="canonical"?"#065f46": st.key==="almost"?"#3f6212": st.key==="advisory"?"#92400e": st.key==="waiting"?"#1e40af": "#52525b"} style={{fontFamily:"ui-monospace, monospace"}}>
                      {isPersonal?"◐": st.key==="canonical"?"✓": st.key==="advisory"?"●": st.key==="almost"?"◉": st.key==="waiting"?"○": "●"}
                    </text>
                  </g>
                  {/* light-off badge */}
                  {isPersonal && <g>
                    <rect x={p.x-28} y={p.y+nodeR+8} width={56} height={16} rx={8} fill="rgba(0,0,0,0.72)" stroke="rgba(255,255,255,0.14)" />
                    <text x={p.x} y={p.y+nodeR+19} textAnchor="middle" fontSize={7.5} fontWeight={700} fill="#a1a1aa" style={{fontFamily:"ui-monospace,monospace"}}>LIGHT OFF</text>
                  </g>}
                  {/* title pill */}
                  <g opacity={isPersonal?0.82:1}>
                    <rect x={pillX} y={p.y-38} width={pillW} height={28} rx={14} fill={isActive?"white":"rgba(0,0,0,0.62)"} stroke={isActive?"white":"rgba(255,255,255,0.18)"} />
                    <text x={pillX+pillW/2} y={p.y-19} textAnchor="middle" fontSize={12} fontWeight={750} fill={isActive?"#000":"white"}>{label}</text>
                  </g>
                  {/* venue/date pill */}
                  <g opacity={0.96}>
                    <rect x={pillX} y={p.y+24} width={pillW} height={18} rx={9} fill="rgba(0,0,0,0.74)" stroke="rgba(255,255,255,0.12)" />
                    <text x={pillX+pillW/2} y={p.y+35.5} textAnchor="middle" fontSize={8.5} fontWeight={600} fill="#cbd5e1" style={{fontFamily:"ui-monospace,monospace"}}>{venue.slice(0,14)} · {fmtDate(date)} {fmtTime(time)}</text>
                  </g>
                  {/* pct badge or quorum */}
                  {isPersonal ? (
                    <g>
                      <circle cx={leftSide? p.x+38: p.x-38} cy={p.y-22} r={13} fill="#18181b" stroke="rgba(255,255,255,0.16)" />
                      <text x={leftSide? p.x+38: p.x-38} y={p.y-17.5} textAnchor="middle" fontSize={7} fontWeight={800} fill={item.p.quorumPct>=80?"#facc15":"#a1a1aa"}>{item.p.quorumPct>=80? `${item.p.countdown}s` : `${item.p.quorumPct}%`}</text>
                    </g>
                  ) : showPct && (
                    <g>
                      <circle cx={leftSide? p.x+38: p.x-38} cy={p.y-22} r={11} fill="#0f0a1e" stroke="rgba(255,255,255,0.16)" />
                      <text x={leftSide? p.x+38: p.x-38} y={p.y-17.8} textAnchor="middle" fontSize={7.5} fontWeight={800} fill={pctVal>=85?"#a3e635":"#fbbf24"}>{pctVal}%</text>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {/* create modal */}
        {showCreate && (
          <div className="absolute inset-0 z-40 flex items-start justify-center bg-black/70 px-3 pt-[86px] backdrop-blur-sm sm:pt-[90px]">
            <form onSubmit={handleCreate} className="w-full max-w-[520px] rounded-[20px] border border-white/10 bg-[#0b0f1e] p-5 shadow-2xl">
              <div className="flex items-center justify-between">
                <h3 className="text-[16px] font-bold text-white">New gist — light-off bubble</h3>
                <button type="button" onClick={()=>setShowCreate(false)} className="rounded-full bg-white/10 px-3 py-1 text-sm text-white">✕</button>
              </div>
              <p className="mt-1 text-[12.5px] leading-5 text-slate-400">Creates a dimmed personal bubble. We wait for <b className="text-slate-200">80% of target active 10s</b> then broadcast. Target-aware: whole school vs level.</p>
              <div className="mt-4 grid gap-3">
                <input value={fTitle} onChange={e=>setFTitle(e.target.value)} placeholder="Title e.g. LT2 moved to LT5" className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none focus:border-violet-500" required />
                <input value={fVenue} onChange={e=>setFVenue(e.target.value)} placeholder="Venue e.g. LT5" className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none focus:border-violet-500" required />
                <div className="grid grid-cols-2 gap-3">
                  <input type="date" value={fDate} onChange={e=>setFDate(e.target.value)} className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-sm text-white outline-none" required />
                  <input type="time" value={fTime} onChange={e=>setFTime(e.target.value)} className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-sm text-white outline-none" required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <select value={fScope} onChange={e=>setFScope(e.target.value)} className="rounded-xl border border-white/10 bg-[#12172a] px-3 py-2.5 text-sm text-white outline-none">
                    <option value="whole_school">whole_school — all ({statsUsers})</option>
                    <option value="level">level — ~{Math.max(3,Math.ceil(statsUsers*0.25))} target</option>
                    <option value="programme">programme</option>
                    <option value="general">general</option>
                  </select>
                  <input value={fScopeVal} onChange={e=>setFScopeVal(e.target.value)} placeholder={fScope==="level"?"e.g. 300L":"scope value (optional)"} className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none" />
                </div>
              </div>
              <div className="mt-2 rounded-xl bg-violet-500/10 px-3 py-2.5 text-[11px] leading-4 text-violet-200">
                Quorum: <b>{fScope==="whole_school"? `80% of ${statsUsers} ≈ ${Math.ceil(statsUsers*0.8)} active` : `80% of ~${Math.max(3,Math.ceil(statsUsers*0.25))} ≈ ${Math.ceil(Math.max(3,Math.ceil(statsUsers*0.25))*0.8)} active`}</b> for 10s → broadcast. Light stays off until then.
              </div>
              <div className="mt-4 flex gap-2">
                <button type="submit" disabled={creating} className="flex-1 rounded-full bg-white py-2.5 text-sm font-black text-black hover:bg-slate-100 disabled:opacity-60">{creating?"…":"Create bubble (light off)"}</button>
                <button type="button" onClick={()=>setShowCreate(false)} className="rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white">Cancel</button>
              </div>
            </form>
          </div>
        )}

        {/* bottom sheet */}
        <div className={`absolute inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-3 sm:px-6 sm:pb-4 transition-transform duration-300 ${sheetOpen?"translate-y-0":"translate-y-[calc(100%-44px)]"}`}>
          <div className="w-full max-w-[680px] overflow-hidden rounded-[24px] border border-white/[0.09] bg-[#080c18]/95 shadow-[0_16px_64px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl">
            <button onClick={()=>setSheetOpen(v=>!v)} className="flex w-full items-center justify-center gap-2 border-b border-white/[0.06] bg-white/[0.03] py-2.5">
              <span className="h-1.5 w-9 rounded-full bg-white/20" />
              <span className="font-mono text-[10.5px] tracking-wide text-slate-400">{sheetOpen?"tap to collapse":"tap to expand · details"}</span>
              <span className="text-xs text-slate-500">{sheetOpen?"⌄":"⌃"}</span>
            </button>
            <div className="max-h-[58vh] overflow-auto p-4 sm:p-5">
              {err ? (
                <div className="rounded-2xl border border-red-400/20 bg-red-400/10 p-5 text-center">
                  <p className="text-sm font-medium text-red-200">road is down</p><p className="mt-1 font-mono text-xs text-red-200/70">{err}</p>
                  <button onClick={fetchFeed} className="mt-3 rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-black">try again</button>
                </div>
              ) : loading ? (
                <div className="space-y-3"><div className="h-5 w-1/2 animate-pulse rounded bg-white/10"/><div className="h-3 w-3/4 animate-pulse rounded bg-white/5"/><div className="h-3 w-2/3 animate-pulse rounded bg-white/5"/></div>
              ) : selectedPersonal ? (
                (()=>{ const p=selectedPersonal; const target=quorumTarget(p.scope_type); const need=Math.ceil(target*0.8); const activeEst=Math.round((p.quorumPct/80)*need); return (
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-700 text-sm font-black text-white">◐</span>
                        <div>
                          <h2 className="text-[17px] font-bold leading-tight text-white">{p.title} <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold tracking-wide text-slate-300">LIGHT OFF</span></h2>
                          <p className="font-mono text-[11px] tracking-wide text-slate-500">{p.venue} · {fmtDate(p.event_date)} {fmtTime(p.event_time)} · {p.scope_type}{p.scope_value? ` · ${p.scope_value}`:""}</p>
                        </div>
                      </div>
                      <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 font-mono text-[11px] font-bold text-slate-300">personal · not broadcast</span>
                    </div>
                    {/* time animation + quorum */}
                    <div className="mt-4 rounded-2xl border border-white/10 bg-black/40 p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-black text-sm" style={{animation:"tickPulse 1s ease-in-out infinite"}}>◷</span>
                          <div>
                            <p className="font-mono text-[11px] font-bold tracking-wide text-white" style={{fontVariantNumeric:"tabular-nums"}}>{new Date(now).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit",second:"2-digit"})} <span className="text-slate-500">· ticking</span></p>
                            <p className="font-mono text-[10px] text-slate-500">personal bubble · dimmed until quorum</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-mono text-[11px] font-bold text-amber-300">{p.quorumPct>=80? `broadcast in ${p.countdown}s` : `waiting for quorum`}</p>
                          <p className="font-mono text-[10px] text-slate-500">{activeEst}/{need} active · target {target} ({p.scope_type})</p>
                        </div>
                      </div>
                      <div className="mt-3">
                        <div className="flex justify-between font-mono text-[10px] text-slate-500"><span>quorum {p.quorumPct}%</span><span>need 80% for 10s</span></div>
                        <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10">
                          <div className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-400 transition-all duration-500" style={{width:`${p.quorumPct}%`}} />
                        </div>
                        {p.quorumPct>=80 && <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-amber-400 transition-all" style={{width:`${(10-p.countdown)/10*100}%`}} /></div>}
                        <p className="mt-2 font-mono text-[10.5px] text-slate-400">{p.quorumPct<80? `Gathering — need ${need} of ${target} active. Your bub is light-off; nobody else sees it yet.` : p.broadcasting? "Broadcasting to Neon…" : `✓ 80% active reached — holding ${10-p.countdown}/10s then broadcast → amber advisory on road.`}</p>
                      </div>
                    </div>
                    <div className="mt-4 flex gap-2">
                      <button onClick={()=> setPersonal(pr=>pr.filter(x=>x.localId!==p.localId))} className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-300">Discard</button>
                      <button onClick={()=>{ if(p.quorumPct>=80) { setPersonal(pr=>pr.map(x=>x.localId===p.localId?{...x, countdown:0}:x)); } else setToast("still waiting for 80% — tell coursemates to open app");}} className="rounded-full bg-white px-4 py-2 text-sm font-bold text-black">Force broadcast</button>
                    </div>
                    <p className="mt-3 font-mono text-[10px] text-slate-600">Whole school vs level quorum: whole_school needs more actives. Level gist broadcasts faster.</p>
                  </div>
                ); })()
              ) : selectedEvent ? (
                (()=>{
                  const ev=selectedEvent;
                  const verified=isVerified(ev);
                  const ap=Number(ev.authority_points??0);
                  const rp=Number(ev.required_points??0);
                  const pct=rp>0? Math.min(100,Math.round((ap/rp)*100)): verified?100:0;
                  const isAlmost=pct>=85 && !verified;
                  const isAdvisory=ev.status==="pending" && !verified && !isAlmost;
                  return (
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[15px] font-black text-white shadow ${verified?"bg-emerald-500": isAlmost?"bg-lime-500": isAdvisory?"bg-amber-500":"bg-blue-600"}`}>{verified?"✓": isAlmost?"◉": isAdvisory?"●":"○"}</span>
                          <div>
                            <h2 className="text-[17px] font-bold leading-tight text-white">{ev.title}</h2>
                            <p className="font-mono text-[11px] tracking-wide text-slate-500">{ev.venue} · {fmtDate(ev.event_date)} {fmtTime(ev.event_time)} · {ev.scope_type}{ev.scope_value? ` · ${ev.scope_value}`:""}</p>
                          </div>
                        </div>
                        <span className={`shrink-0 rounded-full px-3 py-1.5 font-mono text-[11px] font-bold ${verified?"bg-emerald-500 text-white": isAlmost?"bg-lime-400 text-black": isAdvisory?"border border-amber-400/20 bg-amber-400/10 text-amber-200":"border border-blue-400/20 bg-blue-500/10 text-blue-200"}`}>{verified?"✓ canonical": isAlmost?"◉ almost": isAdvisory?"● advisory":"○ waiting"}</span>
                      </div>
                      {/* animated time */}
                      <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-black text-xs font-bold" style={{animation:"tickPulse 1s ease-in-out infinite"}}>◷</span>
                        <span className="font-mono text-[11px] font-semibold tracking-wide text-white" style={{fontVariantNumeric:"tabular-nums"}}>{fmtTime(ev.event_time)} · {fmtDate(ev.event_date)}</span>
                        <span className="font-mono text-[10px] text-slate-500">· live · sec {String(new Date(now).getSeconds()).padStart(2,"0")} tick</span>
                        <span className="ml-auto font-mono text-[10px] text-slate-500">target {quorumTarget(ev.scope_type)} · {ev.scope_type}</span>
                      </div>
                      {rp>0 && (
                        <div className="mt-4">
                          <div className="flex items-center justify-between font-mono text-[11px] text-slate-500"><span>{ap}/{rp} points</span><span className={verified?"text-emerald-300": isAlmost?"text-lime-300":"text-amber-300"}>{pct}% to green</span></div>
                          <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-white/10">
                            <div className={`h-full transition-all duration-700 ${verified?"bg-emerald-400": isAlmost?"bg-gradient-to-r from-amber-400 to-emerald-400": isAdvisory?"bg-amber-400":"bg-blue-400"}`} style={{width:`${pct}%`, transform: isAlmost? `scaleY(1.2)`: undefined, transformOrigin:"left"}} />
                          </div>
                          <p className="mt-1.5 font-mono text-[11px] text-slate-500">{verified?"✓ canonical pop — enough Yes to trust": isAlmost?"amber → green scaling — almost verified, one more Yes to pop": "needs more Yes taps to flip to green tick"}</p>
                        </div>
                      )}
                      {!rp && verified && <p className="mt-4 rounded-xl bg-emerald-500/10 px-3 py-2.5 text-[12.5px] text-emerald-200">Verified — coursemates confirmed this happened.</p>}
                      {!rp && !verified && <p className="mt-4 rounded-xl bg-amber-500/10 px-3 py-2.5 text-[12.5px] text-amber-200">Advisory — fresh gist, waiting for confirmations.</p>}
                      <div className="mt-4">
                        <p className="font-mono text-[11px] uppercase tracking-wide text-slate-500">Were you there?</p>
                        <div className="mt-2.5 flex flex-wrap items-center gap-2">
                          <button onClick={()=>vote(ev.id,"YES")} disabled={!!voteBusy} className="rounded-full border border-emerald-500/30 bg-emerald-500/15 px-5 py-2.5 text-[13.5px] font-semibold text-emerald-300 hover:bg-emerald-500 hover:text-white transition disabled:opacity-50">{voteBusy===ev.id+"YES"?"…":"Yes ✓"}</button>
                          <button onClick={()=>vote(ev.id,"NO")} disabled={!!voteBusy} className="rounded-full border border-white/10 bg-white/[0.05] px-5 py-2.5 text-[13.5px] font-medium text-slate-200 hover:bg-white hover:text-black transition disabled:opacity-50">{voteBusy===ev.id+"NO"?"…":"No ✕"}</button>
                          <button onClick={()=>vote(ev.id,"CANCEL")} disabled={!!voteBusy} className="rounded-full border border-white/10 bg-white/[0.02] px-5 py-2.5 text-[13.5px] font-medium text-slate-400 hover:bg-white/[0.08] hover:text-white transition disabled:opacity-50">{voteBusy===ev.id+"CANCEL"?"…":"Skip"}</button>
                          <span className="font-mono text-[11px] text-slate-600">uses physi_profile</span>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button onClick={fetchFeed} className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[13px] font-medium text-slate-200">↻ refresh road</button>
                        <a href="/app/timetable" className="rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-black">Open timetable →</a>
                      </div>
                      <div className="mt-4 flex gap-1.5 overflow-auto pb-1">
                        {events.slice(0,12).map(e=>{
                          const v=isVerified(e); const adv=e.status==="pending" && !v;
                          return <button key={e.id} onClick={()=>{ setSelectedId(e.id); setSheetOpen(true); }} className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-medium transition ${selectedId===e.id?"border-white bg-white text-black": v?"border-emerald-400/30 bg-emerald-500/10 text-emerald-200": adv?"border-amber-400/30 bg-amber-500/10 text-amber-200":"border-white/10 bg-white/[0.03] text-slate-400"}`}>{e.title.slice(0,14)}</button>;
                        })}
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div className="text-center py-6">
                  <p className="text-sm text-slate-300">No events yet — create a gist to see light-off bubble.</p>
                  <button onClick={()=>setShowCreate(true)} className="mt-3 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-black">＋ Create first gist</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
