"use client";
import { useEffect, useState, useCallback } from "react";

export function useVoteWeight(userId?: string | null) {
  const [weight, setWeight] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchWeight = useCallback(async () => {
    if (!userId) { setWeight(null); return; }
    setLoading(true);
    try {
      const r = await fetch(`/api/vote-weight?user_id=${encodeURIComponent(userId)}`, { cache: "no-store" });
      const j = await r.json();
      if (j.ok) setWeight(Number(j.weight ?? 1));
      else setWeight(1);
    } catch { setWeight(1); } finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { fetchWeight(); }, [fetchWeight]);

  const label = weight != null ? `${weight.toFixed(weight === 1 ? 0 : 1).replace(".0","")}×` : null;
  return { weight, label, loading, refetch: fetchWeight };
}
