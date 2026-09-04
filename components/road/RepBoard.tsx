"use client";
import { useEffect, useState } from "react";
import { anonHash, GHOST_DOT_BG } from "@/lib/fusion";
import { decayedRep, decayCurve, REP_HALF_LIFE_DAYS, PROFILE_HALF_LIFE_DAYS } from "@/lib/rep";

const SEASON_DAYS = 30;
const SEASON_KEY = "physicoin_season_start";
const SEASON_WINNER_KEY = "physicoin_season_winner";
function getSeasonStart(): number {
  try {
    const v = localStorage.getItem(SEASON_KEY);
    if (v) { const n = Number(v); if (isFinite(n) && n>0) return n; }
    const now = Date.now();
    localStorage.setItem(SEASON_KEY, String(now));
    return now;
  } catch { return Date.now(); }
}
function daysLeft(start: number): number {
  const elapsed = (Date.now() - start) / 86400000;
  const left = Math.ceil(SEASON_DAYS - elapsed);
  return left;
}
function seasonLabel(start: number): string {
  const left = daysLeft(start);
  if (left <= 0) return "Season ended — resetting";
  return `${left}d left · 30d season`;
}

type BoardEntry = { handle: string; rep: number; color: string; bg: string };
type LevelInfo = { lvl: number; name: string; progress: number; nextAt: number|null };

function MiniSparkline({ rep }: { rep: number }) {
  const [pts, setPts] = useState<number[] | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("physi_rep_history");
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr) && arr.length >= 2) {
          const nums = arr.map((n: any) => Number(n)).filter((n: number) => isFinite(n)).slice(-7);
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
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0" aria-hidden="true">
      <path d={filled} fill={col} opacity={0.14} />
      <path d={points} fill="none" stroke={col} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WinnerBadge({ handle }: { handle: string }) {
  return <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-400 to-yellow-300 px-2 py-0.5 text-[10px] font-black text-black ring-1 ring-amber-500">🏆 Winner {handle}</span>;
}
export default function RepBoard({ repBoard, youHandle, streak, myRep, levelInfo, onShare, repSheetOpen, setRepSheetOpen }: {
  repBoard: BoardEntry[];
  youHandle: string | null;
  streak: number;
  myRep: number;
  levelInfo: LevelInfo;
  onShare: () => void;
  repSheetOpen: boolean;
  setRepSheetOpen: (v: boolean | ((p:boolean)=>boolean)) => void;
}) {
  const [showHandles, setShowHandles] = useState(false);
  useEffect(()=>{ try{ const v=localStorage.getItem("physi_show_handles"); if(v==="1") setShowHandles(true); }catch{} },[]);
  useEffect(()=>{ try{ localStorage.setItem("physi_show_handles", showHandles?"1":"0"); }catch{} },[showHandles]);
  const dot = (h:string)=> anonHash(String(h||"anon"));
  const [seasonStart, setSeasonStart] = useState<number>(() => {
    try { const v = localStorage.getItem(SEASON_KEY); if (v) return Number(v)||Date.now(); } catch {}
    return Date.now();
  });
  const [seasonWinner, setSeasonWinner] = useState<string|null>(() => {
    try { return localStorage.getItem(SEASON_WINNER_KEY); } catch { return null; }
  });
  useEffect(() => {
    try {
      let s = Number(localStorage.getItem(SEASON_KEY) || "");
      if (!s || !isFinite(s) || s<=0) { s = Date.now(); localStorage.setItem(SEASON_KEY, String(s)); }
      setSeasonStart(s);
      const left = daysLeft(s);
      if (left <= 0) {
        // season reset: pick winner top rep
        const top = repBoard && repBoard.length ? repBoard[0]?.handle : null;
        if (top) { localStorage.setItem(SEASON_WINNER_KEY, String(top)); setSeasonWinner(String(top)); }
        const now = Date.now();
        localStorage.setItem(SEASON_KEY, String(now));
        setSeasonStart(now);
      } else {
        const w = localStorage.getItem(SEASON_WINNER_KEY);
        if (w) setSeasonWinner(w);
      }
    } catch {}
  }, [repBoard]);
  return (
    <>
      {/* Mobile collapsible */}
      <div className="xl:hidden">
        <div className="w-full rounded-2xl border border-white/10 bg-black/70 backdrop-blur-xl overflow-hidden">
          <button onClick={() => setRepSheetOpen((v: boolean)=>!v)} className="flex w-full items-center justify-between px-4 py-2.5">
            <span className="flex items-center gap-2 font-mono text-[11px] font-bold tracking-wide text-white"><span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" /> Top 5 Rep <span className="rounded-full bg-amber-400/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-200">{seasonLabel(seasonStart)}</span> {seasonWinner && <span className="rounded-full bg-gradient-to-r from-amber-400 to-yellow-300 px-1.5 py-0.5 text-[9px] font-black text-black">🏆 {seasonWinner}</span>} <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-slate-300">{repBoard.length}</span><span onClick={(e:any)=>{ e.stopPropagation(); onShare(); }} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black hover:scale-105 transition cursor-pointer ${levelInfo.lvl===5 ? "bg-gradient-to-r from-amber-400 to-yellow-300 text-black ring-1 ring-amber-500" : "bg-white/10 text-white"}`}>Lvl {levelInfo.lvl} {levelInfo.name}</span><span className="ml-1 inline-flex items-center gap-1 rounded-full bg-orange-500/15 px-2 py-0.5 text-[10px] text-orange-300\">🔥 {streak}</span></span>
            <span className="text-xs text-slate-400">{repSheetOpen ? "⌄" : "⌃"} {repSheetOpen ? "hide" : "show"}</span>
          </button>
          {repSheetOpen && (
            <div className="grid gap-1.5 px-3 pb-3">
              {repBoard.slice(0,5).map((u, i) => {
                const isYou = youHandle && String(u.handle).toLowerCase() === youHandle;
                const label = showHandles ? u.handle : `#${dot(u.handle)}`;
                const bg = showHandles ? u.color : GHOST_DOT_BG;
                return (
                  <div key={u.handle+"_m_"+i} className={`flex items-center gap-3 rounded-xl px-3 py-2 ${isYou ? "bg-white text-black border border-violet-400/30" : "bg-white/[0.06] text-white"}`}>
                    <span className="font-mono text-[11px] font-bold text-slate-400 w-4">{i+1}</span>
                    <span className="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-black text-white shrink-0 border" style={{ background: bg, borderColor: showHandles ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.35)", boxShadow: showHandles ? `0 0 0 4px ${u.color}22` : `0 0 0 4px ${GHOST_DOT_BG}33` }}>{showHandles ? String(u.handle).slice(0,2).toUpperCase() : dot(u.handle).slice(0,2)}</span>
                    <span className={`flex-1 font-mono text-[12px] font-bold truncate ${isYou ? "text-black" : "text-white"}`}>{label} {isYou ? "· you" : ""}</span>
                    <span className={`font-mono text-[11px] font-black ${isYou ? "text-black" : "text-emerald-300"}`}>{Number(u.rep).toFixed(1)}</span>
                  </div>
                );
              })}
              <div className="flex items-center gap-2 px-1"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10"><div className={`h-full ${levelInfo.lvl===5 ? "bg-gradient-to-r from-amber-400 to-yellow-300" : "bg-emerald-400"}`} style={{ width: `${levelInfo.progress*100}%` }} /></div><MiniSparkline rep={myRep} /><span className="font-mono text-[10px] text-slate-500">{myRep.toFixed(1)} Rep · {levelInfo.nextAt ? `${(levelInfo.nextAt - myRep).toFixed(1)} to L${levelInfo.lvl+1}` : "MAX L5 Legend"}</span>{levelInfo.lvl===5 && <span className="h-2 w-2 rounded-full bg-amber-400 ring-2 ring-amber-300" />}</div>
              {/* Living Isotope Rep — decay 14d half-life 0.5^(d/14) + 2%/day 0.98^d + 9d profile + 30pts amber SVG curve, Witness gold pauses, streak slash -2 revive +5 7d, bazaar spend */}
              {(() => {
                const daysInactive = (()=>{ try{ const raw=localStorage.getItem("physi_last_mine")||localStorage.getItem("physi_last_verify")||""; if(!raw) return 0; const d=Math.floor((Date.now()-new Date(raw).getTime())/86400000); return Math.max(0,isFinite(d)?d:0);}catch{return 0}})();
                const isWitness = (()=>{ try{ const p=JSON.parse(localStorage.getItem("physi_presence")||"null"); return !!p?.isWitness;}catch{return false}})();
                const eff = isWitness ? 0 : daysInactive;
                const decayed = decayedRep(myRep, eff, REP_HALF_LIFE_DAYS);
                const curve = decayCurve(myRep, 30, REP_HALF_LIFE_DAYS);
                const max=Math.max(...curve,1); const min=Math.min(...curve); const range=max-min||1;
                return (
                  <div className="mt-2 rounded-xl border border-amber-400/15 bg-amber-500/5 p-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[9px] font-bold uppercase text-amber-200/80">Isotope Rep · decay {REP_HALF_LIFE_DAYS}d · 2%/day</span>
                      <span className={`rounded-full px-1.5 py-0.5 font-mono text-[9px] ${isWitness ? "bg-amber-400 text-black font-black" : "bg-black/30 text-amber-100/70"}`}>{isWitness ? "Witness gold · paused" : `${myRep.toFixed(1)}→${decayed.toFixed(1)} · ${daysInactive}d`}</span>
                    </div>
                    <svg width="100%" height="24" viewBox="0 0 140 24" className="mt-1"><path d={curve.map((v,i)=> `${i===0?"M":"L"} ${(i/(curve.length-1))*140} ${20 - ((v-min)/range)*16}`).join(" ")} fill="none" stroke="#f59e0b" strokeWidth="1.4" strokeLinecap="round" /><path d={`${curve.map((v,i)=> `${i===0?"M":"L"} ${(i/(curve.length-1))*140} ${20 - ((v-min)/range)*16}`).join(" ")} L 140 20 L 0 20 Z`} fill="#f59e0b" opacity={0.12} /></svg>
                    <p className="mt-0.5 font-mono text-[9px] leading-3 text-amber-100/60">30pts amber · 0.5^(d/14) + 0.98^d · 9d profile · streak slash -2 revive +5 7d · bazaar spend</p>
                  </div>
                );
              })()}
              <p className="font-mono text-[10px] text-slate-500 px-1 flex items-center gap-2">Live poll 30s · ghosts · 7-day <MiniSparkline rep={myRep} /></p>
            </div>
          )}
        </div>
      </div>
      {/* Desktop rail */}
      <aside className="hidden xl:flex fixed right-4 top-[84px] z-20 w-[260px] flex-col gap-3">
        <div className="rounded-[20px] border border-white/10 bg-black/75 backdrop-blur-xl p-4 shadow-[0_8px_32px_rgba(0,0,0,0.6)]">
          <div className="flex items-center justify-between">
            <h3 className="font-mono text-[11px] font-black tracking-[0.12em] text-white">REP BOARD</h3>
            <span className="rounded-full bg-amber-400/15 px-2 py-0.5 font-mono text-[9px] font-bold text-amber-200">{seasonLabel(seasonStart)}</span>
            <button onClick={onShare} className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-black hover:scale-105 transition ${levelInfo.lvl===5 ? "bg-gradient-to-r from-amber-400 to-yellow-300 text-black ring-1 ring-amber-500" : "bg-white/10 text-slate-300"}`}>Lvl {levelInfo.lvl} · {levelInfo.name} · {myRep.toFixed(1)} Rep</button>
          </div>
          <div className="mt-2 flex items-center gap-2"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10"><div className={`h-full ${levelInfo.lvl===5 ? "bg-gradient-to-r from-amber-400 to-yellow-300" : "bg-emerald-400"}`} style={{ width: `${levelInfo.progress*100}%` }} /></div><MiniSparkline rep={myRep} /><span className="font-mono text-[9px] text-slate-500">{levelInfo.nextAt ? `${(levelInfo.nextAt - myRep).toFixed(1)} to L${levelInfo.lvl+1}` : "MAX"}</span>{levelInfo.lvl===5 && <span className="h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-amber-300 animate-pulse" />}</div>
          {seasonWinner && <p className="mt-1 font-mono text-[10px] font-bold text-amber-300 flex items-center gap-1">🏆 Season winner: {seasonWinner} · resets every 30d</p>}
          <p className="mt-1 font-mono text-[10px] text-slate-500 flex items-center gap-2">Top 5 · Season 30d · 7-day <MiniSparkline rep={myRep} /> · candy avatars</p>
          <div className="mt-3 grid gap-2">
            {repBoard.slice(0,5).map((u,i)=> {
              const isYou = youHandle && String(u.handle).toLowerCase() === youHandle;
              const label = showHandles ? u.handle : `#${dot(u.handle)}`;
              const bg = showHandles ? u.color : GHOST_DOT_BG;
              return (
                <div key={u.handle+"_d_"+i} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${isYou ? "bg-white border-violet-400/30 text-black" : "bg-white/[0.06] border-white/10 text-white"}`}>
                  <span className="font-mono text-[11px] font-bold w-4 text-center" style={{ color: isYou ? "#000" : "#94a3b8" }}>{i+1}</span>
                  <span className="flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-black text-white shrink-0 border border-white/20" style={{ background: bg, boxShadow: showHandles ? `0 0 0 6px ${u.color}22` : `0 0 0 6px ${GHOST_DOT_BG}33` }}>{showHandles ? String(u.handle).slice(0,2).toUpperCase() : dot(u.handle).slice(0,2)}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`font-mono text-[12px] font-bold leading-none truncate ${isYou ? "text-black" : "text-white"}`}>{label} {isYou ? "· you" : ""}</p>
                    <p className={`font-mono text-[10px] ${isYou ? "text-slate-600" : "text-slate-400"}`}>{showHandles ? (isYou ? "you" : "ghost") : "anon #hash"} · {i===0?"🏆":""} </p>
                  </div>
                  <span className={`font-mono text-[13px] font-black ${isYou ? "text-black" : "text-emerald-300"}`}>{Number(u.rep).toFixed(1)}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between font-mono text-[10px] text-slate-500">
            <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />poll 30s</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/15 px-2 py-1 text-orange-300 font-black">🔥 {streak} days</span>
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/60 backdrop-blur px-4 py-3">
          <p className="font-mono text-[11px] font-bold text-white">Invite → +1 Rep</p>
          <p className="font-mono text-[11px] text-slate-400 leading-3 mt-1">Share your road link with a course mate.</p>
          <button onClick={async ()=>{ const link = typeof window !== "undefined" ? window.location.origin+"/app/roadmap?invite="+encodeURIComponent(youHandle||"physicoin") : ""; try{ const anyNav:any=navigator as any; if(anyNav.share){ await anyNav.share({title:"Physicoin", text:"Join me on endless road", url:link}); return; } }catch{} try{ await navigator.clipboard.writeText(link); }catch{} }} className="mt-2 w-full rounded-full bg-white py-2 text-xs font-black text-black">Share link</button>
        </div>
      </aside>
    </>
  );
}
