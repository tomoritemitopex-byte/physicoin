/**
 * components/EarthPulse.tsx — Humanity heartbeat: aggregated stats across DATABASE_URLS shards
 * Fetches /api/stats (now shard-aggregated) + renders beating earth + totals.
 * Decluttered: single card, Fredoka, forest+purple, pulse rings.
 */
"use client";
import { useEffect, useState } from "react";

type Stats = {
  metrics?: { users: number; events: number; verifications: number; mining_logs: number; upcoming_events?: number; shards?: number };
  counts?: { physi_users: number; physi_events: number; physi_verifications: number };
  shards?: number;
  shardMetrics?: any[];
};

export default function EarthPulse() {
  const [s, setS] = useState<Stats | null>(null);
  const [beat, setBeat] = useState(true);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch("/api/stats", { cache: "no-store" });
        const j = await r.json().catch(() => null);
        if (!j || cancelled) return;
        setS(j);
      } catch {}
    }
    load();
    const iv = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);
  useEffect(() => {
    const iv = setInterval(() => setBeat(v => !v), 900);
    return () => clearInterval(iv);
  }, []);
  const users = s?.metrics?.users ?? s?.counts?.physi_users ?? 0;
  const events = s?.metrics?.events ?? s?.counts?.physi_events ?? 0;
  const verifs = s?.metrics?.verifications ?? s?.counts?.physi_verifications ?? 0;
  const shards = (s as any)?.shards ?? (s?.metrics as any)?.shards ?? 1;
  const totalHumanity = users + verifs; // humanity signal
  return (
    <div className="relative overflow-hidden rounded-[24px] border border-white/[0.08] bg-white/[0.04] backdrop-blur p-5 sm:p-6">
      {/* forest glow */}
      <div className="pointer-events-none absolute -top-20 left-1/2 h-48 w-[120%] -translate-x-1/2 rounded-[100%] opacity-20" style={{ background: "radial-gradient(ellipse at center, rgba(82,183,136,0.35), transparent 70%)" }} />
      <div className="pointer-events-none absolute -right-10 top-10 h-32 w-32 rounded-full opacity-15" style={{ background: "radial-gradient(ellipse at center, rgba(139,92,246,0.45), transparent 65%)" }} />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          {/* earth with pulse rings */}
          <div className="relative flex h-14 w-14 items-center justify-center">
            <span className="absolute inset-0 rounded-full border border-emerald-400/30" style={{ animation: "earthPulseRing 1.8s ease-out infinite" }} />
            <span className="absolute inset-0 rounded-full border border-violet-400/20" style={{ animation: "earthPulseRing 1.8s ease-out infinite 0.45s" }} />
            <span className={`flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-violet-500 text-lg shadow-[0_4px_16px_rgba(16,185,129,0.3)] ${beat ? "scale-[1.04]" : "scale-100"} transition-transform duration-300`} style={{ animation: "heartbeat 1.8s ease-in-out infinite" }}>
              🌍
            </span>
          </div>
          <div>
            <p className="font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-emerald-200/70">Earth pulse · humanity heartbeat</p>
            <h3 className="mt-1 text-[18px] font-bold text-white" style={{ fontFamily: "var(--font-fredoka), Fredoka, system-ui" }}>
              {users || events ? `${users} humans · ${events} gists · ${verifs} confirms` : "Humanity heartbeat — live"}
            </h3>
            <p className="mt-1 font-mono text-[11px] text-emerald-100/60">
              Aggregated across <span className="font-bold text-white">{shards}</span> shard{shards===1?"":"s"} · DATABASE_URLS fan-out · {totalHumanity ? `${totalHumanity} signals` : "waiting for first gist"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 font-mono text-[11px] text-white"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />{users} users</span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 font-mono text-[11px] text-white">▦ {events} events</span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/20 bg-violet-500/10 px-3 py-1.5 font-mono text-[11px] text-violet-100">✓ {verifs} verifies</span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1.5 font-mono text-[11px] text-emerald-100">pulse {beat ? "♥" : "♡"}</span>
        </div>
      </div>
      {/* tiny shard dots */}
      <div className="relative mt-4 flex items-center gap-1.5 font-mono text-[10px] text-white/40">
        <span>shards</span>
        {Array.from({ length: Math.min(shards, 6) }).map((_, i) => (
          <span key={i} className="h-2 w-2 rounded-full bg-emerald-400/70 shadow-[0_0_6px_rgba(52,211,153,0.6)]" style={{ opacity: 0.6 + i * 0.07 }} />
        ))}
        {shards > 6 && <span>+{shards - 6}</span>}
        <span className="ml-auto hidden sm:inline text-emerald-100/40">WAT · live · 30s poll · Fredoka</span>
      </div>
    </div>
  );
}
