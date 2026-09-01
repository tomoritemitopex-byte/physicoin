"use client";
import { useCallback, useState } from "react";

export type DupCheck = { duplicate: boolean; suggestion?: any; canonicalVenue?: string | null; autoTitle?: string | null };

export function useEventDedup() {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<DupCheck | null>(null);

  const check = useCallback(async (title: string, venue: string, event_date: string) => {
    if (!title || !venue || !event_date) { setResult(null); return null; }
    setChecking(true);
    try {
      const qs = new URLSearchParams({ title, venue, event_date });
      const r = await fetch(`/api/events/dedup?${qs.toString()}`, { cache: "no-store" });
      const j = await r.json();
      const dup = !!j.duplicate;
      const out: DupCheck = { duplicate: dup, suggestion: j.duplicate_suggestion ?? j.existing ?? null, canonicalVenue: j.canonicalVenue ?? null, autoTitle: j.autoTitle ?? null };
      setResult(out);
      return out;
    } catch { setResult({ duplicate: false }); return { duplicate: false }; }
    finally { setChecking(false); }
  }, []);

  const suggestTitle = useCallback(async (scope_value: string) => {
    if (!scope_value) return null;
    try {
      const r = await fetch(`/api/events/dedup?scope_value=${encodeURIComponent(scope_value)}`, { cache: "no-store" });
      const j = await r.json();
      return j.autoTitle ?? null;
    } catch { return null; }
  }, []);

  return { check, suggestTitle, checking, result };
}
