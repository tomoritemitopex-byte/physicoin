"use client";
import { useState } from "react";

/**
 * ConsensusVoteButton — student-native voting control for truth coordination.
 * Single tap YES / NO, shows tally, animates on resolution.
 * Vocabulary: "Same place?" / "Same person?" / "Same course?" — not Bitcoin terms.
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

const TYPE_COPY: Record<string, { question: string; yes: string; no: string }> = {
  hall: { question: "Same hall?", yes: "Yes — same place", no: "No — different" },
  prof: { question: "Same lecturer?", yes: "Yes — same person", no: "No — different" },
  scope: { question: "Same course?", yes: "Yes — same", no: "No — keep separate" },
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
  const copy = TYPE_COPY[item.type] ?? TYPE_COPY.hall;
  const total = item.votes_yes + item.votes_no;
  const yesPct = item.yes_pct;

  async function doVote(vote: "yes" | "no") {
    if (!voterId) {
      // dispatch event so parent can prompt for profile — student-native flow
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
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => doVote("yes")}
          disabled={!!busy || !!disabled}
          className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${justVoted === "yes" ? "bg-emerald-500 text-white scale-105" : "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500 hover:text-white border border-emerald-500/20"} disabled:opacity-50`}
        >
          {busy === "yes" ? "…" : `Yes · ${item.votes_yes}`}
        </button>
        <button
          onClick={() => doVote("no")}
          disabled={!!busy || !!disabled}
          className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${justVoted === "no" ? "bg-white text-[#070a12] scale-105" : "bg-white/10 text-slate-200 hover:bg-white hover:text-[#070a12] border border-white/10"} disabled:opacity-50`}
        >
          {busy === "no" ? "…" : `No · ${item.votes_no}`}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-wide text-slate-500">{copy.question}</span>
        <span className="font-mono text-xs text-slate-400">
          {total}/8 · {yesPct}% {total >= 7 ? "· 1 more to quorum!" : ""}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full bg-emerald-400 transition-all duration-500" style={{ width: `${Math.min(100, Math.round((total / 8) * 100))}%` }} />
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => doVote("yes")}
          disabled={!!busy || !!disabled}
          className={`flex-1 rounded-full py-2 text-sm font-semibold transition ${justVoted === "yes" ? "bg-emerald-500 text-white animate-pulse" : "bg-emerald-500 text-white hover:bg-emerald-400"} disabled:opacity-50`}
        >
          {busy === "yes" ? "Saving…" : copy.yes}
        </button>
        <button
          onClick={() => doVote("no")}
          disabled={!!busy || !!disabled}
          className={`flex-1 rounded-full py-2 text-sm font-semibold transition border ${justVoted === "no" ? "bg-white text-[#070a12]" : "border-white/15 bg-white/5 text-white hover:bg-white hover:text-[#070a12]"} disabled:opacity-50`}
        >
          {busy === "no" ? "Saving…" : copy.no}
        </button>
      </div>
      <p className="text-center font-mono text-[11px] text-slate-500">
        {item.votes_yes} yes · {item.votes_no} no · {8 - total > 0 ? `${8 - total} more to decide` : "quorum — tipping…"}
      </p>
    </div>
  );
}
