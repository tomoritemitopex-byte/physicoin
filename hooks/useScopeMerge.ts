"use client";
import { useCallback, useEffect, useState } from "react";

// Plain-fetch variant — no tanstack dependency (build-safe)
export function useScopeMerge(scope_a: string, scope_b: string) {
  const [resolution, setResolution] = useState<any>(null);
  const [votes, setVotes] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const fetchRes = useCallback(async () => {
    if (!scope_a || !scope_b) return;
    try {
      const r = await fetch(`/api/scopes?a=${encodeURIComponent(scope_a)}&b=${encodeURIComponent(scope_b)}`, { cache: "no-store" });
      const j = await r.json();
      setResolution(j.resolution ?? null);
      setVotes(j.votes ?? null);
    } catch (e) { setError(e); }
  }, [scope_a, scope_b]);

  useEffect(() => { fetchRes(); }, [fetchRes]);

  const vote = useCallback(async ({ vote, voter_id }: { vote: 'yes' | 'no'; voter_id: string }) => {
    setLoading(true);
    try {
      const r = await fetch('/api/scopes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope_a, scope_b, vote, voter_id }),
      });
      const j = await r.json();
      await fetchRes();
      return j;
    } finally { setLoading(false); }
  }, [scope_a, scope_b, fetchRes]);

  return {
    vote,
    isLoading: loading,
    resolution,
    votes,
    error,
    refetch: fetchRes,
  };
}
