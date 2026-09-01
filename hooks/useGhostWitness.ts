"use client";
/**
 * useGhostWitness — Ghost Witness Protocol hook
 * Fetches SHA256 signature chain for a user, verify integrity.
 * Uses fetch directly (no tanstack dependency required).
 */
import { useCallback, useEffect, useState } from "react";

export function useGhostWitness(userId: string | null | undefined) {
  const [data, setData] = useState<{ chain: any[]; currentSig: string | null; chainValid: boolean | null; count: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const refetch = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/ghost-chain?user_id=${encodeURIComponent(String(userId))}&verify=1`, { cache: "no-store" });
      const j = await r.json();
      setData({ chain: j.chain ?? [], currentSig: j.user?.rep_ghost_sig ?? null, chainValid: j.chain_valid ?? null, count: j.count ?? 0 });
    } catch (e) { setError(e); } finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { if (userId) refetch(); }, [userId, refetch]);

  return {
    chain: data?.chain ?? [],
    currentSig: data?.currentSig ?? null,
    chainValid: data?.chainValid ?? null,
    count: data?.count ?? 0,
    isLoading: loading,
    refetch,
    error,
  };
}
