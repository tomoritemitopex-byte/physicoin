"use client";
import { useCallback, useEffect, useState } from "react";

/**
 * useZkAuthority — ZK-Proof Authority hook
 * Privacy-preserving threshold check: returns boolean + proof token, never raw authority.
 */
export function useZkAuthority(userId: string | null | undefined, eventId: string | null | undefined) {
  const [data, setData] = useState<{ passed: boolean; proof: string; zk_attested: boolean; threshold: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const check = useCallback(async () => {
    if (!userId || !eventId) return null;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/zk?user_id=${encodeURIComponent(String(userId))}&event_id=${encodeURIComponent(String(eventId))}`, { cache: "no-store" });
      const j = await r.json();
      if (j.ok) {
        const out = { passed: j.check?.passed ?? j.passed ?? false, proof: j.check?.proof ?? j.proof_token ?? "", zk_attested: !!j.zk_attested, threshold: j.threshold ?? j.check?.threshold ?? 0 };
        setData(out);
        return out;
      }
      return null;
    } catch (e) { setError(e); return null; } finally { setLoading(false); }
  }, [userId, eventId]);

  useEffect(() => { if (userId && eventId) check(); }, [userId, eventId, check]);

  const verifyPost = useCallback(async (uid: string, eid: string) => {
    const r = await fetch("/api/zk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: uid, event_id: eid }) });
    return r.json();
  }, []);

  return { data, check, verifyPost, isLoading: loading, error };
}
