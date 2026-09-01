/**
 * lib/ghostWitness.ts — Ghost Witness Protocol (Satoshi Intuition #1)
 * SHA256 signature chain for reputation — zero officials, peer-to-peer.
 * Each action extends user's chain: sig_n = SHA256(prev_sig | action | userId | timestamp)
 * Stored in physi_users.rep_ghost_sig + physi_ghost_chain audit trail.
 * Pure functions, deterministic, verifiable by any peer.
 */
import { createHash } from "crypto";

export const GHOST_GENESIS = "0000000000000000000000000000000000000000000000000000000000000000";

/** Deterministic SHA256 hex digest */
export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** Compute next ghost signature in chain */
export function ghostNextSig(prevSig: string | null | undefined, action: string, userId: string, timestamp?: string): string {
  const prev = prevSig && prevSig.length === 64 ? prevSig : GHOST_GENESIS;
  const ts = timestamp ?? new Date().toISOString();
  const payload = `${prev}|${String(action)}|${String(userId)}|${ts}`;
  return sha256Hex(payload);
}

/** Verify chain link: does newSig == SHA256(prevSig|action|userId|ts)? */
export function verifyGhostLink(prevSig: string | null | undefined, action: string, userId: string, timestamp: string, newSig: string): boolean {
  const expected = ghostNextSig(prevSig, action, userId, timestamp);
  return expected === String(newSig).toLowerCase();
}

/** Verify full chain (array of {prev_sig, new_sig, action, user_id, created_at}) */
export function verifyGhostChain(chain: Array<{ prev_sig: string | null; new_sig: string; action: string; user_id: string; created_at: string }>): boolean {
  for (const link of chain) {
    if (!verifyGhostLink(link.prev_sig, link.action, link.user_id, String(link.created_at).slice(0, 24), link.new_sig)) return false;
  }
  return true;
}

/** Action tags used in chain */
export const GHOST_ACTIONS = {
  VERIFY_YES: "verify:yes",
  VERIFY_NO: "verify:no",
  VERIFY_CANCEL: "verify:cancel",
  MINING_CHECKIN: "mining:checkin",
  SCOPE_VOTE_YES: "scope:yes",
  SCOPE_VOTE_NO: "scope:no",
  PROFILE_CREATE: "profile:create",
} as const;

/** Server-side helper: extend user's ghost chain in a transaction */
export async function appendGhostChain(
  txOrSql: any,
  userId: string,
  action: string,
  // optional explicit prevSig (if caller already knows), else fetch from DB
  opts?: { prevSig?: string | null; timestamp?: string }
): Promise<{ prevSig: string; newSig: string; timestamp: string }> {
  const ts = opts?.timestamp ?? new Date().toISOString();
  let prevSig: string | null = opts?.prevSig !== undefined ? opts.prevSig : null;
  if (prevSig === null) {
    try {
      const rows = await txOrSql`SELECT rep_ghost_sig FROM physi_users WHERE id=${userId} LIMIT 1`;
      prevSig = rows?.[0]?.rep_ghost_sig ?? null;
    } catch { prevSig = null; }
  }
  const prev = prevSig && String(prevSig).length === 64 ? String(prevSig) : GHOST_GENESIS;
  const newSig = ghostNextSig(prev, action, userId, ts);

  // update users table
  try { await txOrSql`UPDATE physi_users SET rep_ghost_sig=${newSig}, updated_at=NOW() WHERE id=${userId}`; } catch {}

  // audit trail
  try {
    await txOrSql`INSERT INTO physi_ghost_chain (user_id, prev_sig, new_sig, action) VALUES (${userId}, ${prev}, ${newSig}, ${action})`;
  } catch {}
  return { prevSig: prev, newSig, timestamp: ts };
}
