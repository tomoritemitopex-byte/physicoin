"use client";
import { useEcho } from "@/hooks/useEcho";

/**
 * EchoRing — anonymous presence echoes
 * Shows echo intensity ring + count only. No identity.
 * Subtle wave animation when echo > 0.6
 */
export function EchoRing({ eventId, compact }: { eventId: string; compact?: boolean }) {
  const { data } = useEcho(eventId);
  if (!data || data.participant_count === 0) return null;
  const strong = data.echo_strength > 0.6;
  const veryStrong = data.echo_strength > 0.8;
  const label = data.label;

  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] ${strong ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : "border-white/10 bg-white/[0.04] text-slate-400"} ${strong ? "animate-pulse" : ""}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${strong ? "bg-emerald-400" : "bg-white/30"} ${strong ? "animate-pulse" : ""}`} />
        {data.participant_count} echoes · {label}
      </span>
    );
  }

  return (
    <div className={`relative inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-xs ${strong ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : "border-white/10 bg-white/[0.04] text-slate-400"}`}>
      {/* wave rings when strong */}
      {strong && (
        <>
          <span className="absolute inset-0 rounded-full border border-emerald-400/20 animate-ping" style={{ animationDuration: "2s" }} />
          {veryStrong && <span className="absolute inset-0 rounded-full border border-emerald-400/10 animate-ping" style={{ animationDuration: "2.8s", animationDelay: "0.4s" }} />}
        </>
      )}
      <span className="relative flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${strong ? "bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.6)]" : "bg-white/40"} ${strong ? "animate-pulse" : ""}`} />
        {data.participant_count} anonymous echoes · {label}
      </span>
    </div>
  );
}

export function EchoIntensityBar({ eventId }: { eventId: string }) {
  const { data } = useEcho(eventId);
  if (!data || data.participant_count === 0) return null;
  const pct = Math.round(data.echo_strength * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-white/10">
        {data.echo_strength > 0.6 && <div className="absolute inset-0 animate-pulse bg-emerald-400/20" />}
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: pct > 70 ? "#10b981" : pct > 40 ? "#34d399" : "#a7f3d0" }} />
      </div>
      <span className="font-mono text-[10px] text-slate-500">{pct}% echo</span>
    </div>
  );
}
