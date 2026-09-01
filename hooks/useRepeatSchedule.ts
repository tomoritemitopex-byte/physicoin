"use client";
import { useCallback, useState } from "react";

export type RepeatResult = { created: number; events: any[]; errors?: string[] };

export function useRepeatSchedule(userId?: string | null) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<RepeatResult | null>(null);

  const repeatLastWeek = useCallback(async (opts?: { scope_value?: string }) => {
    if (!userId) throw new Error("userId required");
    setLoading(true); setError(null);
    try {
      const r = await fetch("/api/events/repeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, scope_value: opts?.scope_value ?? null }),
      });
      const j = await r.json();
      if (!r.ok || j.ok === false) throw new Error(j?.message || j?.error || "repeat failed");
      setLastResult({ created: j.created ?? 0, events: j.events ?? [] });
      return j as RepeatResult & { ok: true };
    } catch (e:any) {
      setError(e.message);
      throw e;
    } finally { setLoading(false); }
  }, [userId]);

  return { repeatLastWeek, loading, error, lastResult };
}
