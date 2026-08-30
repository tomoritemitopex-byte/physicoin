"use client";
type Props = { ap: number; rp?: number; threshold: number; compact?: boolean };
export default function QuorumBar({ ap, rp, threshold, compact }: Props) {
  const yes = Number(ap || 0);
  const need = threshold > 0 ? threshold : (rp && rp > 0 ? rp : 8);
  const pct = need > 0 ? Math.min(100, Math.round((yes / need) * 100)) : 0;
  const isAlmost = pct === 88 || pct === 87 || yes === need - 1;
  const done = pct >= 100;
  if (compact) {
    const barW = 84;
    const fillW = Math.max(0, Math.min(barW, Math.round(barW * pct / 100)));
    const barX = 0; // centered via parent g transform
    return (
      <>
        <text x={-barW/2} y={-10} textAnchor="start" fontSize={6.5} fontWeight={800} fill={isAlmost ? "#facc15" : "rgba(255,255,255,0.92)"} style={{fontFamily:"ui-monospace,monospace"}}>{yes}/{need} {pct}%{isAlmost ? " · 1 more!" : ""}</text>
        <rect x={-barW/2} y={-6} width={barW} height={6} rx={3} fill="rgba(0,0,0,0.55)" stroke="rgba(255,255,255,0.12)" />
        <rect x={-barW/2} y={-6} width={fillW} height={6} rx={3} fill={done ? "#10b981" : "#10b981"} opacity={0.95} />
      </>
    );
  }
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
      <div className="flex items-center justify-between font-mono text-[11px]">
        <span className={isAlmost ? "font-black text-amber-300" : "text-slate-400"}>{isAlmost ? "1 more!" : "Quorum"} · {yes}/{need} · {pct}%</span>
        <span className={`text-[10px] ${done ? "text-emerald-300" : "text-slate-500"}`}>{done ? "quorum reached" : `${Math.max(0, need - yes)} more to quorum`}</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full bg-emerald-400 transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      {isAlmost && <p className="mt-1 font-mono text-[11px] font-black text-amber-300">Almost — 1 more! 87.5%</p>}
    </div>
  );
}
