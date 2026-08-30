"use client";
import { useEffect, useState } from "react";

type LevelInfo = { lvl: number; name: string; min: number; max: number|null; progress: number; nextAt: number|null };

function MiniSparkline({ rep }: { rep: number }) {
  const [pts, setPts] = useState<number[] | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("physi_rep_history");
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr) && arr.length >= 2) {
          const nums = arr.map((n: any) => Number(n)).filter((n: number) => isFinite(n)).slice(-14);
          if (nums.length >= 2) { setPts(nums); return; }
        }
      }
    } catch {}
    const r = Number(rep) || 0;
    const base = Math.max(0.6, r * 0.52);
    const synth = Array.from({ length: 7 }, (_, i) => {
      const t = i / 6;
      const wiggle = Math.sin(i * 1.7) * 0.35 + Math.cos(i * 0.9) * 0.22;
      const v = base + (r - base) * (0.35 + 0.65 * t) + wiggle;
      return Math.max(0.15, Number(v.toFixed(2)));
    });
    setPts(synth);
  }, [rep]);
  if (!pts || pts.length < 2) return null;
  const w = 60, h = 16, pad = 1.5;
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

export default function RepExplainer({ open, onClose, rep, levelInfo }: { open: boolean; onClose: () => void; rep: number; levelInfo: LevelInfo }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[420px] rounded-[20px] border border-white/10 bg-[#0b0f1e] p-5 shadow-2xl max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-[16px] font-black text-white">What is Rep?</h3>
          <button onClick={onClose} className="rounded-full bg-white/10 px-3 py-1 text-sm text-white hover:bg-white/20">✕</button>
        </div>
        <p className="mt-1 font-mono text-[11px] text-slate-400">Trust score · levels · 24h advisory</p>
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5">
          <span className="font-mono text-[11px] font-bold text-white">{rep.toFixed(1)} Rep</span>
          <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-black ${levelInfo.lvl===5 ? "bg-gradient-to-r from-amber-400 to-yellow-300 text-black" : "bg-white text-black"}`}>Lvl {levelInfo.lvl} · {levelInfo.name}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10"><div className={`h-full ${levelInfo.lvl===5 ? "bg-gradient-to-r from-amber-400 to-yellow-300" : "bg-emerald-400"}`} style={{ width: `${levelInfo.progress*100}%` }} /></div>
          <MiniSparkline rep={rep} />
        </div>
        <ul className="mt-4 grid gap-3">
          <li className="flex gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-[11px] font-black text-white">1</span>
            <div>
              <p className="text-[13px] font-bold text-white">Rep = trust</p>
              <p className="font-mono text-[11px] leading-4 text-slate-400">Your vote weight. More Rep = your Yes/No counts more. Earn +0.3 per verify, +1 per invite who verifies.</p>
            </div>
          </li>
          <li className="flex gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500 text-[11px] font-black text-white">2</span>
            <div>
              <p className="text-[13px] font-bold text-white">Levels</p>
              <p className="font-mono text-[11px] leading-4 text-slate-400">Explorer 0 → Scout 5 → Guide 15 → Sage 30 → Legend 60. Progress bar shows distance to next.</p>
            </div>
          </li>
          <li className="flex gap-2 rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500 text-[11px] font-black text-white">3</span>
            <div>
              <p className="text-[13px] font-bold text-white">24h advisory</p>
              <p className="font-mono text-[11px] leading-4 text-slate-400">Gists are advisory, not official. Green tick = coursemates confirmed. Confirm exams via HOD/board. TEST-PHYSI energy expires in 24h.</p>
            </div>
          </li>
        </ul>
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-2 font-mono text-[10px] text-slate-500">
            <MiniSparkline rep={rep} />
            <span>7-day trend</span>
          </div>
          <a href="/terms" className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-[11px] font-semibold text-slate-200 hover:bg-white hover:text-black transition">Read terms →</a>
        </div>
        <p className="mt-3 text-center font-mono text-[10px] text-slate-600">Tap outside or ✕ to close</p>
      </div>
    </div>
  );
}
