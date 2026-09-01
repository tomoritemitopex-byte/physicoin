"use client";
export function VoteWeightBadge({ weight, label }: { weight?: number | null; label?: string | null }) {
  if (weight == null || label == null) return null;
  const w = Number(weight);
  let bg = "bg-white/[0.06] border-white/10 text-slate-400";
  if (w >= 1.5) bg = "bg-amber-500/15 border-amber-500/25 text-amber-300";
  else if (w >= 1.25) bg = "bg-emerald-500/15 border-emerald-500/25 text-emerald-300";
  else if (w >= 1.0) bg = "bg-white/[0.06] border-white/10 text-slate-300";
  else bg = "bg-slate-500/10 border-slate-500/15 text-slate-500";
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[11px] font-bold ${bg}`}>{label}</span>;
}
