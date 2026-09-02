"use client";
import { useEffect, useState } from "react";
import StreakHeatmap from "@/components/road/StreakHeatmap";
import { VoteWeightBadge } from "@/components/VoteWeightBadge";
import { Wallet, Coins, TrendingUp, Lock } from "lucide-react";

type StoredProfile = {
  id: string; nickname: string; full_name: string; programme: string; level: string;
  statuses: string[]; authority_base: number | string; authority_final: number | string;
  mining_balance: number | string; created_at?: string;
};
const PROGRAMMES = ["Physiology","Anatomy","Biochemistry","Medicine & Surgery","Nursing","Pharmacy","Medical Lab","Other"];
const LEVELS = ["100L","200L","300L","400L","500L","600L"];
const LEVEL_NAMES: Record<number,string> = {1:"Explorer",2:"Scout",3:"Guide",4:"Sage",5:"Legend"};
function getLevelInfo(rep:number){
  const r=Number(rep)||0;
  if(r>=60) return { lvl:5, name:LEVEL_NAMES[5], pct:100, next:null as number|null };
  if(r>=30) return { lvl:4, name:LEVEL_NAMES[4], pct:Math.round((r-30)/30*100), next:60 };
  if(r>=15) return { lvl:3, name:LEVEL_NAMES[3], pct:Math.round((r-15)/15*100), next:30 };
  if(r>=5) return { lvl:2, name:LEVEL_NAMES[2], pct:Math.round((r-5)/10*100), next:15 };
  return { lvl:1, name:LEVEL_NAMES[1], pct:Math.round(r/5*100), next:5 };
}
function handleHint(h:string){
  if(!h) return "like alex_02 — lowercase, _ + number";
  if(h.length<3) return "too short";
  if(/[A-Z]/.test(h)) return "lowercase only";
  if(!/^[a-z0-9_]+$/.test(h)) return "only a-z, 0-9, _";
  if(!h.includes("_")) return "add _ like alex_02";
  if(!/[0-9]/.test(h)) return "add a number";
  return "looks good ✓";
}

export default function ProfilePage(){
  const [profile,setProfile]=useState<StoredProfile|null>(null);
  const [checking,setChecking]=useState(true);
  const [nickname,setNickname]=useState("");
  const [fullName,setFullName]=useState("");
  const [programme,setProgramme]=useState(PROGRAMMES[0]);
  const [level,setLevel]=useState(LEVELS[0]);
  const [busy,setBusy]=useState(false);
  const [err,setErr]=useState<string|null>(null);
  const [toast,setToast]=useState<string|null>(null);
  const [toastKind,setToastKind]=useState<"earn"|"spend"|"info">("info");
  const [voteWeight, setVoteWeight] = useState<number|null>(null);
  const [voteWeightLabel, setVoteWeightLabel] = useState<string|null>(null);

  useEffect(()=>{
    try{ const raw=localStorage.getItem("physi_profile"); if(raw){ const p=JSON.parse(raw); if(p?.id) setProfile(p); }}catch{}
    setChecking(false);
  },[]);
  useEffect(()=>{ if(!toast) return; const t=setTimeout(()=>setToast(null),3200); return()=>clearTimeout(t); },[toast]);
  // listen for earn/spend events from mining / verify / notes
  useEffect(()=>{
    const onEarn=(e:any)=>{ const msg=String(e.detail||""); setToastKind("earn"); setToast(msg); try{ const raw=localStorage.getItem("physi_profile"); if(raw) setProfile(JSON.parse(raw)); }catch{} };
    const onSpend=(e:any)=>{ const msg=String(e.detail||""); setToastKind("spend"); setToast(msg); try{ const raw=localStorage.getItem("physi_profile"); if(raw) setProfile(JSON.parse(raw)); }catch{} };
    window.addEventListener("physi-earn",onEarn as any);
    window.addEventListener("physi-spend",onSpend as any);
    const onStorage=(e:StorageEvent)=>{ if(e.key==="physi_profile") try{ const raw=localStorage.getItem("physi_profile"); if(raw) setProfile(JSON.parse(raw)); }catch{} };
    window.addEventListener("storage",onStorage);
    // also poll visible
    const iv=setInterval(()=>{ try{ const raw=localStorage.getItem("physi_profile"); if(raw){ const p=JSON.parse(raw); if(String(p.mining_balance)!==String(profile?.mining_balance)) setProfile(p); }}catch{} },2000);
    return()=>{ window.removeEventListener("physi-earn",onEarn as any); window.removeEventListener("physi-spend",onSpend as any); window.removeEventListener("storage",onStorage); clearInterval(iv); };
  },[profile?.mining_balance]);
  useEffect(()=>{
    if (!profile?.id) return;
    fetch(`/api/vote-weight?user_id=${encodeURIComponent(profile.id)}`,{cache:"no-store"}).then(r=>r.json()).then(j=>{
      if (j.ok) { setVoteWeight(Number(j.weight)); setVoteWeightLabel(j.label); }
    }).catch(()=>{});
  },[profile?.id]);

  async function create(e:React.FormEvent){
    e.preventDefault();
    const h=nickname.trim().toLowerCase().replace(/[^a-z0-9_]/g,"").slice(0,20);
    if(h.length<2){ setErr("Handle too short — like alex_02"); return; }
    setBusy(true); setErr(null);
    try{
      const r=await fetch("/api/profile",{ method:"POST", headers:{ "content-type":"application/json" }, body: JSON.stringify({ nickname:h, full_name: fullName.trim()||h, programme, level, statuses:[], authority_base:1, authority_final:1 }) });
      const j=await r.json(); if(!r.ok||j.ok===false) throw new Error(j.error||"couldn't create — try another handle");
      localStorage.setItem("physi_profile", JSON.stringify(j.user));
      setProfile(j.user); setToastKind("earn"); setToast(`Welcome @${h} — Wallet ready ✓`);
    }catch(e:any){ setErr(e.message); } finally{ setBusy(false); }
  }
  function logout(){ localStorage.removeItem("physi_profile"); setProfile(null); setToastKind("info"); setToast("Signed out"); }

  if(checking) return <div className="mx-auto max-w-[720px] px-4 py-10"><div className="h-40 animate-pulse rounded-2xl bg-white/[0.04]" /></div>;

  if(!profile) return (
    <div className="mx-auto max-w-[720px] px-4 py-8 sm:px-6">
      <p className="font-mono text-xs uppercase tracking-[0.12em] text-slate-500">Profile · 30s setup</p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">Pick a handle</h1>
      <p className="mt-1 text-sm leading-5 text-slate-400">Your handle is how coursemates trust your gist — like alex_02, not “John Doe”. One handle per browser.</p>

      <form onSubmit={create} className="mt-6 rounded-[20px] border border-white/[0.07] bg-white/[0.04] p-6 backdrop-blur">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5 sm:col-span-2">
            <span className="font-mono text-xs text-slate-500">Handle · unique on this campus</span>
            <input value={nickname} onChange={e=>setNickname(e.target.value)} placeholder="alex_02" className="w-full rounded-xl border border-white/10 bg-[#0b1020] px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-white/15 focus:outline-none" />
            <span className={`font-mono text-xs ${handleHint(nickname).includes("✓") ? "text-emerald-300" : "text-slate-500"}`}>{handleHint(nickname)}</span>
          </label>
          <label className="space-y-1.5"><span className="font-mono text-xs text-slate-500">Full name (optional)</span><input value={fullName} onChange={e=>setFullName(e.target.value)} placeholder="Alex Okoro" className="w-full rounded-xl border border-white/10 bg-[#0b1020] px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none" /></label>
          <label className="space-y-1.5"><span className="font-mono text-xs text-slate-500">Programme</span>
            <select value={programme} onChange={e=>setProgramme(e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#0b1020] px-3 py-2.5 text-sm text-white focus:outline-none">{PROGRAMMES.map(p=> <option key={p} value={p}>{p}</option>)}</select>
          </label>
          <label className="space-y-1.5"><span className="font-mono text-xs text-slate-500">Level</span>
            <select value={level} onChange={e=>setLevel(e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#0b1020] px-3 py-2.5 text-sm text-white focus:outline-none">{LEVELS.map(l=> <option key={l}>{l}</option>)}</select>
          </label>
          <div className="flex items-end"><p className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 font-mono text-xs text-slate-500">Your votes weigh more as you verify correctly. $PHY grows with streak.</p></div>
        </div>
        {err && <p className="mt-3 rounded-xl border border-red-500/15 bg-red-500/10 px-3 py-2 text-sm text-red-300">{err}</p>}
        <button disabled={busy} className="mt-5 w-full rounded-full bg-white py-3 text-sm font-semibold text-[#022c1e] hover:bg-slate-100 disabled:opacity-50 transition">{busy ? "Creating…" : "Create handle →"}</button>
        <p className="mt-3 text-center font-mono text-xs text-slate-500">Stored locally + on server · no password needed</p>
      </form>
      {toast && <div className={`fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-full border px-4 py-2 text-sm shadow-xl ${toastKind==="earn"?"bg-emerald-600 border-emerald-500 text-white":"bg-[#0c1222] border-white/10 text-white"}`}>{toast}</div>}
    </div>
  );

  const bal = Number(profile.mining_balance ?? 0);
  const lvl = getLevelInfo(bal);
  const cap = 10000;
  const capPct = Math.min(100, Math.round(bal/cap*100));
  return (
    <div className="mx-auto max-w-[720px] px-4 py-8 sm:px-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.12em] text-slate-500">Profile · @{profile.nickname}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">{profile.full_name || profile.nickname}</h1>
          <p className="mt-1 text-sm text-slate-400">{profile.programme} · {profile.level} · joined {profile.created_at ? new Date(profile.created_at).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}) : "recently"}</p>
        </div>
        <button onClick={logout} className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-300 hover:bg-white/[0.07]">Sign out</button>
      </div>

      <StreakHeatmap userId={profile.id} />

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.08] px-4 py-4 sm:col-span-1">
          <p className="flex items-center gap-1.5 font-mono text-xs uppercase tracking-wide text-emerald-300/80"><Wallet className="h-3.5 w-3.5" /> Wallet</p>
          <p className="mt-1 flex items-baseline gap-1.5 text-2xl font-black tracking-tight text-white">{bal.toFixed(0)} <span className="rounded-full bg-white px-2 py-0.5 font-mono text-xs font-black text-[#022c1e]">$PHY</span></p>
          <p className="font-mono text-xs text-emerald-200/60">spendable · cap {cap.toLocaleString()} $PHY</p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-emerald-400" style={{ width:`${capPct}%`}} /></div>
          <p className="mt-1 font-mono text-[11px] text-slate-500">{bal.toFixed(2)} / {cap.toLocaleString()} · {capPct}% mined</p>
          <p className="mt-2 inline-flex items-center gap-1 rounded-full border border-emerald-500/15 bg-emerald-500/10 px-2.5 py-1 font-mono text-[11px] text-emerald-300"><Lock className="h-3 w-3" /> 1 $PHY to vote · 1 $PHY to unlock</p>
        </div>
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-4">
          <p className="font-mono text-xs uppercase tracking-wide text-emerald-300/70">Level</p>
          <p className="mt-1 text-lg font-bold text-white">{lvl.lvl} · {lvl.name}</p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-emerald-400" style={{ width:`${lvl.pct}%`}} /></div>
          <p className="mt-1 font-mono text-xs text-slate-500">{lvl.next ? `${lvl.pct}% to ${lvl.next} $PHY` : "Max level"}</p>
          <p className="mt-2 font-mono text-[11px] text-slate-500">Level = Wallet balance</p>
        </div>
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-4">
          <p className="font-mono text-xs uppercase tracking-wide text-slate-500">Handle</p>
          <p className="mt-1 font-mono text-sm font-semibold text-white">@{profile.nickname}</p>
          <div className="mt-1 flex items-center gap-2">
            <p className="font-mono text-xs text-slate-500">×{Number(profile.authority_final||1).toFixed(2)} vote weight</p>
            {voteWeightLabel && <VoteWeightBadge weight={voteWeight} label={voteWeightLabel} />}
          </div>
          <p className="mt-2 font-mono text-[11px] text-slate-500">Weight boosts earn rate</p>
        </div>
      </div>

      {/* Earn / Spend ledger teaser */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.06] p-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-white"><TrendingUp className="h-4 w-4 text-emerald-400" /> Earn $PHY</p>
          <ul className="mt-2 space-y-1 font-mono text-xs leading-5 text-slate-400">
            <li>• Daily check-in → +{(1*Number(profile.authority_final||1)+0.5).toFixed(1)} $PHY <span className="text-emerald-300">(halves every 50k campus)</span></li>
            <li>• First gist → Earned +5 $PHY</li>
            <li>• Verify on road → Verified +1 $PHY (quorum bonus)</li>
          </ul>
        </div>
        <div className="rounded-2xl border border-amber-500/15 bg-amber-500/[0.06] p-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-white"><Coins className="h-4 w-4 text-amber-400" /> Spend $PHY</p>
          <ul className="mt-2 space-y-1 font-mono text-xs leading-5 text-slate-400">
            <li>• Stake 1 $PHY to vote — refunded if you’re with majority</li>
            <li>• Spend 1 $PHY to unlock notes / road node</li>
            <li>• Balance cap: 10,000 $PHY</li>
          </ul>
        </div>
      </div>

      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white"><Coins className="h-4 w-4 text-emerald-400" /> How $PHY works</h3>
        <ul className="mt-3 space-y-2 text-sm leading-5 text-slate-400">
          <li>• $PHY is campus currency — earned by contributing, spent to unlock & vote.</li>
          <li>• Verify correctly → $PHY up. Streak keeps your weight boosted.</li>
          <li>• Green ticks on the road need your Yes (1 $PHY stake) to count — wrong side burns stake.</li>
          <li>• Base reward 1 $PHY halves every 50,000 campus check-ins · supply cap 10,000.</li>
        </ul>
        <div className="mt-4 flex gap-2">
          <a href="/app/roadmap" className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-[#022c1e]">Go to road →</a>
          <a href="/app/mining" className="rounded-full border border-white/10 bg-white/[0.04] px-5 py-2 text-sm text-white">Daily check-in +{(1*Number(profile.authority_final||1)+0.5).toFixed(0)} $PHY</a>
        </div>
      </div>

      <p className="text-center font-mono text-xs text-slate-600">Wallet lives as physi_profile in this browser · <a href="/terms" className="underline decoration-white/15 hover:text-slate-400">Terms →</a></p>
      {toast && <div className={`fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-full border px-4 py-2 text-sm shadow-xl ${toastKind==="earn"?"bg-emerald-600 border-emerald-400 text-white":toastKind==="spend"?"bg-amber-600 border-amber-500 text-white":"bg-[#0c1222] border-white/10 text-white"}`}>{toast}</div>}
    </div>
  );
}
