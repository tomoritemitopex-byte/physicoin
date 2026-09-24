"use client";
import { useCallback, useEffect, useState } from "react";

/**
 * useZkAuthority — ZK-Proof Authority hook
 *
 * Inverted-audit P1 (K-P3): ZK attestation is not enforced (no real ZK
 * infrastructure). This hook now returns a disabled state instead of calling
 * the removed /api/zk endpoint.
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
      // ZK removed — return disabled state
      setData({ passed: false, proof: "", zk_attested: false, threshold: 0 });
      return null;
    } catch (e) { setError(e); return null; } finally { setLoading(false); }
  }, [userId, eventId]);

  useEffect(() => { if (userId && eventId) check(); }, [userId, eventId, check]);

  const verifyPost = useCallback(async (_uid: string, _eid: string) => {
    return { ok: false, code: "ZK_NOT_IMPLEMENTED", message: "ZK attestation is not enforced." };
  }, []);

  return { data, check, verifyPost, isLoading: loading, error };
}
