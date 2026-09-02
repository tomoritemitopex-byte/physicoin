"use client";
import { useState } from "react";

/**
 * ConsensusVoteButton — student-native pill vote (Fix 6)
 * Pills + ↔ + same circles (no sentences like "Same hall?")
 * Visual: [ alias pill ] ↔ [ canonical pill ]  ○○●●○○○○  then icon-only vote
 */
export type ConsensusVoteItem = {
  id: string;
  type: "hall" | "prof" | "scope";
  alias: string;
  canonical: string;
  votes_yes: number;
  votes_no: number;
  total: number;
  quorum_progress: number;
  yes_pct: number;
};

export default function ConsensusVoteButton({
  item,
  voterId,
  onVoted,
  compact,
  disabled,
}: {
  item: ConsensusVoteItem;
  voterId: string | null;
  onVoted?: () => void;
  compact?: boolean;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [justVoted, setJustVoted] = useState<"yes" | "no" | null>(null);
  const total = item.votes_yes + item.votes_no;
  // 8-circle weight visualization
  const filled = Math.min(8, Math.max(0, Math.ceil(item.votes_yes)));

  async function doVote(vote: "yes" | "no") {
    if (!voterId) {
      if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("physi-needs-profile", { detail: { item, vote } }));
      return;
    }
    if (busy || disabled) return;
    setBusy(vote);
    setJustVoted(null);
    try {
      let url = "";
      let body: any = {};
      if (item.type === "hall") {
        url = "/api/halls/alias";
        body = { alias_name: item.alias, canonical_name: item.canonical, voter_id: voterId, vote };
      } else if (item.type === "prof") {
        url = "/api/prof/alias";
        body = { alias_name: item.alias, canonical_name: item.canonical, voter_id: voterId, vote };
      } else {
        url = "/api/scopes";
        body = { scope_a: item.alias, scope_b: item.canonical, voter_id: voterId, vote };
      }
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.ok === false) throw new Error(j.message || j.error || "vote failed");
      setJustVoted(vote);
      setTimeout(() => setJustVoted(null), 1200);
      onVoted?.();
      if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("physi-consensus-voted", { detail: { id: item.id, vote } }));
    } catch (e: any) {
      if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("physi-toast", { detail: e.message || "vote failed" }));
    } finally {
      setBusy(null);
    }
  }

  if (compact) {
    return (
      <div className="flex flex-col gap-2">
        {/* pills + ↔ */}
        <div className="flex items-center gap-1.5">
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-white">{item.alias}</span>
          <span className="font-mono text-xs text-slate-500">↔</span>
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-slate-200">{item.canonical}</span>
        </div>
        {/* circles */}
        <div className="flex items-center gap-1" aria-label={`${filled} of 8 agreed`}>
          {Array.from({ length: 8 }).map((_, i) => (
            <span key={i} className={`h-2 w-2 rounded-full ${i < filled ? "bg-emerald-400" : "bg-white/15"} ${i < filled ? "shadow-[0_0_4px_rgba(52,211,153,0.4)]" : ""}`} />
          ))}
          <span className="ml-1 font-mono text-[11px] text-slate-500">{total}/8</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => doVote("yes")}
            disabled={!!busy || !!disabled}
            aria-label="Yes, same"
            className={`flex h-11 w-11 items-center justify-center rounded-full text-lg font-bold transition ${justVoted === "yes" ? "bg-emerald-500 text-white scale-105" : "bg-emerald-500 text-white hover:bg-emerald-400"} disabled:opacity-50`}
            style={{ minWidth: 44, minHeight: 44 }}
          >
            {busy === "yes" ? "…" : "✓"}
          </button>
          <button
            onClick={() => doVote("no")}
            disabled={!!busy || !!disabled}
            aria-label="No, different"
            className={`flex h-11 w-11 items-center justify-center rounded-full text-base font-bold transition border ${justVoted === "no" ? "bg-white text-[#022c1e]" : "border-white/15 bg-white/5 text-white hover:bg-white hover:text-[#022c1e]"} disabled:opacity-50`}
            style={{ minWidth: 44, minHeight: 44 }}
          >
            {busy === "no" ? "…" : "✕"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* pills + ↔ + circles — no sentences */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-[#022c1e]">{item.alias}</span>
        <span className="font-mono text-sm text-slate-400">↔</span>
        <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-sm font-medium text-white">{item.canonical}</span>
      </div>
      <div className="flex items-center gap-1.5" aria-label={`${filled} of 8 agreed`}>
        {Array.from({ length: 8 }).map((_, i) => (
          <span key={i} className={`h-2.5 w-2.5 rounded-full ${i < filled ? "bg-emerald-400" : "bg-white/15"} ${i < filled ? "shadow-[0_0_6px_rgba(52,211,153,0.5)]" : ""}`} />
        ))}
        <span className="ml-2 font-mono text-xs text-slate-400">{total}/8</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden>
        <div className="h-full bg-emerald-400 transition-all duration-500" style={{ width: `${Math.min(100, Math.round((total / 8) * 100))}%` }} />
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => doVote("yes")}
          disabled={!!busy || !!disabled}
          aria-label="Yes, same"
          className={`flex flex-1 items-center justify-center rounded-full bg-emerald-500 py-3 text-sm font-bold text-white hover:bg-emerald-400 transition ${justVoted === "yes" ? "animate-pulse" : ""} disabled:opacity-50`}
          style={{ minHeight: 44 }}
        >
          {busy === "yes" ? "…" : "✓ Yes"}
        </button>
        <button
          onClick={() => doVote("no")}
          disabled={!!busy || !!disabled}
          aria-label="No, different"
          className={`flex flex-1 items-center justify-center rounded-full border border-white/15 bg-white/5 py-3 text-sm font-bold text-white hover:bg-white hover:text-[#022c1e] transition ${justVoted === "no" ? "bg-white text-[#022c1e]" : ""} disabled:opacity-50`}
          style={{ minHeight: 44 }}
        >
          {busy === "no" ? "…" : "✕ No"}
        </button>
      </div>
    </div>
  );
}
