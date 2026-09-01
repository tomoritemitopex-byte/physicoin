"use client";
import { useEffect, useState, useCallback } from "react";

export type CohortInfo = {
  count: number; // anonymous peers sharing pattern
  pattern_strength: number; // 0..1
};

export function useCohortInfo(userId?: string | null) {
  const [data, setData] = useState<CohortInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const fetchCohort = useCallback(async () => {
    const uid = userId ?? (() => { try { const raw = localStorage.getItem("physi_profile"); return raw ? JSON.parse(raw)?.id ?? null : null; } catch { return null; } })();
    if (!uid) { setData(null); return; }
    setLoading(true); setErr(null);
    try {
      const r = await fetch(`/api/cohort?user_id=${encodeURIComponent(uid)}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || j.ok === false) throw new Error(j.message || "couldn't load cohort");
      setData({ count: Number(j.count ?? 0), pattern_strength: Number(j.pattern_strength ?? 0) });
    } catch (e: any) {
      setErr(e.message || "couldn't load");
    } finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { fetchCohort(); }, [fetchCohort]);

  return { data, loading, err, refetch: fetchCohort };
}
