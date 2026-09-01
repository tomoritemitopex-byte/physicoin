"use client";
import { useEffect, useState } from "react";

type Day = { date: string; activity_count: number; is_streak_day: boolean; intensity: 0|1|2|3|4 };
type TodayClass = { id: string; title: string; venue: string; event_date: string; event_time: string; status: string; authority_points: number; required_points: number };

function dotColor(intensity: number): string {
  if (intensity===0) return "bg-white/[0.06] border-white/5";
  if (intensity===1) return "bg-emerald-900/40 border-emerald-800/50";
  if (intensity===2) return "bg-emerald-700/50 border-emerald-600/40";
  if (intensity===3) return "bg-emerald-500/70 border-emerald-400/30";
  return "bg-emerald-400 border-emerald-300";
}

function todayISO(): string {
  const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

export default function StreakHeatmap({ userId }: { userId: string }) {
  const [days, setDays] = useState<Day[]>([]);
  const [summary, setSummary] = useState<string>("");
  const [daysLeft, setDaysLeft] = useState<number>(1);
  const [streakLen, setStreakLen] = useState(0);
  const [loading, setLoading] = useState(true);
  const [todayClasses, setTodayClasses] = useState<TodayClass[]>([]);
  const [verifyBusy, setVerifyBusy] = useState<string | null>(null);
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);

  useEffect(()=>{
    if (!userId) { setLoading(false); return; }
    fetch(`/api/streak/heatmap?user_id=${encodeURIComponent(userId)}&days=30`,{cache:"no-store"})
      .then(r=>r.json()).then(j=>{
        if (j.ok) {
          setDays(j.heatmap||[]);
          setSummary(j.summary||"");
          setDaysLeft(j.daysLeft??1);
          setStreakLen(j.streakLen??0);
        }
      }).catch(()=>{}).finally(()=>setLoading(false));
  },[userId]);

  // fetch today's unverified classes for tap-to-verify
  useEffect(()=>{
    const iso=todayISO();
    fetch(`/api/timetable?status=pending&limit=20`,{cache:"no-store"}).then(r=>r.json()).then(j=>{
      const evs: any[] = j.events || j.data || [];
      const todays = evs.filter((e:any)=> String(e.event_date).slice(0,10)===iso).slice(0,4).map((e:any)=> ({
        id: String(e.id), title: String(e.title), venue: String(e.venue), event_date: String(e.event_date).slice(0,10), event_time: String(e.event_time).slice(0,5), status: String(e.status), authority_points: Number(e.authority_points||0), required_points: Number(e.required_points||3)
      }));
      setTodayClasses(todays);
    }).catch(()=>{});
  },[]);

  async function handleVerify(evId: string){
    if (!userId) { setVerifyMsg("Create a handle first"); return; }
    setVerifyBusy(evId); setVerifyMsg(null);
    try{
      const r=await fetch("/api/verify",{method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify({ verifier_id: userId, event_id: evId, vote:"YES"})});
      const j=await r.json().catch(()=>null);
      if (!r.ok || j?.ok===false) throw new Error(j?.error || j?.message || "verify failed");
      setVerifyMsg("Verified ✓ — streak bumped");
      setTodayClasses(prev=> prev.filter(c=> c.id!==evId));
      // refresh heatmap
      try{
        const hr=await fetch(`/api/streak/heatmap?user_id=${encodeURIComponent(userId)}&days=30`,{cache:"no-store"}).then(r=>r.json());
        if (hr.ok){ setDays(hr.heatmap||[]); setSummary(hr.summary||""); setDaysLeft(hr.daysLeft??1); setStreakLen(hr.streakLen??0); }
      }catch{}
      try{ const { autoBumpStreak } = await import("@/lib/streak"); autoBumpStreak("verify"); }catch{}
    }catch(e:any){ setVerifyMsg(e.message);} finally{ setVerifyBusy(null); setTimeout(()=>setVerifyMsg(null),2500); }
  }

  if (loading) return <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4"><div className="h-24 animate-pulse rounded-xl bg-white/[0.04]" /></div>;
  if (!days.length) return null;

  const fireText = daysLeft===0 ? "Streak broken — verify today to restart 🔥" : `${daysLeft} day${daysLeft===1?"":"s"} left to keep fire 🔥`;
  const isoToday = todayISO();
  // 30-day grid: 5 rows x 6 cols (5*6=30)
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Streak · 30 days</h3>
        <span className={`rounded-full px-2.5 py-1 font-mono text-xs font-medium ${daysLeft===0?"bg-red-500/15 text-red-300 border border-red-500/20":"bg-amber-500/15 text-amber-300 border border-amber-500/20"}`}>{fireText}</span>
      </div>
      <div className="mt-3 grid grid-cols-6 gap-1.5 sm:gap-2">
        {days.map(d=>{
          const isToday = d.date===isoToday;
          return (
          <div key={d.date} title={`${d.date}: ${d.activity_count} ${d.activity_count===1?"activity":"activities"}${isToday?" · today":""}`} className={`aspect-square rounded-lg border ${dotColor(d.intensity)} flex items-center justify-center relative ${isToday ? "ring-2 ring-amber-400/60 ring-offset-1 ring-offset-[#0b1020]" : ""}`}>
            <span className="font-mono text-[7px] text-white/30 sm:text-[8px]">{d.date.slice(8,10)}</span>
            {isToday && <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-amber-400 ring-2 ring-[#0b1020]" />}
          </div>
        )})}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <p className="font-mono text-xs text-slate-400">{summary}</p>
        {streakLen>0 && <span className="font-mono text-xs font-bold text-emerald-300">{streakLen}🔥 streak</span>}
      </div>
      <div className="mt-2 flex items-center gap-1.5 font-mono text-[10px] text-slate-500">
        <span>Less</span><span className="h-3 w-3 rounded border bg-white/[0.06] border-white/5" /><span className="h-3 w-3 rounded border bg-emerald-900/40 border-emerald-800/50" /><span className="h-3 w-3 rounded border bg-emerald-700/50" /><span className="h-3 w-3 rounded border bg-emerald-500/70" /><span className="h-3 w-3 rounded border bg-emerald-400" /><span>More</span>
      </div>
      {/* Today row — upcoming unverified classes with tap-to-verify */}
      {todayClasses.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-400/15 bg-amber-500/5 p-3">
          <p className="font-mono text-[11px] font-bold uppercase tracking-wide text-amber-300">Today · {todayClasses.length} upcoming · tap to verify</p>
          <div className="mt-2 space-y-1.5">
            {todayClasses.map(c=> (
              <button key={c.id} onClick={()=>handleVerify(c.id)} disabled={!!verifyBusy} className="flex w-full items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-left hover:bg-white hover:text-black disabled:opacity-50 transition">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-bold text-white group-hover:text-black">{c.title} <span className="font-mono text-[11px] font-medium text-white/60">· {c.venue}</span></span>
                  <span className="font-mono text-[11px] text-white/50">{c.event_time} · {c.authority_points}/{c.required_points} votes</span>
                </span>
                <span className={`shrink-0 rounded-full px-3 py-1 font-mono text-[11px] font-black ${verifyBusy===c.id ? "bg-white/10 text-white/60" : "bg-emerald-500 text-white"}`}>{verifyBusy===c.id ? "…" : "Verify ✓"}</span>
              </button>
            ))}
          </div>
          {verifyMsg && <p className="mt-2 rounded-lg bg-white px-3 py-1.5 font-mono text-[11px] font-bold text-black">{verifyMsg}</p>}
          <p className="mt-2 font-mono text-[10px] text-white/30">Tap a class you attended — one-tap verify boosts your streak + weight</p>
        </div>
      )}
      {todayClasses.length===0 && (
        <p className="mt-3 font-mono text-[11px] text-white/30">No unverified classes today — check back tomorrow or post one on the road</p>
      )}
    </div>
  );
}
