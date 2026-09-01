"use client";
import { useEffect, useState } from "react";

type Day = { date: string; activity_count: number; is_streak_day: boolean; intensity: 0|1|2|3|4 };

function dotColor(intensity: number): string {
  if (intensity===0) return "bg-white/[0.06] border-white/5";
  if (intensity===1) return "bg-emerald-900/40 border-emerald-800/50";
  if (intensity===2) return "bg-emerald-700/50 border-emerald-600/40";
  if (intensity===3) return "bg-emerald-500/70 border-emerald-400/30";
  return "bg-emerald-400 border-emerald-300";
}

export default function StreakHeatmap({ userId }: { userId: string }) {
  const [days, setDays] = useState<Day[]>([]);
  const [summary, setSummary] = useState<string>("");
  const [daysLeft, setDaysLeft] = useState<number>(1);
  const [streakLen, setStreakLen] = useState(0);
  const [loading, setLoading] = useState(true);

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

  if (loading) return <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4"><div className="h-24 animate-pulse rounded-xl bg-white/[0.04]" /></div>;
  if (!days.length) return null;

  const fireText = daysLeft===0 ? "Streak broken — verify today to restart 🔥" : `${daysLeft} day${daysLeft===1?"":"s"} left to keep fire 🔥`;
  // 30-day grid: 5 rows x 6 cols (5*6=30)
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Streak · 30 days</h3>
        <span className={`rounded-full px-2.5 py-1 font-mono text-xs font-medium ${daysLeft===0?"bg-red-500/15 text-red-300 border border-red-500/20":"bg-amber-500/15 text-amber-300 border border-amber-500/20"}`}>{fireText}</span>
      </div>
      <div className="mt-3 grid grid-cols-6 gap-1.5 sm:gap-2">
        {days.map(d=>(
          <div key={d.date} title={`${d.date}: ${d.activity_count} ${d.activity_count===1?"activity":"activities"}`} className={`aspect-square rounded-lg border ${dotColor(d.intensity)} flex items-center justify-center`}>
            <span className="font-mono text-[7px] text-white/30 sm:text-[8px]">{d.date.slice(8,10)}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <p className="font-mono text-xs text-slate-400">{summary}</p>
        {streakLen>0 && <span className="font-mono text-xs font-bold text-emerald-300">{streakLen}🔥 streak</span>}
      </div>
      <div className="mt-2 flex items-center gap-1.5 font-mono text-[10px] text-slate-500">
        <span>Less</span><span className="h-3 w-3 rounded border bg-white/[0.06] border-white/5" /><span className="h-3 w-3 rounded border bg-emerald-900/40 border-emerald-800/50" /><span className="h-3 w-3 rounded border bg-emerald-700/50" /><span className="h-3 w-3 rounded border bg-emerald-500/70" /><span className="h-3 w-3 rounded border bg-emerald-400" /><span>More</span>
      </div>
    </div>
  );
}
