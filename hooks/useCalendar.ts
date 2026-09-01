"use client";
import { useCallback, useState } from "react";

export function useCalendar(userId?: string | null) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const downloadIcs = useCallback(async (programme?: string, level?: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (userId) params.set("user_id", String(userId));
      if (programme) params.set("programme", programme);
      if (level) params.set("level", level);
      const url = `/api/calendar/ics?${params.toString()}`;
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) {
        const j = await r.json().catch(() => null);
        throw new Error(j?.message || `Calendar fetch failed ${r.status}`);
      }
      const blob = await r.blob();
      const dlUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = dlUrl;
      // try to use content-disposition filename, fallback
      const cd = r.headers.get("content-disposition") || "";
      const m = cd.match(/filename=\"?([^\";]+)\"?/);
      a.download = m?.[1] || "physicoin-classes.ics";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        try { document.body.removeChild(a); URL.revokeObjectURL(dlUrl); } catch {}
      }, 800);
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const getIcsUrl = useCallback((programme?: string, level?: string) => {
    const params = new URLSearchParams();
    if (userId) params.set("user_id", String(userId));
    if (programme) params.set("programme", programme);
    if (level) params.set("level", level);
    return `/api/calendar/ics?${params.toString()}`;
  }, [userId]);

  return { downloadIcs, getIcsUrl, loading, error };
}
