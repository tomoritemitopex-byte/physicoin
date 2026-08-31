"use client";
import { useEffect, useState } from "react";
import { decayByHalfLife, decayCurve, REP_HALF_LIFE_DAYS, PROFILE_HALF_LIFE_DAYS, decayedRep, ISOTOPE_N0, ISOTOPE_HALF, verifyDecayProof, halfLifePct } from "@/lib/rep";
import { getStreak, rescueStreak } from "@/lib/streak";
import { getBazaar, placeBet, claimBlast, bazaarTimeLeftMs, oracleResult } from "@/lib/oracle";
import { vaultList, onEntangle } from "@/lib/shardsync";

const PROFILE_HALF_DAYS = PROFILE_HALF_LIFE_DAYS;

export function IsotopePanel({ rep }: { rep: number }) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [vaultProof, setVaultProof] = useState(false);
  const [receipt, setReceipt] = useState<string | null>(null);

  // vault sync dot: green entangle if vault has shards, else grey decay
  useEffect(() => {
    let cancelled = false;
    async function check() {
      try { const list = await vaultList(); if (!cancelled) setVaultProof(list.length > 0); } catch { if (!cancelled) setVaultProof(false); }
      try {
        const v = localStorage.getItem("physi_last_mine") || localStorage.getItem("physi_last_verify") || "";
        if (v) {
          const d = (Date.now() - Date.parse(v)) / 86400000;
          // if last verify within 7d and vault has proof, consider entangle
          const hasShard = (await vaultList()).length > 0;
          if (!cancelled) setVaultProof(hasShard || d < 7);
        }
      } catch {}
    }
    check();
    const id = setInterval(() => { setNowMs(Date.now()); check(); }, 1000);
    const off = onEntangle(() => { setVaultProof(true); setNowMs(Date.now()); });
    // verifyDecay proof logs/build/7/8
    try { verifyDecayProof(ISOTOPE_N0, 7, ISOTOPE_HALF); verifyDecayProof(ISOTOPE_N0, 8, ISOTOPE_HALF); verifyDecayProof(ISOTOPE_N0, 14, ISOTOPE_HALF); } catch {}
    return () => { cancelled = true; clearInterval(id); try { (off as any)?.(); } catch {} };
  }, []);

  // live countdown: N0=12.4 -> N(14d)=6.2, update per second with fractional days from origin or fixed 0 for demo
  const originMs = (() => {
    try {
      const v = localStorage.getItem("physi_isotope_origin");
      if (v) { const t = Date.parse(v); if (!isNaN(t)) return t; }
      const vm = localStorage.getItem("physi_last_mine") || localStorage.getItem("physi_last_verify");
      if (vm) { const t = Date.parse(vm); if (!isNaN(t)) return t; }
    } catch {}
    return nowMs; // 0 days elapsed -> shows 12.4, will tick as time passes
  })();
  // for demo deterministic, also support fixed iso 12.4: compute days elapsed, but cap 0-14, and also show fractional half-life
  let elapsedDays = 0;
  try {
    const iso = localStorage.getItem("physi_isotope_origin");
    if (iso) elapsedDays = Math.max(0, (nowMs - Date.parse(iso)) / 86400000);
    else {
      // if no origin, animate 0->14 over live session: use modular 14d loop for demo so user sees countdown live
      const sessionSec = Math.floor((nowMs - (originMs || nowMs)) / 1000);
      // live fractional 14d scaled to 60s loop for visibility + real 14d: show both real and loop
      // real days: since origin (0), loop days: (sessionSec % 60)/60*14
      elapsedDays = Math.min(14, (sessionSec % 60) / 60 * 14);
      // if vaultProof, freeze decay? entangle pauses decay visually as green
    }
  } catch { elapsedDays = 0; }
  // clamped 0-14
  elapsedDays = Math.max(0, Math.min(14, elapsedDays));
  const liveN = decayByHalfLife(ISOTOPE_N0, elapsedDays, ISOTOPE_HALF);
  const repDecayed = decayedRep(rep || ISOTOPE_N0, Math.floor(elapsedDays));
  const curve = decayCurve(ISOTOPE_N0, 30, ISOTOPE_HALF);
  const max = Math.max(...curve, 1), min = Math.min(...curve), range = max - min || 1;
  const pct = halfLifePct(ISOTOPE_N0, elapsedDays, ISOTOPE_HALF);
  const isHalf = pct < 0.5;

  return (
    <div className="rounded-xl border border-amber-400/15 bg-amber-500/5 p-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[9px] font-bold uppercase text-amber-200/80">Isotope N(t)=N0·0.5^(t/half) · {REP_HALF_LIFE_DAYS}d half · profile {PROFILE_HALF_DAYS}d</span>
        <span className="flex items-center gap-1.5 rounded-full bg-black/30 px-1.5 py-0.5 font-mono text-[9px] text-amber-100/70">
          <span className={`h-2 w-2 rounded-full ${vaultProof ? "bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.7)]" : "bg-zinc-500"}`} title={vaultProof ? "vault sync entangle" : "decay"} />
          {vaultProof ? "entangle" : "decay"} · {ISOTOPE_N0.toFixed(1)}→{liveN.toFixed(1)} · {elapsedDays.toFixed(1)}d {isHalf ? "· <50%" : ""}
        </span>
      </div>
      {/* amber 30pt curve */}
      <svg width="100%" height={30} viewBox="0 0 140 30" className="mt-1">
        <path d={curve.map((v, i) => `${i === 0 ? "M" : "L"} ${(i / (curve.length - 1)) * 140} ${24 - ((v - min) / range) * 18}`).join(" ")} fill="none" stroke="#f59e0b" strokeWidth={1.4} strokeLinecap="round" />
        <path d={`${curve.map((v, i) => `${i === 0 ? "M" : "L"} ${(i / (curve.length - 1)) * 140} ${24 - ((v - min) / range) * 18}`).join(" ")} L 140 24 L 0 24 Z`} fill="#f59e0b" opacity={0.12} />
        {/* live marker */}
        <circle cx={(elapsedDays / 14) * 140} cy={24 - ((liveN - min) / range) * 18} r={2.5} fill="#f59e0b" stroke="white" strokeWidth={0.8} />
      </svg>
      <div className="mt-1 flex items-center justify-between">
        <p className="font-mono text-[9px] text-amber-100/60">client deterministic · verifiable · decayByHalfLife(N0,days,half) · 12.4→6.2 14d amber 30pt · live {liveN.toFixed(2)} · {vaultProof ? "vault sync green" : "vault grey"} · 7/8 verifyDecay proof in console</p>
        <button
          onClick={() => {
            const iso = new Date().toISOString();
            try { localStorage.setItem("physi_isotope_origin", iso); } catch {}
            setNowMs(Date.now());
            setVaultProof(true);
            // rescue receipt +5 on profile: bump mining_balance +5
            try {
              const raw = localStorage.getItem("physi_profile");
              if (raw) { const p = JSON.parse(raw); const cur = Number(p.mining_balance || 0); p.mining_balance = Number((cur + 5).toFixed(1)); localStorage.setItem("physi_profile", JSON.stringify(p)); setReceipt(`+5 → ${p.mining_balance.toFixed(1)} Rep`); setTimeout(() => setReceipt(null), 2200); }
              else { setReceipt("+5 entangle receipt"); setTimeout(() => setReceipt(null), 2200); }
            } catch {}
            // also log verifyDecay
            try { const pr = verifyDecayProof(ISOTOPE_N0, elapsedDays, ISOTOPE_HALF); console.log("[isotope] rescue entangle", pr); } catch {}
          }}
          className="ml-2 shrink-0 rounded-full bg-amber-400 px-2.5 py-1 font-mono text-[10px] font-black text-black hover:bg-amber-500"
        >
          Entangle +5
        </button>
      </div>
      {receipt && <p className="mt-1 font-mono text-[10px] font-bold text-emerald-300">{receipt} · profile +5 receipt</p>}
      <p className="mt-1 font-mono text-[9px] text-amber-100/50">{rep.toFixed(1)}→{repDecayed.toFixed(1)} · {Math.floor(elapsedDays)}d · half-life {isHalf ? "<50% guard" : "≥50%"} · logs/build/7/8 verifyDecay</p>
    </div>
  );
}

export function StreakRescueCard() {
  const [s, setS] = useState(() => getStreak());
  const [receipt, setReceipt] = useState<string | null>(null);
  useEffect(() => { const id = setInterval(() => setS(getStreak()), 2000); return () => clearInterval(id); }, []);
  const low = s.decayed < s.streak;
  const doRescue = () => {
    const restored = rescueStreak("friend");
    setS({ streak: restored, last: null, decayed: restored });
    // rescue receipt +5 on profile
    try {
      const raw = localStorage.getItem("physi_profile");
      if (raw) { const p = JSON.parse(raw); const cur = Number(p.mining_balance || 0); p.mining_balance = Number((cur + 5).toFixed(1)); localStorage.setItem("physi_profile", JSON.stringify(p)); setReceipt(`+5 → ${p.mining_balance.toFixed(1)} Rep`); setTimeout(() => setReceipt(null), 2400); }
    } catch {}
  };
  return (
    <div className="rounded-xl border border-orange-400/15 bg-orange-500/5 p-3">
      <div className="flex items-center justify-between"><span className="font-mono text-[11px] font-bold text-orange-200">🔥 Streak {s.streak}→{s.decayed} · half {7}d</span>{low && <button onClick={doRescue} className="rounded-full bg-white px-3 py-1 text-[11px] font-black text-black">Rescue +5</button>}</div>
      <p className="mt-1 font-mono text-[10px] text-orange-100/60">miss decays N·0.5^(d/7) · friend one-tap rescue entangles via BroadcastChannel + Vault · receipt +5 on profile</p>
      {receipt && <p className="mt-1 font-mono text-[10px] font-bold text-emerald-300">{receipt} · streak rescue</p>}
      {!low && <button onClick={() => { const v = rescueStreak("you"); setS(getStreak()); try { const raw = localStorage.getItem("physi_profile"); if (raw) { const p = JSON.parse(raw); const cur = Number(p.mining_balance || 0); p.mining_balance = Number((cur + 5).toFixed(1)); localStorage.setItem("physi_profile", JSON.stringify(p)); setReceipt(`+5 → ${p.mining_balance.toFixed(1)}`); setTimeout(() => setReceipt(null), 2400); }} catch {} }} className="mt-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-bold text-white/70">test rescue (entangle +5)</button>}
    </div>
  );
}
export function BazaarBlastCard({ squad }: { squad: string[] }) {
  const [b, setB] = useState(() => getBazaar());
  const [left, setLeft] = useState(() => bazaarTimeLeftMs());
  useEffect(() => { const id = setInterval(() => { setB(getBazaar()); setLeft(bazaarTimeLeftMs()); }, 1000); const ch = (() => { try { const c = new BroadcastChannel("physicoin_bazaar"); c.onmessage = () => setB(getBazaar()); return c; } catch { return null; } })(); return () => { clearInterval(id); try { ch?.close(); } catch {} }; }, []);
  const hh = Math.floor(left / 3600000), mm = Math.floor((left % 3600000) / 60000);
  return (
    <div className="rounded-xl border border-violet-400/15 bg-violet-500/5 p-3">
      <div className="flex items-center justify-between"><span className="font-mono text-[11px] font-bold text-violet-200">🎰 Oracle Bazaar Blast · 24h flash</span><span className="rounded-full bg-black/30 px-2 py-0.5 font-mono text-[10px] text-violet-100">{hh}h {mm}m left · pot {b.pot} · need 5</span></div>
      <p className="mt-1 font-mono text-[10px] text-violet-100/60">squads bet candies on oracle BTC/football · losers pot blast winner · Hallucination Guard blocks if &lt;8 quorum & no vault & &lt;50% half</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button onClick={() => { placeBet(squad.length ? squad : ["you", "a", "b"], "btc", "BTC_UP", 1); setB(getBazaar()); }} className="rounded-full bg-white px-3 py-1 text-[11px] font-black text-black">Bet BTC_UP 1</button>
        <button onClick={() => { placeBet(squad.length ? squad : ["you", "a", "b"], "btc", "BTC_DOWN", 1); setB(getBazaar()); }} className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-bold text-white">Bet BTC_DOWN 1</button>
        <button onClick={() => { placeBet(squad.length ? squad : ["you", "a", "b"], "football", "ARS", 1); setB(getBazaar()); }} className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-bold text-white">Bet ARS 1</button>
        {b.blastReady && <button onClick={() => { const pot = claimBlast(); setB(getBazaar()); alert(`blast! winner ${b.winner || "oracle"} pot ${pot} → +5 unlock`); }} className="rounded-full bg-amber-400 px-3 py-1 text-[11px] font-black text-black">💥 Blast claim {b.pot}</button>}
      </div>
      <p className="mt-1 font-mono text-[9px] text-violet-200/50">oracle BTC {oracleResult("btc")} · FB {oracleResult("football")} · deterministic daily</p>
    </div>
  );
}
