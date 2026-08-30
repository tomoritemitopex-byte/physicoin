"use client";
import { useEffect, useState, useMemo, useRef } from "react";
import { logError, getErrorMessage } from "@/lib/adapters/error";
import RepExplainer from "@/components/road/RepExplainer";

type StoredProfile = {
  id: string;
  nickname: string;
  full_name: string;
  programme: string;
  level: string;
  statuses: string[];
  authority_base: number | string;
  authority_final: number | string;
  mining_balance: number | string;
  created_at?: string;
  updated_at?: string;
};

const PROGRAMMES = ["Physiology","Anatomy","Biochemistry","Medicine & Surgery","Nursing","Pharmacy","Medical Laboratory Science","Other Health Science"];
const LEVELS = ["100L","200L","300L","400L","500L","600L"];
const STATUS_OPTIONS = [
  { v: "class_rep", l: "Class rep" },
  { v: "lab_prefect", l: "Lab helper" },
  { v: "team_lead", l: "Group lead" },
  { v: "freshers_guide", l: "Freshers' guide" },
];
const HANDLE_SUGGESTIONS = ["alex_02","bisola_11","emma_07","chidi_24","zainab_03","tunde_19"];
// candy avatar colors — emerald / amber / sky / violet
const CANDY_KEYS = ["emerald","amber","sky","violet"] as const;
type CandyKey = typeof CANDY_KEYS[number];
const CANDY_BG: Record<CandyKey,string> = {
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  sky: "bg-sky-500",
  violet: "bg-violet-500",
};
const CANDY_RING: Record<CandyKey,string> = {
  emerald: "ring-emerald-400/30",
  amber: "ring-amber-400/30",
  sky: "ring-sky-400/30",
  violet: "ring-violet-400/30",
};
const CANDY_HEX: Record<CandyKey,string> = {
  emerald: "#10b981",
  amber: "#f59e0b",
  sky: "#0ea5e9",
  violet: "#8b5cf6",
};
function candyFromString(s: string): CandyKey {
  let h=0; for(let i=0;i<s.length;i++) h=(h*31 + s.charCodeAt(i))>>>0;
  return CANDY_KEYS[h % CANDY_KEYS.length];
}
function randomCandy(): CandyKey { return CANDY_KEYS[Math.floor(Math.random()*CANDY_KEYS.length)]; }

function handleValid(h: string){ return /^[a-z][a-z0-9_]{2,18}$/.test(h) && h.includes("_") && /[0-9]/.test(h.slice(-2)); }
function handleHint(h: string){
  if(!h) return "pick something like alex_02 — people trust a real coursemate";
  if(h.length<3) return "too short — add a bit more";
  if(/[A-Z]/.test(h)) return "keep it lowercase — alex_02 not Alex_02";
  if(!/^[a-z0-9_]+$/.test(h)) return "only letters, numbers and _";
  if(!h.includes("_")) return "add _ like alex_02";
  if(!/[0-9]/.test(h)) return "add a number — alex_02 not alex";
  if(hValidLight(h)) return "looks good ✓";
  return "aim for name_number like alex_02";
}
function hValidLight(h: string){ return /^[a-z0-9_]{3,20}$/.test(h) && h.includes("_"); }

// Levels helper
type LevelInfo = { lvl: number; name: string; min: number; max: number|null; progress: number; nextAt: number|null };
const LEVEL_NAMES: Record<number,string> = {1:"Explorer",2:"Scout",3:"Guide",4:"Sage",5:"Legend"};
function getLevelInfo(rep: number): LevelInfo {
  const r = Number(rep) || 0;
  if (r >= 60) return { lvl:5, name: LEVEL_NAMES[5], min:60, max:null, progress:1, nextAt:null };
  if (r >= 30) return { lvl:4, name: LEVEL_NAMES[4], min:30, max:60, progress:(r-30)/(60-30), nextAt:60 };
  if (r >= 15) return { lvl:3, name: LEVEL_NAMES[3], min:15, max:30, progress:(r-15)/(30-15), nextAt:30 };
  if (r >= 5) return { lvl:2, name: LEVEL_NAMES[2], min:5, max:15, progress:(r-5)/(15-5), nextAt:15 };
  return { lvl:1, name: LEVEL_NAMES[1], min:0, max:5, progress:r/5, nextAt:5 };
}

// 30-day sparkline: reuse RepSparkline logic expanded to 30
function RepSparkline30({ rep }: { rep: number }) {
  const [pts, setPts] = useState<number[] | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("physi_rep_history");
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr) && arr.length >= 2) {
          const nums = arr.map((n: any) => Number(n)).filter((n: number) => isFinite(n)).slice(-30);
          if (nums.length >= 2) { setPts(nums); return; }
        }
      }
    } catch {}
    const r = Number(rep) || 0;
    const base = Math.max(0.6, r * 0.52);
    const synth = Array.from({ length: 30 }, (_, i) => {
      const t = i / 29;
      const wiggle = Math.sin(i * 1.7) * 0.35 + Math.cos(i * 0.9) * 0.22;
      const v = base + (r - base) * (0.35 + 0.65 * t) + wiggle;
      return Math.max(0.15, Number(v.toFixed(2)));
    });
    setPts(synth);
  }, [rep]);
  useEffect(() => {
    try {
      const r = Number(rep);
      if (!isFinite(r)) return;
      const raw = localStorage.getItem("physi_rep_history");
      let arr: number[] = [];
      if (raw) { try { const p = JSON.parse(raw); if (Array.isArray(p)) arr = p.map((n:any)=>Number(n)).filter((n:number)=>isFinite(n)); } catch {} }
      if (arr.length === 0 || arr[arr.length - 1] !== r) {
        arr.push(r);
        if (arr.length > 30) arr = arr.slice(-30);
        localStorage.setItem("physi_rep_history", JSON.stringify(arr));
      }
    } catch {}
  }, [rep]);
  if (!pts || pts.length < 2) return null;
  const w = 120, h = 28, pad = 2;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const range = max - min || 1;
  const stepX = (w - pad * 2) / (pts.length - 1);
  const points = pts.map((v, i) => {
    const x = pad + i * stepX;
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
  const filled = points + ` L ${(pad + (pts.length - 1) * stepX).toFixed(1)} ${(h - pad).toFixed(1)} L ${pad.toFixed(1)} ${(h - pad).toFixed(1)} Z`;
  const lastUp = pts[pts.length - 1] >= pts[0];
  const col = lastUp ? "#10b981" : "#f59e0b";
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0" aria-hidden>
      <path d={filled} fill={col} opacity={0.14} />
      <path d={points} fill="none" stroke={col} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type GistRow = {
  id: string;
  title: string;
  venue: string;
  event_date: string;
  event_time: string;
  status: string;
  authority_points: number | string;
  required_points: number | string;
  created_at: string;
};

export default function ProfilePage(){
  const [profile,setProfile]=useState<StoredProfile|null>(null);
  const [loadingExisting,setLoadingExisting]=useState(true);
  const [fetching,setFetching]=useState(false);
  const [nickname,setNickname]=useState("");
  const [fullName,setFullName]=useState("");
  const [programme,setProgramme]=useState(PROGRAMMES[0]);
  const [level,setLevel]=useState(LEVELS[1]);
  const [statuses,setStatuses]=useState<string[]>([]);
  const [submitting,setSubmitting]=useState(false);
  const [err,setErr]=useState<string|null>(null);
  const [toast,setToast]=useState<string|null>(null);
  const [confirmDelete,setConfirmDelete]=useState(false);
  const [deleting,setDeleting]=useState(false);
  const [diceSuggestions,setDiceSuggestions]=useState<string[]>(HANDLE_SUGGESTIONS);
  const [candy,setCandy]=useState<CandyKey>("emerald");
  const [editOpen,setEditOpen]=useState(false);
  const [myGists,setMyGists]=useState<GistRow[]>([]);
  const [gistsLoading,setGistsLoading]=useState(false);
  const [shareOpen,setShareOpen]=useState(false);
  const [shareImg,setShareImg]=useState<string|null>(null);
  const [repExplainerOpen,setRepExplainerOpen]=useState(false);
  const [proofs,setProofs]=useState<any[]>([]);
  const [proofsLoading,setProofsLoading]=useState(false);
  const shareCanvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(()=>{ setCandy(randomCandy()); },[]);
  function shuffleSuggestions(){
    const bases=["alex","bisola","emma","zainab","chidi","tunde","amara","david","faith","umar","lara","simi"];
    const out:string[]=[]; for(let i=0;i<6;i++){ const b=bases[Math.floor(Math.random()*bases.length)]; const n=String(Math.floor(Math.random()*90+10)).padStart(2,"0"); out.push(`${b}_${n}`); }
    setDiceSuggestions(out); setCandy(randomCandy());
  }
  useEffect(()=>{
    try{
      const raw=localStorage.getItem("physi_profile");
      if(raw){ const p=JSON.parse(raw) as StoredProfile; if(p?.id && p?.nickname){ setProfile(p); setFetching(true);
        setNickname(p.nickname); setFullName(p.full_name||""); setProgramme(p.programme||PROGRAMMES[0]); setLevel(p.level||LEVELS[1]); setStatuses(p.statuses||[]);
        const cc = candyFromString(p.nickname||"");
        setCandy(cc);
        fetch(`/api/profile?id=${encodeURIComponent(p.id)}`,{cache:"no-store"}).then(r=>r.json()).then(j=>{ if(j?.ok && j?.user){ const u=j.user as StoredProfile; setProfile(u); localStorage.setItem("physi_profile",JSON.stringify(u)); setNickname(u.nickname); setFullName(u.full_name||"");}}).catch(()=>{}).finally(()=>setFetching(false));
      }}
    }catch{}
    const savedCandy=localStorage.getItem("physi_avatar_candy") as CandyKey|null;
    if(savedCandy && CANDY_KEYS.includes(savedCandy)) setCandy(savedCandy);
    setLoadingExisting(false);
  },[]);
  useEffect(()=>{ if(!toast) return; const t=setTimeout(()=>setToast(null),2400); return()=>clearTimeout(t); },[toast]);
  useEffect(()=>{ try{ localStorage.setItem("physi_avatar_candy", candy); }catch{} },[candy]);
  // fetch Your gists
  useEffect(()=>{
    if(!profile?.id) return;
    let cancelled=false;
    async function fetchGists(){
      setGistsLoading(true);
      try{
        // try ?created_by=me first
        let rows: GistRow[] = [];
        try{
          const r = await fetch(`/api/timetable?created_by=me&limit=50`, { cache:"no-store" });
          const j = await r.json().catch(()=>({} as any));
          if(j?.ok && Array.isArray(j.events) && j.events.length){
            rows = j.events;
          }
        }catch{}
        if(rows.length===0){
          // fallback: fetch all and filter client-side by created_by == profile.id
          const r2 = await fetch(`/api/timetable?limit=200`, { cache:"no-store" });
          const j2 = await r2.json().catch(()=>({} as any));
          const all: GistRow[] = j2.events ?? [];
          rows = all.filter((e:any)=> String((e as any).created_by||"")===String(profile!.id));
          // also try localStorage fallback: check physi_events local? keep empty if still none
        }
        if(!cancelled) setMyGists(rows.slice(0,20));
      }catch{
        if(!cancelled) setMyGists([]);
      } finally { if(!cancelled) setGistsLoading(false); }
    }
    fetchGists();
    const iv=setInterval(fetchGists,30000);
    return ()=>{ cancelled=true; clearInterval(iv); };
  }, [profile?.id]);
  // Proof receipts — recent proofs scrollable list Witness gold, squad etc
  useEffect(()=>{
    if(!profile?.id) return;
    let cancel=false;
    async function fetchProofs(){
      setProofsLoading(true);
      try{
        const r=await fetch(`/api/verify?verifier_id=${encodeURIComponent(profile!.id)}&limit=20`,{cache:"no-store"});
        const j=await r.json().catch(()=>({} as any));
        if(!cancel) setProofs(j.proofs ?? j.verifications ?? []);
      }catch{} finally{ if(!cancel) setProofsLoading(false); }
    }
    fetchProofs();
    const iv=setInterval(fetchProofs,30000);
    return ()=>{ cancel=true; clearInterval(iv); };
  }, [profile?.id]);
  // share card generation
  useEffect(()=>{
    if(!shareOpen) return;
    const t=setTimeout(()=> generateShareCard(), 80);
    return ()=> clearTimeout(t);
  }, [shareOpen, profile]);
  function generateShareCard(){
    const c=shareCanvasRef.current;
    if(!c || !profile) return;
    const W=1080, H=1350;
    c.width=W; c.height=H;
    const ctx=c.getContext("2d");
    if(!ctx) return;
    const g=ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0,"#0d3b2a");
    g.addColorStop(0.45,"#143d2e");
    g.addColorStop(1,"#52b788");
    ctx.fillStyle=g;
    ctx.fillRect(0,0,W,H);
    const rg=ctx.createRadialGradient(W/2,H*0.28,0,W/2,H*0.28,W*0.7);
    rg.addColorStop(0,"rgba(82,183,136,0.32)");
    rg.addColorStop(1,"transparent");
    ctx.fillStyle=rg;
    ctx.fillRect(0,0,W,H);
    const cardX=56, cardY=420, cardW=W-112, cardH=560, r=32;
    ctx.fillStyle="rgba(255,255,255,0.96)";
    ctx.beginPath();
    // @ts-ignore roundRect
    if((ctx as any).roundRect) (ctx as any).roundRect(cardX,cardY,cardW,cardH,r);
    else ctx.rect(cardX,cardY,cardW,cardH);
    ctx.fill();
    const cc = candyFromString(profile.nickname);
    const col = CANDY_HEX[cc];
    const avX=W/2, avY=360, avR=110;
    ctx.fillStyle=col+"33";
    ctx.beginPath(); ctx.arc(avX,avY,avR+22,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=col;
    ctx.beginPath(); ctx.arc(avX,avY,avR,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle="rgba(255,255,255,0.9)"; ctx.lineWidth=6; ctx.stroke();
    const initials=(profile.nickname||"YOU").slice(0,2).toUpperCase();
    ctx.fillStyle="white"; ctx.font="900 64px system-ui, sans-serif"; ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText(initials, avX, avY+4);
    const repVal = Number(profile.mining_balance ?? 0);
    const li = getLevelInfo(repVal);
    ctx.fillStyle="#0f172a"; ctx.font="900 42px system-ui, sans-serif"; ctx.fillText("@"+profile.nickname, W/2, cardY+92);
    ctx.fillStyle="#475569"; ctx.font="700 22px system-ui, sans-serif"; ctx.fillText(`${li.name}  ·  Lvl ${li.lvl}`, W/2, cardY+138);
    ctx.fillStyle="#0f172a"; ctx.font="900 72px system-ui, sans-serif"; ctx.fillText(`${repVal.toFixed(1)} Rep`, W/2, cardY+236);
    // progress bar
    const barX=cardX+64, barW=cardW-128, barY=cardY+320, barH=18;
    ctx.fillStyle="rgba(0,0,0,0.08)";
    if((ctx as any).roundRect){ ctx.beginPath(); (ctx as any).roundRect(barX,barY,barW,barH,9); ctx.fill(); } else ctx.fillRect(barX,barY,barW,barH);
    ctx.fillStyle=li.lvl===5? "#fbbf24" : "#10b981";
    const pw=Math.max(8, barW*li.progress);
    if((ctx as any).roundRect){ ctx.beginPath(); (ctx as any).roundRect(barX,barY,pw,barH,9); ctx.fill(); } else ctx.fillRect(barX,barY,pw,barH);
    ctx.fillStyle="#64748b"; ctx.font="600 18px system-ui, sans-serif";
    const nextTxt=li.nextAt? `${(li.nextAt-repVal).toFixed(1)} to L${li.lvl+1}` : "MAX — Legend";
    ctx.fillText(li.lvl===5? "MAX L5 Legend" : nextTxt, W/2, barY+52);
    ctx.fillStyle="rgba(255,255,255,0.92)"; ctx.font="700 20px system-ui, sans-serif"; ctx.fillText("physicoin · hub · WAT", W/2, H-72);
    ctx.fillStyle="rgba(255,255,255,0.64)"; ctx.font="500 16px system-ui, sans-serif";
    try{ ctx.fillText(window.location.origin+"/app/profile", W/2, H-42); }catch{ ctx.fillText("physicoin", W/2, H-42); }
    try{ setShareImg(c.toDataURL("image/png")); }catch{ setShareImg(null); }
  }
  async function handleShareCard(){
    const c=shareCanvasRef.current;
    if(!c){ setToast("card not ready"); return; }
    try{
      const blob: Blob | null = await new Promise(res=> c.toBlob(b=>res(b),"image/png",0.92));
      if(blob && (navigator as any).canShare){
        const file=new File([blob],"physicoin-hub.png",{type:"image/png"});
        if((navigator as any).canShare({files:[file]})){
          await (navigator as any).share({title:"My PHYSI Hub", text:`Lvl ${getLevelInfo(Number(profile?.mining_balance??0)).lvl} · ${getLevelInfo(Number(profile?.mining_balance??0)).name} · ${Number(profile?.mining_balance??0).toFixed(1)} Rep`, files:[file]});
          setToast("shared ✓"); return;
        }
      }
      if((navigator as any).share && shareImg){
        await (navigator as any).share({title:"My PHYSI Hub", text:`Lvl ${getLevelInfo(Number(profile?.mining_balance??0)).lvl} · ${Number(profile?.mining_balance??0).toFixed(1)} Rep — ${window.location.href}`, url: window.location.href});
        setToast("shared ✓"); return;
      }
    }catch{}
    try{
      const url=c.toDataURL("image/png");
      const a=document.createElement("a");
      a.href=url; a.download=`physicoin-hub-${profile?.nickname||"you"}.png`;
      document.body.appendChild(a); a.click(); a.remove();
      setToast("image downloaded");
    }catch{ setToast("could not share — long-press image to save"); }
  }

  function toggleStatus(v:string){ setStatuses(prev=> prev.includes(v) ? prev.filter(x=>x!==v) : [...prev,v]); }
  const nicknameOk=useMemo(()=> hValidLight(nickname.trim().toLowerCase()),[nickname]);
  const fullNameOk= fullName.trim().split(" ").filter(Boolean).length>=2 && fullName.trim().length>=5;
  async function handleSubmit(e:React.FormEvent){
    e.preventDefault(); setErr(null);
    const nick=nickname.trim().toLowerCase(); const name=fullName.trim();
    if(!hValidLight(nick)){ setErr("handle needs to look like alex_02 — lowercase, underscore and a number"); return; }
    if(!fullNameOk){ setErr("add your full name — first and last, so coursemates know it's you"); return; }
    if(!programme || !level){ setErr("pick your programme and level — we use it to show the right gist"); return; }
    setSubmitting(true);
    try{
      const r= await fetch("/api/profile",{ method:"POST", headers:{ "content-type":"application/json" }, body: JSON.stringify({ nickname:nick, full_name:name, programme, level, statuses, authority_base:1.0, authority_final:1.0 })});
      const j= await r.json().catch(()=>({}));
      if(r.status===409 || j?.code==="NICKNAME_TAKEN"){ setErr(`“${nick}” is taken — someone in your set already grabbed it. Try ${nick.slice(0,-2)}_${String(Math.floor(Math.random()*90+10)).padStart(2,"0")} or another number.`); return; }
      if(!r.ok || j.ok===false) throw new Error(j.error || j.hint || "couldn't create profile");
      const user=j.user as StoredProfile; localStorage.setItem("physi_profile",JSON.stringify(user)); setProfile(user); setToast("handle locked — you can now post and your votes count");
      try{ localStorage.setItem("physi_avatar_candy", candy); }catch{}
    }catch(e:unknown){ logError("PROFILE_CREATE_FAILED",e,{page:"profile"}); setErr(getErrorMessage("PROFILE_CREATE_FAILED")); } finally{ setSubmitting(false); }
  }
  function clearProfile(){ localStorage.removeItem("physi_profile"); setProfile(null); setErr(null); setConfirmDelete(false); setToast("cleared — pick a new handle"); }
  async function handleDelete(){
    if(!profile?.id) return; setDeleting(true); setErr(null);
    try{ const r=await fetch(`/api/profile?id=${encodeURIComponent(profile.id)}`,{method:"DELETE"}); const j=await r.json().catch(()=>({})); if(!r.ok || j.ok===false) throw new Error(j.error || j.hint || "couldn't delete account");
      localStorage.removeItem("physi_profile"); localStorage.removeItem("physi_mining_last"); setProfile(null); setConfirmDelete(false); setToast("account deleted — handle and votes removed permanently");
    }catch(e:unknown){ logError("PROFILE_DELETE_FAILED",e,{page:"profile"}); setErr(getErrorMessage("PROFILE_DELETE_FAILED")); } finally{ setDeleting(false); }
  }

  if(loadingExisting) return (<div className="space-y-4"><div className="h-28 animate-pulse rounded-[20px] border border-white/[0.06] bg-white/[0.03]" /><div className="h-64 animate-pulse rounded-[20px] border border-white/[0.06] bg-white/[0.03]" /></div>);

  if(profile){
    const ab=Number(profile.authority_base ?? 1).toFixed(2);
    const af=Number(profile.authority_final ?? 1).toFixed(2);
    const repN=Number(profile.mining_balance ?? 0);
    const rep=repN.toFixed(1);
    const initial=(profile.nickname?.[0] ?? profile.full_name?.[0] ?? "?").toUpperCase();
    const cc=candyFromString(profile.nickname);
    const lvl = getLevelInfo(repN);
    return (
      <div className="space-y-4">
        {/* HUB header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-slate-500">profile · hub dashboard</p>
            <h1 className="mt-1 text-[22px] font-bold tracking-[-0.025em] text-white sm:text-[26px]">Your hub</h1>
            <p className="mt-1 max-w-[640px] text-[13.5px] leading-5 text-slate-400">Your candy avatar, level, and gists — share your card, track quorum.</p>
          </div>
          <button onClick={()=> setShareOpen(true)} className="hidden sm:inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-[14px] font-bold text-black shadow hover:bg-slate-100">⤴ Share card</button>
        </div>

        {/* Big candy avatar + Lvl badge + progress + sparkline */}
        <div className="grid gap-4 lg:grid-cols-[1.35fr_0.85fr]">
          <div className="relative overflow-hidden rounded-[20px] border border-white/[0.08] bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-5 backdrop-blur sm:p-6">
            <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-emerald-400/10 blur-[40px]" />
            <div className="flex items-start gap-5">
              <div className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-[22px] ${CANDY_BG[cc]} text-[22px] font-black tracking-tight text-white shadow-[0_8px_28px_rgba(0,0,0,0.3)] ring-4 ${CANDY_RING[cc]} sm:h-24 sm:w-24 sm:text-[26px]`}>{initial}</div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-[20px] font-bold tracking-tight text-white">@{profile.nickname}</h2>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 font-mono text-[11px] font-medium text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> active</span>
                  {fetching && <span className="font-mono text-[11px] text-slate-500">syncing…</span>}
                </div>
                <p className="mt-0.5 truncate text-[14px] font-medium text-slate-200">{profile.full_name}</p>
                <p className="font-mono text-[12px] text-slate-500">{profile.programme} · {profile.level}{profile.created_at ? ` · since ${new Date(profile.created_at).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}` : ""}</p>
                {(profile.statuses?.length ?? 0)>0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">{profile.statuses.map(s=> <span key={s} className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 font-mono text-[11px] text-slate-300">{s}</span>)}</div>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-black ${lvl.lvl===5? "bg-gradient-to-r from-amber-400 to-yellow-300 text-black ring-2 ring-amber-300":"bg-white text-black"}`}>Lvl {lvl.lvl} · {lvl.name}</span>
                  <button onClick={()=> setRepExplainerOpen(true)} aria-label="What is Rep?" className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/20 bg-white/10 text-[11px] font-black text-white hover:bg-white hover:text-black transition" title="What is Rep?">ⓘ</button>
                  <span className="font-mono text-[12px] font-bold text-white">{rep} Rep</span>
                  <button onClick={()=> setShareOpen(true)} className="sm:hidden inline-flex items-center rounded-full bg-white px-3 py-1.5 text-[12px] font-bold text-black">Share card</button>
                </div>
                {/* progress */}
                <div className="mt-3 flex items-center gap-3">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10"><div className={`h-full ${lvl.lvl===5? "bg-gradient-to-r from-amber-400 to-yellow-300":"bg-emerald-400"}`} style={{ width: `${lvl.progress*100}%` }} /></div>
                  <span className="font-mono text-[11px] text-slate-400 whitespace-nowrap">{lvl.nextAt? `${(lvl.nextAt - repN).toFixed(1)} to L${lvl.lvl+1}`:"MAX Legend"}</span>
                </div>
                {/* 30-day sparkline */}
                <div className="mt-3 flex items-center gap-3 rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                  <span className="font-mono text-[10px] font-bold tracking-wide text-slate-400">30-day</span>
                  <RepSparkline30 rep={repN} />
                  <span className="font-mono text-[10px] text-slate-500">{repN.toFixed(1)} Rep · {lvl.name}</span>
                </div>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2">
              {[
                ["base",ab,"starting weight"],
                ["final",af,"your vote weight"],
                ["Rep",rep,"contribution score"],
              ].map(([k,v,sub])=> (
                <div key={k} className="rounded-2xl border border-white/[0.07] bg-[#0b1020] px-3 py-3 text-center sm:px-4">
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-slate-500">{k}</p>
                  <p className="mt-1 font-mono text-[16px] font-bold tracking-tight text-white">{v}</p>
                  <p className="font-mono text-[10px] leading-none text-slate-500">{sub}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button onClick={()=> setShareOpen(true)} className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-[14px] font-bold text-[#070a12] shadow hover:bg-slate-100">⤴ Share card</button>
              <a href="/app/roadmap" className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-5 py-2.5 text-[14px] font-medium text-slate-200 hover:bg-white/[0.08]">Open road →</a>
              <a href="/app/timetable" className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-5 py-2.5 text-[14px] font-medium text-slate-200 hover:bg-white/[0.08]">Timetable</a>
            </div>
          </div>

          {/* Your gists */}
          <div className="space-y-3">
            <div className="rounded-[20px] border border-white/[0.06] bg-white/[0.03] p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-[14px] font-semibold text-white">Your gists</h3>
                <span className="rounded-full bg-white/10 px-2.5 py-1 font-mono text-[11px] text-slate-300">{myGists.length} · /api/timetable?created_by=me</span>
              </div>
              {gistsLoading ? (
                <div className="mt-3 space-y-2"><div className="h-14 animate-pulse rounded-xl bg-white/5" /><div className="h-14 animate-pulse rounded-xl bg-white/5" /></div>
              ) : myGists.length===0 ? (
                <div className="mt-3 rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-center">
                  <p className="text-[13px] font-medium text-slate-300">No gists yet</p>
                  <p className="mt-1 font-mono text-[11px] text-slate-500">Post from Road → + to gist. Your posts appear here with quorum bars.</p>
                  <a href="/app/roadmap" className="mt-3 inline-flex rounded-full bg-white px-4 py-2 text-[13px] font-bold text-black">＋ Create gist</a>
                </div>
              ) : (
                <div className="mt-3 grid gap-2 max-h-[420px] overflow-auto pr-1">
                  {myGists.map(ev=> {
                    const ap = Number(ev.authority_points ?? 0);
                    const rp = Number(ev.required_points ?? 0) || 8;
                    const pct = Math.min(100, Math.round((ap/rp)*100));
                    const verified = ap >= rp || ev.status==="verified";
                    return (
                      <div key={ev.id} className={`rounded-xl border px-3 py-3 ${verified? "border-emerald-400/20 bg-emerald-500/10":"border-white/10 bg-white/[0.03]"}`}>
                        <div className="flex items-center gap-2">
                          <span className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-black ${verified? "bg-emerald-500 text-white":"bg-amber-500 text-white"}`}>{verified?"✓":"●"}</span>
                          <p className="flex-1 truncate text-[13px] font-semibold text-white">{ev.title}</p>
                          <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${verified? "bg-emerald-500 text-white":"bg-amber-500 text-white"}`}>{verified? "verified":"advisory"}</span>
                        </div>
                        <p className="mt-1 font-mono text-[11px] text-slate-400 truncate">{ev.venue} · {String(ev.event_date).slice(0,10)} {String(ev.event_time).slice(0,5)} · {ap}/{rp} · {pct}%</p>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className={`h-full ${verified? "bg-emerald-400":"bg-amber-400"}`} style={{ width: `${pct}%` }} /></div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="mt-3 flex gap-2">
                <a href="/app/timetable" className="flex-1 rounded-full bg-white px-3 py-2 text-center text-[13px] font-semibold text-[#070a12]">Open feed</a>
                <a href="/app/mining" className="flex-1 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-center text-[13px] font-medium text-slate-200">Daily Rep</a>
              </div>
            </div>
            <div className="rounded-2xl border border-amber-400/15 bg-amber-400/[0.06] px-4 py-3">
              <p className="font-mono text-[11px] leading-4 text-amber-200/70">Share your hub card → coursemates join via your link → +1 Rep per invite.</p>
            </div>
            {/* Proof receipts — recent proofs scrollable list Witness gold, squad etc */}
            <div className="rounded-[20px] border border-white/[0.06] bg-white/[0.03] p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-[14px] font-semibold text-white">Recent proofs</h3>
                <span className="rounded-full bg-white/10 px-2.5 py-1 font-mono text-[11px] text-slate-300">{proofs.length} · receipts</span>
              </div>
              <p className="mt-1 font-mono text-[11px] text-slate-500">Witness gold + squad boost + award — scrollable</p>
              {proofsLoading ? (
                <div className="mt-3 space-y-2"><div className="h-12 animate-pulse rounded-xl bg-white/5" /><div className="h-12 animate-pulse rounded-xl bg-white/5" /></div>
              ) : proofs.length===0 ? (
                <div className="mt-3 rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-center">
                  <p className="text-[13px] font-medium text-slate-300">No proofs yet</p>
                  <p className="mt-1 font-mono text-[11px] text-slate-500">Verify a gist on the Road — your receipts appear here with Witness gold etc.</p>
                </div>
              ) : (
                <div className="mt-3 max-h-[260px] overflow-auto pr-1 divide-y divide-white/5 rounded-xl border border-white/10 bg-black/20">
                  {proofs.map((p:any)=> (
                    <div key={p.id} className="flex items-center gap-2 px-3 py-2.5">
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-black ${p.vote==="YES" ? "bg-emerald-500 text-white" : p.vote==="NO" ? "bg-red-500 text-white" : "bg-slate-600 text-white"}`}>{p.vote?.slice(0,1)||"•"}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-semibold text-white">{String(p.event_title||p.event_id).slice(0,40)}</p>
                        <p className="truncate font-mono text-[10px] text-slate-500">{String(p.event_venue||"")} · {String(p.event_date||"").slice(0,10)} {String(p.event_time||"").slice(0,5)} · {p.vote} · {Number(p.authority_weight||0).toFixed(1)}w</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {p.is_witness ? <span className="rounded-full bg-yellow-400 px-2 py-0.5 text-[10px] font-black text-black border border-yellow-300">Witness gold</span> : <span className="rounded-full bg-slate-700 px-2 py-0.5 text-[10px] font-bold text-slate-300">Remote</span>}
                        <div className="flex gap-1">
                          {p.squad_boost && <span className="rounded-full bg-violet-500 px-1.5 py-0.5 text-[9px] font-bold text-white">squad 1.5×</span>}
                          <span className="rounded-full bg-white/10 px-1.5 py-0.5 font-mono text-[9px] text-slate-300">+{Number(p.award||0).toFixed(1)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Edit section — keep form */}
        <div className="rounded-[20px] border border-white/[0.06] bg-white/[0.02] overflow-hidden">
          <button onClick={()=> setEditOpen(v=>!v)} className="flex w-full items-center justify-between px-5 py-4">
            <span className="text-[14px] font-semibold text-white">Edit profile</span>
            <span className="rounded-full bg-white/10 px-3 py-1 font-mono text-[11px] text-slate-300">{editOpen ? "hide ▲" : "show ▼"}</span>
          </button>
          {editOpen && (
            <div className="border-t border-white/10 px-5 py-5">
              <p className="font-mono text-[11px] text-slate-400">Update your handle, programme, level or roles — reusing the same create flow.</p>
              <form onSubmit={handleSubmit} className="mt-4 grid gap-4">
                <label className="space-y-1.5">
                  <span className="font-mono text-[10.5px] uppercase tracking-wide text-slate-500">Handle</span>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[14px] text-slate-500">@</span>
                    <input value={nickname} onChange={(e)=> setNickname(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,""))} placeholder="alex_02" maxLength={20} className="w-full rounded-xl border border-white/10 bg-[#0b1020] py-2.5 pl-7 pr-3 font-mono text-[14px] text-white placeholder:text-slate-500 focus:border-white/20 focus:outline-none" />
                  </div>
                  <span className={`block font-mono text-[11px] ${nickname && !nicknameOk ? "text-amber-300":"text-slate-500"}`}>{handleHint(nickname.toLowerCase())}</span>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {diceSuggestions.map(s=> (
                      <button key={s} type="button" onClick={()=>{ setNickname(s); setCandy(randomCandy()); }} className={`rounded-full border px-2.5 py-1 font-mono text-[11px] ${nickname===s ? "border-white bg-white text-[#070a12]":"border-white/10 bg-white/[0.04] text-slate-300"}`}>{s}</button>
                    ))}
                    <button type="button" onClick={shuffleSuggestions} className="font-mono text-[11px] text-slate-500 hover:text-slate-300">↻ shuffle</button>
                  </div>
                </label>
                <label className="space-y-1.5">
                  <span className="font-mono text-[10.5px] uppercase tracking-wide text-slate-500">Full name</span>
                  <input value={fullName} onChange={(e)=>setFullName(e.target.value)} placeholder="Aisha Bello" className="w-full rounded-xl border border-white/10 bg-[#0b1020] px-3 py-2.5 text-[14px] text-white placeholder:text-slate-500 focus:border-white/20 focus:outline-none" />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1.5"><span className="font-mono text-[10.5px] uppercase tracking-wide text-slate-500">Programme</span>
                    <select value={programme} onChange={(e)=>setProgramme(e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#0b1020] px-3 py-2.5 text-[14px] text-white focus:border-white/20 focus:outline-none">{PROGRAMMES.map(p=> <option key={p} value={p} className="bg-[#0b1020]">{p}</option>)}</select>
                  </label>
                  <label className="space-y-1.5"><span className="font-mono text-[10.5px] uppercase tracking-wide text-slate-500">Level</span>
                    <select value={level} onChange={(e)=>setLevel(e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#0b1020] px-3 py-2.5 text-[14px] text-white focus:border-white/20 focus:outline-none">{LEVELS.map(l=> <option key={l} value={l} className="bg-[#0b1020]">{l}</option>)}</select>
                  </label>
                </div>
                <div>
                  <span className="font-mono text-[10.5px] uppercase tracking-wide text-slate-500">Roles</span>
                  <div className="mt-2 flex flex-wrap gap-1.5">{STATUS_OPTIONS.map(o=> (
                    <button key={o.v} type="button" onClick={()=>toggleStatus(o.v)} className={`rounded-full border px-3 py-1.5 text-[13px] font-medium ${statuses.includes(o.v) ? "border-white bg-white text-[#070a12]":"border-white/10 bg-white/[0.03] text-slate-300"}`}>{statuses.includes(o.v) ? "✓ ":" + "}{o.l}</button>
                  ))}</div>
                </div>
                {/* candy picker in edit */}
                <div>
                  <span className="font-mono text-[10.5px] uppercase tracking-wide text-slate-500">Candy avatar — tap to swap</span>
                  <div className="mt-2 flex items-center gap-2">
                    <button type="button" onClick={()=>setCandy(randomCandy())} className={`flex h-11 w-11 items-center justify-center rounded-2xl ${CANDY_BG[candy]} text-[15px] font-black text-white ring-2 ${CANDY_RING[candy]}`}>{(nickname?.[0] ?? "?").toUpperCase()}</button>
                    <div className="flex gap-1.5">
                      {CANDY_KEYS.map(k=> (
                        <button key={k} type="button" onClick={()=>setCandy(k)} className={`h-8 w-8 rounded-full ${CANDY_BG[k]} ring-2 ${candy===k ? "ring-white scale-110" : "ring-white/10"}`} aria-label={k} />
                      ))}
                    </div>
                    <span className="font-mono text-[11px] text-slate-500 capitalize">{candy} candy</span>
                  </div>
                </div>
                {err && <div className="rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2.5 font-mono text-[12px] text-red-200">{err}</div>}
                <div className="flex flex-wrap items-center gap-3">
                  <button disabled={submitting} className="rounded-full bg-white px-6 py-2.5 text-[14px] font-semibold text-[#070a12] hover:bg-slate-100 disabled:opacity-60">{submitting ? "Saving…":"Save changes →"}</button>
                  <button type="button" onClick={()=> setEditOpen(false)} className="rounded-full border border-white/10 bg-white/5 px-5 py-2.5 text-[14px] text-slate-300">Cancel</button>
                  <span className="font-mono text-[11px] text-slate-500">saves to this browser + pilot DB</span>
                </div>
              </form>
              <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-white/10 pt-4">
                <button onClick={clearProfile} className="font-mono text-[11px] text-slate-500 hover:text-slate-300">use another handle</button>
                {!confirmDelete ? <button onClick={()=>setConfirmDelete(true)} className="rounded-full border border-red-500/30 bg-red-500/10 px-4 py-2 font-mono text-[12px] text-red-300">Delete account</button> : (
                  <span className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-950/40 px-3 py-2">
                    <span className="font-mono text-[11px] text-red-200">Are you sure?</span>
                    <button onClick={handleDelete} disabled={deleting} className="rounded-full bg-red-500 px-3 py-1.5 font-mono text-[11px] text-white">{deleting ? "Deleting…":"Yes delete"}</button>
                    <button onClick={()=>setConfirmDelete(false)} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-[11px] text-slate-300">Cancel</button>
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Share card modal */}
        {shareOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm" onClick={()=> setShareOpen(false)}>
            <div onClick={e=>e.stopPropagation()} className="w-full max-w-[360px] rounded-[24px] border border-white/10 bg-[#0b0f1e] p-5 shadow-2xl max-h-[90vh] overflow-auto">
              <div className="flex items-center justify-between">
                <h3 className="text-[15px] font-black text-white">Your Hub Card</h3>
                <button onClick={()=> setShareOpen(false)} className="rounded-full bg-white/10 px-3 py-1 text-sm text-white">✕</button>
              </div>
              <p className="mt-1 font-mono text-[11px] text-slate-400">Forest card · candy avatar · Lvl + Rep</p>
              <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-black">
                <canvas ref={shareCanvasRef} className="h-auto w-full" style={{ display: shareImg ? "none" : "block" }} />
                {shareImg && <img src={shareImg} alt="Hub card" className="h-auto w-full" />}
              </div>
              <div className="mt-4 grid gap-2">
                <button onClick={handleShareCard} className="w-full rounded-full bg-white py-3 text-[14px] font-black text-black">Share card — share or download</button>
                <button onClick={()=> generateShareCard()} className="w-full rounded-full border border-white/10 bg-white/5 py-2.5 text-[13px] text-white">↻ Regenerate</button>
              </div>
              <p className="mt-2 text-center font-mono text-[10px] text-slate-500">Lvl {lvl.lvl} {lvl.name} · {rep} Rep · @ {profile.nickname}</p>
            </div>
          </div>
        )}

        <RepExplainer open={repExplainerOpen} onClose={()=> setRepExplainerOpen(false)} rep={repN} levelInfo={lvl} />
        {toast && <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-full border border-white/10 bg-[#0f172a] px-4 py-2 text-[13px] text-white shadow-xl">{toast}</div>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-slate-500">profile · pick your character</p>
        <h1 className="mt-1 text-[22px] font-bold tracking-[-0.025em] text-white sm:text-[26px]">Your handle is your character</h1>
        <p className="mt-1 max-w-[640px] text-[13.5px] leading-5 text-slate-400">No one trusts “Dream” for a venue change. Pick something your coursemates will recognise — like <span className="rounded bg-white/10 px-1 py-0.5 font-mono text-slate-200">alex_02</span> or <span className="rounded bg-white/10 px-1 py-0.5 font-mono text-slate-200">bisola_11</span>. One tap to claim. Rep follows you.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <form onSubmit={handleSubmit} className="rounded-[20px] border border-white/[0.08] bg-white/[0.04] p-4 backdrop-blur sm:p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-[14px] font-semibold text-white">Create your character</h2>
            <span className="font-mono text-[10.5px] text-slate-500">one handle · Rep grows</span>
          </div>
          <p className="mt-1 text-[12.5px] text-slate-400">Takes 20 seconds. Your candy avatar is random — tap a suggestion to claim instantly.</p>
          <label className="mt-4 block space-y-1.5">
            <span className="font-mono text-[10.5px] uppercase tracking-wide text-slate-500">Handle — one tap to pick</span>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[14px] text-slate-500">@</span>
              <input value={nickname} onChange={(e)=> setNickname(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,""))} placeholder="alex_02" maxLength={20} className="w-full rounded-xl border border-white/10 bg-[#0b1020] py-2.5 pl-7 pr-3 font-mono text-[14px] text-white placeholder:text-slate-500 focus:border-white/20 focus:outline-none" />
              <span className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[11px] ${nicknameOk ? "text-emerald-400":"text-slate-500"}`}>{nickname ? (nicknameOk ? "✓":"—"):""}</span>
            </div>
            <span className={`block font-mono text-[11px] ${nickname && !nicknameOk ? "text-amber-300":"text-slate-500"}`}>{handleHint(nickname.toLowerCase())}</span>
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="font-mono text-[11px] text-slate-600">tap to claim:</span>
              {diceSuggestions.map(s=> (
                <button key={s} type="button" onClick={()=>{ setNickname(s); setCandy(randomCandy()); }} className={`rounded-full border px-2.5 py-1 font-mono text-[11px] transition ${nickname===s ? "border-white bg-white text-[#070a12]":"border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] hover:text-white"}`}>{s}</button>
              ))}
              <button type="button" onClick={shuffleSuggestions} className="font-mono text-[11px] text-slate-500 hover:text-slate-300">↻ shuffle</button>
            </div>
          </label>
          <div className="mt-4">
            <span className="font-mono text-[10.5px] uppercase tracking-wide text-slate-500">Candy avatar — tap to swap</span>
            <div className="mt-2 flex items-center gap-2">
              <button type="button" onClick={()=>setCandy(randomCandy())} className={`flex h-11 w-11 items-center justify-center rounded-2xl ${CANDY_BG[candy]} text-[15px] font-black text-white shadow-lg ring-2 ${CANDY_RING[candy]} transition hover:scale-105`}>{(nickname?.[0] ?? "?").toUpperCase()}</button>
              <div className="flex gap-1.5">
                {CANDY_KEYS.map(k=> (
                  <button key={k} type="button" onClick={()=>setCandy(k)} className={`h-8 w-8 rounded-full ${CANDY_BG[k]} ring-2 transition ${candy===k ? "ring-white scale-110" : "ring-white/10 hover:ring-white/30"}`} aria-label={`pick ${k}`} />
                ))}
              </div>
              <span className="font-mono text-[11px] text-slate-500 capitalize">{candy} candy</span>
            </div>
            <p className="mt-1 font-mono text-[11px] text-slate-500">random emerald / amber / sky / violet — one tap, your character color locks with handle</p>
          </div>

          <label className="mt-4 block space-y-1.5">
            <span className="font-mono text-[10.5px] uppercase tracking-wide text-slate-500">Full name</span>
            <input value={fullName} onChange={(e)=>setFullName(e.target.value)} placeholder="Aisha Bello" className="w-full rounded-xl border border-white/10 bg-[#0b1020] px-3 py-2.5 text-[14px] text-white placeholder:text-slate-500 focus:border-white/20 focus:outline-none" />
            <span className="block font-mono text-[11px] text-slate-500">first + last — so your Rep is tied to a real coursemate</span>
          </label>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5"><span className="font-mono text-[10.5px] uppercase tracking-wide text-slate-500">Programme</span>
              <select value={programme} onChange={(e)=>setProgramme(e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#0b1020] px-3 py-2.5 text-[14px] text-white focus:border-white/20 focus:outline-none">{PROGRAMMES.map(p=> <option key={p} value={p} className="bg-[#0b1020]">{p}</option>)}</select>
            </label>
            <label className="space-y-1.5"><span className="font-mono text-[10.5px] uppercase tracking-wide text-slate-500">Level</span>
              <select value={level} onChange={(e)=>setLevel(e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#0b1020] px-3 py-2.5 text-[14px] text-white focus:border-white/20 focus:outline-none">{LEVELS.map(l=> <option key={l} value={l} className="bg-[#0b1020]">{l}</option>)}</select>
            </label>
          </div>
          <div className="mt-4">
            <span className="font-mono text-[10.5px] uppercase tracking-wide text-slate-500">Roles (optional — helps your Rep make sense)</span>
            <div className="mt-2 flex flex-wrap gap-1.5">{STATUS_OPTIONS.map(o=> (
              <button key={o.v} type="button" onClick={()=>toggleStatus(o.v)} className={`rounded-full border px-3 py-1.5 text-[13px] font-medium transition ${statuses.includes(o.v) ? "border-white bg-white text-[#070a12]":"border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.07] hover:text-white"}`}>{statuses.includes(o.v) ? "✓ ":" + "}{o.l}</button>
            ))}</div>
            <p className="mt-1.5 font-mono text-[11px] text-slate-500">you can leave blank — Rep starts at 1.0 either way</p>
          </div>
          {err && <div className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2.5 font-mono text-[12px] leading-4 text-red-200">{err}</div>}
          <div className="mt-5 flex items-center gap-3">
            <button disabled={submitting} className="inline-flex items-center justify-center rounded-full bg-white px-6 py-2.5 text-[14px] font-semibold text-[#070a12] shadow-[0_4px_20px_rgba(255,255,255,0.12)] hover:bg-slate-100 disabled:opacity-60 transition">{submitting ? "Creating…":"Create handle →"}</button>
            <span className="font-mono text-[11px] text-slate-500">saves to this browser · <code className="rounded bg-white/10 px-1">physi_profile</code></span>
          </div>
        </form>
        <div className="space-y-3">
          <div className="rounded-[20px] border border-white/[0.06] bg-white/[0.03] p-5">
            <p className="font-mono text-[10.5px] uppercase tracking-wide text-slate-500">Preview — your character</p>
            <div className="mt-3 flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-[#0b1020] px-4 py-4">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${CANDY_BG[candy]} text-[13px] font-black text-white ring-2 ${CANDY_RING[candy]}`}>{(nickname?.[0] ?? "?").toUpperCase()}</div>
              <div className="min-w-0"><p className="truncate font-mono text-[13px] font-semibold text-white">@{nickname || "alex_02"}</p><p className="truncate text-[13px] text-slate-300">{fullName || "Your name here"}</p><p className="font-mono text-[11px] text-slate-500">{programme} · {level}</p></div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[["base","1.00"],["final","1.00"],["Rep","0"]].map(([k,v])=> (
                <div key={k} className="rounded-xl border border-white/5 bg-white/[0.03] px-2 py-2 text-center"><p className="font-mono text-[10px] uppercase tracking-wide text-slate-500">{k}</p><p className="font-mono text-[13px] font-bold text-white">{v}</p></div>
              ))}
            </div>
            <p className="mt-3 font-mono text-[11px] leading-4 text-slate-500">Starter Rep is 0 — post gist that gets confirmed and your Rep creeps up. Your candy {candy} avatar stays with you.</p>
          </div>
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-4">
            <p className="text-[13px] font-semibold text-white">Why this matters for timetable</p>
            <p className="mt-1 text-[12.5px] leading-5 text-slate-400">Timetable asks “were you there?” and needs your handle to count it. No profile → vote button nudges you here first. With a handle, your Yes/No is stored as <span className="text-slate-200">physi_verifications</span> and pushes the post toward that <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[11px] font-bold text-white">✓ green</span> tick. Rep is your contribution score, not a coin.</p>
            <div className="mt-3 rounded-xl bg-amber-400/10 px-3 py-2"><p className="font-mono text-[11px] leading-4 text-amber-200/75">Your handle is stored only in this browser and in the pilot DB. No password yet — your Rep is just how your set recognises you today.</p></div>
          </div>
        </div>
      </div>
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-center font-mono text-[10.5px] leading-4 text-slate-600">PHYSI pilot · handle like <code className="rounded bg-white/10 px-1">alex_02</code> not “John Doe” or “Dream” · Rep is contribution, not money · advisory only</div>
      {toast && <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-full border border-white/10 bg-[#0f172a] px-4 py-2 text-[13px] font-medium text-white shadow-[0_8px_30px_rgba(0,0,0,0.5)]">{toast}</div>}
    </div>
  );
}
