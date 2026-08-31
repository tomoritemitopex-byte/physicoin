"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { logError, getErrorMessage } from "@/lib/adapters/error";

type StoredProfile = {
  id: string;
  nickname: string;
  full_name: string;
  programme: string;
  level: string;
  authority_base: number | string;
  authority_final: number | string;
  mining_balance: number | string;
  created_at?: string;
};

type MiningLog = {
  id: string;
  user_id: string;
  base_reward: number | string;
  authority_multiplier: number | string;
  earned_amount: number | string;
  created_at: string;
};

const COOLDOWN_MS = 24 * 60 * 60 * 1000;
const BASE_REWARD = 1;
const LS_LAST = "physi_mining_last";

function fmtMs(ms: number) {
  if (ms <= 0) return "00:00:00";
  const s = Math.floor(ms / 1000);
  const h = String(Math.floor(s / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  return `${h}:${m}:${sec}`;
}

function streakFromLogs(logs: MiningLog[]): number {
  if (logs.length === 0) return 0;
  const sorted = [...logs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const dates = Array.from(new Set(sorted.map((l) => { const d=new Date(l.created_at); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; })));
  const present = new Set(dates);
  let streak = 0;
  const cur = new Date();
  for (let i = 0; i < 30; i++) {
    const key = `${cur.getFullYear()}-${cur.getMonth()}-${cur.getDate()}`;
    if (present.has(key)) streak++;
    else { if (streak===0) {} else break; }
    cur.setDate(cur.getDate() - 1);
  }
  return streak;
}

export default function MiningPage() {
  const [profile, setProfile] = useState<StoredProfile | null>(null);
  const [profileChecked, setProfileChecked] = useState(false);
  const [logs, setLogs] = useState<MiningLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);
  const [cooldownMs, setCooldownMs] = useState<number>(0);
  const [nextAt, setNextAt] = useState<Date | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [lastEarned, setLastEarned] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("physi_profile");
      if (raw) { const p=JSON.parse(raw) as StoredProfile; if(p?.id && p?.nickname) setProfile(p); }
    } catch {}
    setProfileChecked(true);
  }, []);
  useEffect(()=>{ if(!toast) return; const t=setTimeout(()=>setToast(null),2800); return()=>clearTimeout(t); },[toast]);

  const computeCooldown = useCallback((allLogs: MiningLog[]) => {
    let lastServerAt:number|null=null;
    if(allLogs.length>0){ const latest=[...allLogs].sort((a,b)=> new Date(b.created_at).getTime()-new Date(a.created_at).getTime())[0]; lastServerAt=new Date(latest.created_at).getTime(); }
    let lastLocalAt:number|null=null;
    try{ const v=localStorage.getItem(LS_LAST); if(v) lastLocalAt=new Date(v).getTime(); }catch{}
    const lastAt=Math.max(lastServerAt??0,lastLocalAt??0);
    if(!lastAt){ setCooldownMs(0); setNextAt(null); return 0; }
    const elapsed=Date.now()-lastAt; const remaining=COOLDOWN_MS-elapsed;
    if(remaining>0){ setCooldownMs(remaining); setNextAt(new Date(lastAt+COOLDOWN_MS)); return remaining; }
    setCooldownMs(0); setNextAt(null); return 0;
  },[]);

  const fetchMining = useCallback(async ()=>{
    if(!profile?.id){ setLoading(false); return; }
    setLoading(true); setErr(null);
    try{
      try{ const pr=await fetch(`/api/profile?id=${encodeURIComponent(profile.id)}`,{cache:"no-store"}); const pj=await pr.json(); if(pj?.ok && pj?.user){ const u=pj.user as StoredProfile; setProfile(prev=> prev ? {...prev,...u}:u); localStorage.setItem("physi_profile",JSON.stringify({...profile,...u})); }}catch{}
      const r=await fetch(`/api/mining?user_id=${encodeURIComponent(profile.id)}`,{cache:"no-store"}); const j=await r.json();
      if(!r.ok || j.ok===false) throw new Error(j.error || j.hint || "couldn't load check-in");
      const rows:MiningLog[]=j.logs ?? []; setLogs(rows); computeCooldown(rows);
      if(rows.length>0){ const latest=[...rows].sort((a,b)=> new Date(b.created_at).getTime()-new Date(a.created_at).getTime())[0]; setLastEarned(Number(latest.earned_amount)); }
    }catch(e:unknown){ logError("MINING_FETCH_FAILED",e,{page:"mining"}); setErr(getErrorMessage("MINING_FETCH_FAILED")); } finally{ setLoading(false); }
  },[profile?.id, computeCooldown]);

  useEffect(()=>{ if(profileChecked && profile?.id) fetchMining(); else if(profileChecked && !profile) setLoading(false); },[profileChecked, profile, fetchMining]);
  useEffect(()=>{
    if(cooldownMs<=0){ if(timerRef.current){ clearInterval(timerRef.current); timerRef.current=null; } return; }
    if(timerRef.current) clearInterval(timerRef.current);
    timerRef.current=setInterval(()=>{ setCooldownMs(prev=>{ if(prev<=1000){ if(timerRef.current) clearInterval(timerRef.current); setNextAt(null); return 0; } return prev-1000; }); },1000);
    return()=>{ if(timerRef.current) clearInterval(timerRef.current); };
  },[cooldownMs>0]);
  useEffect(()=>{ if(!profileChecked || !profile) return; computeCooldown(logs); },[profileChecked]);

  async function handleCheckIn(){
    if(!profile?.id) return;
    if(cooldownMs>0){ setToast(`come back in ${fmtMs(cooldownMs)} — 24h between taps`); return; }
    setCheckingIn(true); setErr(null);
    try{
      const r=await fetch("/api/mining",{ method:"POST", headers:{ "content-type":"application/json" }, body: JSON.stringify({ user_id: profile.id, base_reward: BASE_REWARD })});
      const j=await r.json().catch(()=>({}));
      if(!r.ok || j.ok===false) throw new Error(j.error || j.hint || "check-in failed");
      const earned=Number(j.earned ?? j.log?.earned_amount ?? BASE_REWARD * Number(profile.authority_final ?? 1));
      setLastEarned(earned); setToast(`+${earned.toFixed(0)} Rep — streak continues!`);
      try{ localStorage.setItem(LS_LAST,new Date().toISOString()); const nextBal=Number(profile.mining_balance ?? 0)+earned; const nextProfile={...profile, mining_balance: nextBal}; setProfile(nextProfile); localStorage.setItem("physi_profile",JSON.stringify(nextProfile)); }catch{}
      setCooldownMs(COOLDOWN_MS); setNextAt(new Date(Date.now()+COOLDOWN_MS)); await fetchMining();
    }catch(e:unknown){ logError("MINING_CHECKIN_FAILED",e,{page:"mining"}); const msg=getErrorMessage("MINING_CHECKIN_FAILED"); setErr(msg); setToast(msg); } finally{ setCheckingIn(false); }
  }

  const authorityFinal= profile ? Number(profile.authority_final ?? 1).toFixed(2) : "—";
  const authorityBase= profile ? Number(profile.authority_base ?? 1).toFixed(2) : "—";
  const rep= profile ? Number(profile.mining_balance ?? 0).toFixed(0) : "0";
  const streak= streakFromLogs(logs);
  const canCheckIn= profileChecked && !!profile && cooldownMs<=0 && !checkingIn && !loading;
  const earnedPreview= profile ? (BASE_REWARD * Number(profile.authority_final ?? 1)).toFixed(0) : BASE_REWARD.toFixed(0);
  // contribution Rep 1.2x is streak bonus applied on top — show as hint
  const contributionBoost= streak >= 3 ? "1.2x" : "1.0x";

  if(!profileChecked) return (<div className="space-y-4"><div className="h-28 animate-pulse rounded-[20px] border border-white/[0.06] bg-white/[0.03]" /><div className="h-64 animate-pulse rounded-[20px] border border-white/[0.06] bg-white/[0.03]" /></div>);

  if(!profile) return (
    <div className="space-y-4">
      <div>
        <p className="font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-slate-500">Rep · daily streak</p>
        <h1 className="mt-1 text-[22px] font-bold tracking-[-0.025em] text-white sm:text-[26px]">Daily Rep check-in</h1>
        <p className="mt-1 max-w-[620px] text-[13.5px] leading-5 text-slate-400">One tap a day keeps your streak alive. Rep is your contribution score — not money, not a coin. Streak keeps your contribution Rep 1.2x boost active.</p>
      </div>
      <div className="rounded-[20px] border border-amber-400/20 bg-amber-400/[0.06] p-6 sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[15px] font-semibold text-white">You need a handle first</p>
            <p className="mt-1 max-w-[520px] text-[13.5px] leading-5 text-amber-100/70">We track your streak against your handle — <code className="rounded bg-white/10 px-1 py-0.5 font-mono text-[11px]">physi_profile</code> in this browser plus <code className="rounded bg-white/10 px-1 py-0.5 font-mono text-[11px]">GET /api/mining?user_id=…</code> on the server. Create a handle in 20 seconds, then come back to keep streak.</p>
            <div className="mt-3 flex flex-wrap items-center gap-2 font-mono text-[11px] text-amber-200/60"><span className="rounded-full border border-amber-400/15 bg-amber-400/10 px-2.5 py-1">no handle → no Rep</span><span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-slate-400">Rep = contribution, not coin</span></div>
          </div>
          <a href="/app/profile" className="inline-flex shrink-0 items-center justify-center rounded-full bg-white px-6 py-3 text-[14px] font-semibold text-[#070a12] shadow-[0_4px_20px_rgba(255,255,255,0.12)] hover:bg-slate-100 transition">Create handle →</a>
        </div>
        <div className="mt-6 grid gap-2 sm:grid-cols-3">
          {[
            ["Daily Rep",`${BASE_REWARD} × your multiplier = Rep. One tap per 24h.`],
            ["Streak matters","3+ day streak → contribution Rep 1.2x stays active. Break it, boost resets."],
            ["Advisory only","Timetable is student gist. For exams, check your department board."],
          ].map(([t,d])=> (<div key={t} className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-3"><p className="text-[13px] font-semibold text-white">{t}</p><p className="mt-1 text-[12.5px] leading-4 text-slate-400">{d}</p></div>))}
        </div>
      </div>
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-center font-mono text-[11px] leading-4 text-slate-500">PHYSI pilot · Rep has no cash value · advisory feed only · your handle lives as <code className="rounded bg-white/10 px-1">physi_profile</code> · contribution Rep 1.2x with streak</div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-slate-500">Rep · daily streak</p>
          <h1 className="mt-1 text-[22px] font-bold tracking-[-0.025em] text-white sm:text-[26px]">Good morning, @{profile.nickname}</h1>
          <p className="mt-1 max-w-[640px] text-[13.5px] leading-5 text-slate-400">One honest tap per 24h. Your Rep grows with streak — contribution Rep 1.2x when you keep it alive. Current multiplier <span className="font-mono font-semibold text-white">{authorityFinal}</span> boosts your Rep for every Yes you tap elsewhere.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.03] px-3 py-1.5 font-mono text-[11px] text-slate-400"><span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]" />{streak>0 ? `${streak}-day streak` : "no streak yet"} · {contributionBoost} Rep</span>
          <button onClick={fetchMining} className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[13px] font-medium text-slate-200 hover:bg-white/[0.08] hover:text-white transition">↻ refresh</button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="relative overflow-hidden rounded-[20px] border border-white/[0.08] bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-5 backdrop-blur sm:p-6">
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-emerald-400/10 blur-[40px]" />
          <div className="pointer-events-none absolute -left-12 -bottom-12 h-48 w-48 rounded-full bg-indigo-500/10 blur-[50px]" />
          <div className="flex items-center justify-between">
            <h2 className="text-[14px] font-semibold text-white">Daily Rep check-in</h2>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-[11px] text-slate-400">24h cooldown</span>
          </div>
          <p className="mt-1 text-[12.5px] text-slate-400">Tap once — we check <span className="font-mono text-slate-300">GET /api/mining?user_id</span> and your browser&apos;s <code className="rounded bg-white/10 px-1 py-0.5 font-mono text-[11px]">physi_mining_last</code>. Streak keeps contribution Rep 1.2x active.</p>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {[
              ["Rep",rep,"contribution score"],
              ["streak",String(streak), streak===1 ? "day" : "days"],
              ["boost",`×${authorityFinal}`, contributionBoost !== "1.0x" ? `streak ${contributionBoost}` : `base ${authorityBase}`],
            ].map(([k,v,sub])=> (
              <div key={k} className="rounded-2xl border border-white/[0.07] bg-[#0b1020] px-3 py-3 text-center sm:px-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-slate-500">{k}</p>
                <p className="mt-1 font-mono text-[16px] font-bold tracking-tight text-white">{v}</p>
                <p className="font-mono text-[10px] leading-none text-slate-500">{sub}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
            <p className="font-mono text-[11px] leading-4 text-slate-400"><span className="font-semibold text-slate-200">How Rep works:</span> base {BASE_REWARD} × <span className="text-white">{authorityFinal}</span> = <span className="font-bold text-white">{earnedPreview} Rep</span> if you tap now. Keep a 3+ day streak and your contribution Rep 1.2x boost stays active — same weight that makes your Yes count on timetable.</p>
          </div>
          <div className="mt-5">
            {cooldownMs>0 ? (
              <div className="rounded-2xl border border-amber-400/15 bg-amber-400/[0.06] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div><p className="text-[13px] font-semibold text-white">You&apos;re good for today ✓</p><p className="mt-0.5 font-mono text-[11px] text-amber-100/70">{nextAt ? `Next Rep ${nextAt.toLocaleString("en-GB",{weekday:"short",hour:"2-digit",minute:"2-digit",day:"2-digit",month:"short"})}` : "Come back tomorrow"}</p></div>
                  <div className="rounded-xl bg-[#0b1020] px-3 py-2 text-center"><p className="font-mono text-[10px] uppercase tracking-wide text-slate-500">cooldown</p><p className="font-mono text-[18px] font-bold tracking-tight text-white">{fmtMs(cooldownMs)}</p></div>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${Math.max(4,100-(cooldownMs/COOLDOWN_MS)*100)}%` }} /></div>
                {lastEarned!==null && <p className="mt-2 font-mono text-[11px] text-slate-500">last earned <span className="text-white">+{lastEarned.toFixed(0)} Rep</span> · streak {streak} · contribution Rep 1.2x {contributionBoost==="1.2x" ? "active":"— keep streak 3+"}</p>}
              </div>
            ) : (
              <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.06] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div><p className="text-[14px] font-semibold text-white">Ready to earn Rep</p><p className="mt-0.5 text-[12.5px] text-emerald-100/70">One tap → +{earnedPreview} Rep. Streak {streak} → contribution Rep 1.2x {contributionBoost==="1.2x" ? "active" : "at 3 days"}.</p>{lastEarned!==null && <p className="mt-1 font-mono text-[11px] text-emerald-200/60">last: +{lastEarned.toFixed(0)} Rep</p>}</div>
                  <button onClick={handleCheckIn} disabled={!canCheckIn} className="inline-flex shrink-0 items-center justify-center rounded-full bg-white px-6 py-3 text-[14px] font-semibold text-[#070a12] shadow-[0_4px_20px_rgba(255,255,255,0.14)] hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition">{checkingIn ? "Checking…":`Check in +${earnedPreview} Rep →`}</button>
                </div>
                <p className="mt-3 font-mono text-[11px] text-emerald-200/60">24h starts after you tap — stored server-side + in <code className="rounded bg-white/10 px-1 py-0.5">physi_mining_last</code> · contribution Rep 1.2x with streak</p>
              </div>
            )}
            {err && <div className="mt-3 rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2.5 font-mono text-[12px] leading-4 text-red-200">{err}</div>}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 font-mono text-[11px] text-slate-500"><span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">id {String(profile.id).slice(0,8)}…</span><span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">{profile.programme} · {profile.level} · {streak}-day streak</span></div>
        </div>
        <div className="space-y-3">
          <div className="rounded-[20px] border border-white/[0.06] bg-white/[0.03] p-5">
            <h3 className="text-[14px] font-semibold text-white">What is Rep?</h3>
            <ul className="mt-3 space-y-2.5">
              {[
                ["Not money — ever","Rep is your contribution score. No cash value, no withdrawal. It just shows you show up."],
                ["Why streak?","3+ day streak keeps contribution Rep 1.2x active. Break it and boost resets — same idea as green tick needing real confirmations."],
                ["Advisory only","Timetable is student gist, not a circular. Check your department board for exams."],
              ].map(([t,d])=> (
                <li key={t} className="flex gap-3"><span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-bold text-[#070a12]">!</span><div><p className="text-[13px] font-medium leading-tight text-white">{t}</p><p className="text-[12.5px] leading-4 text-slate-400">{d}</p></div></li>
              ))}
            </ul>
            <div className="mt-4 rounded-xl border border-white/[0.06] bg-[#0b1020] px-3 py-3">
              <p className="font-mono text-[11px] leading-4 text-slate-400">Your streak is checked twice: <span className="text-slate-200">server</span> (<code className="rounded bg-white/10 px-1">GET /api/mining?user_id</code> looks at <code className="rounded bg-white/10 px-1">physi_mining_logs</code>) and <span className="text-slate-200">this browser</span> (<code className="rounded bg-white/10 px-1">localStorage</code>). Keep the same handle to keep streak and contribution Rep 1.2x.</p>
            </div>
          </div>
          <div className="rounded-[20px] border border-white/[0.06] bg-white/[0.03] p-5">
            <div className="flex items-center justify-between"><h3 className="text-[14px] font-semibold text-white">Recent Rep</h3><span className="font-mono text-[11px] text-slate-500">{logs.length} total · {streak} streak</span></div>
            {loading ? <div className="mt-3 space-y-2">{[0,1,2].map(i=> <div key={i} className="h-12 animate-pulse rounded-xl bg-white/[0.04]" />)}</div> : logs.length===0 ? (
              <div className="mt-3 rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-center"><p className="text-[13px] font-medium text-white">No Rep yet</p><p className="mt-1 text-[12.5px] text-slate-500">Tap check-in to earn your first {earnedPreview} Rep. Streak and contribution Rep 1.2x start there.</p></div>
            ) : (
              <ul className="mt-3 space-y-2">{logs.slice(0,5).map(l=> (
                <li key={l.id} className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-[#0b1020] px-3 py-2.5">
                  <div><p className="font-mono text-[13px] font-semibold text-white">+{Number(l.earned_amount).toFixed(0)} <span className="font-mono text-[10px] font-normal text-slate-500">Rep</span></p><p className="font-mono text-[11px] text-slate-500">{new Date(l.created_at).toLocaleString("en-GB",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})} · ×{Number(l.authority_multiplier).toFixed(2)} · contribution Rep 1.2x {streak>=3 ? "✓":"—"}</p></div>
                  <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 font-mono text-[11px] text-emerald-300">✓ {streak}d</span>
                </li>
              ))}</ul>
            )}
            {logs.length>5 && <p className="mt-2 text-center font-mono text-[11px] text-slate-600">showing 5 of {logs.length} · 24h cooldown enforced server-side</p>}
          </div>
        </div>
      </div>
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-center font-mono text-[10.5px] leading-4 text-slate-600">PHYSI pilot · Rep is contribution score, not cash · advisory feed only — confirm tests & exams with your department · streak keeps contribution Rep 1.2x · cooldown 24h</div>
      {toast && <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-full border border-white/10 bg-[#0f172a] px-4 py-2 text-[13px] font-medium text-white shadow-[0_8px_30px_rgba(0,0,0,0.5)]">{toast}</div>}
    </div>
  );
}
