"use client";
import { useEffect, useState, useCallback } from "react";

export type EchoInfo = {
  echo_strength: number; // 0..1
  participant_count: number;
  label: string;
};

export function useEcho(eventId?: string | null) {
  const [data, setData] = useState<EchoInfo | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchEcho = useCallback(async () => {
    if (!eventId) { setData(null); return; }
    setLoading(true);
    try {
      const r = await fetch(`/api/echo?event_id=${encodeURIComponent(eventId)}`, { cache: "no-store" });
      const j = await r.json();
      if (j.ok) setData({ echo_strength: Number(j.echo_strength ?? 0), participant_count: Number(j.participant_count ?? 0), label: String(j.label ?? "faint") });
      else setData({ echo_strength: 0, participant_count: 0, label: "faint" });
    } catch {
      setData({ echo_strength: 0, participant_count: 0, label: "faint" });
    } finally { setLoading(false); }
  }, [eventId]);

  useEffect(() => { fetchEcho(); }, [fetchEcho]);

  return { data, loading, refetch: fetchEcho };
}
