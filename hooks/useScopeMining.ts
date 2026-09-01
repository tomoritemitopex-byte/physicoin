"use client";
import { useCallback, useEffect, useState } from "react";

/**
 * useScopeMining — Scope Value Mining hook
 * Shows rep_earned for a voter, triggers vote with rewards.
 */
export function useScopeMining(scopeA: string, scopeB: string, voterId?: string | null) {
  const [votes, setVotes] = useState<{ yes: number; no: number; rep_earned: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const fetchVotes = useCallback(async () => {
    if (!scopeA || !scopeB) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/scopes?a=${encodeURIComponent(scopeA)}&b=${encodeURIComponent(scopeB)}`, { cache: "no-store" });
      const j = await r.json();
      setVotes(j.votes ?? null);
    } catch (e) { setError(e); } finally { setLoading(false); }
  }, [scopeA, scopeB]);

  useEffect(() => { fetchVotes(); }, [fetchVotes]);

  const vote = useCallback(async (voteVal: "yes" | "no") => {
    if (!voterId) throw new Error("voterId required");
    const r = await fetch("/api/scopes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope_a: scopeA, scope_b: scopeB, vote: voteVal, voter_id: voterId }),
    });
    const j = await r.json();
    await fetchVotes();
    return j; // includes mining_rewards + ghost_sig
  }, [scopeA, scopeB, voterId, fetchVotes]);

  return { votes, vote, isLoading: loading, error, refetch: fetchVotes };
}
