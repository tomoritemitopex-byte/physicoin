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

function canonicalTs(ts: string): string {
  try { return new Date(ts).toISOString(); } catch { return String(ts); }
}

/** Compute next ghost signature in chain — timestamp is canonical ISO (with millis+Z) */
export function ghostNextSig(prevSig: string | null | undefined, action: string, userId: string, timestamp?: string): string {
  const prev = prevSig && prevSig.length === 64 ? prevSig : GHOST_GENESIS;
  const ts = canonicalTs(timestamp ?? new Date().toISOString());
  const payload = `${prev}|${String(action)}|${String(userId)}|${ts}`;
  return sha256Hex(payload);
}

/** Verify chain link: does newSig == SHA256(prevSig|action|userId|ts)? — ts is canonical ISO */
export function verifyGhostLink(prevSig: string | null | undefined, action: string, userId: string, timestamp: string, newSig: string): boolean {
  const expected = ghostNextSig(prevSig, action, userId, canonicalTs(String(timestamp)));
  return expected === String(newSig).toLowerCase();
}

/** Verify full chain (array of {prev_sig, new_sig, action, user_id, created_at})
 *  Backward compat: tries canonical ISO of created_at, plus legacy slice fallback for old rows.
 */
export function verifyGhostChain(chain: Array<{ prev_sig: string | null; new_sig: string; action: string; user_id: string; created_at: string }>): boolean {
  for (const link of chain) {
    const tsRaw = String((link as any).created_at ?? "");
    // primary: canonical ISO of created_at
    const tsCanon = (() => { try { return new Date(tsRaw).toISOString(); } catch { return tsRaw; }})();
    const userId = String((link as any).user_id ?? "");
    if (!userId) return false;
    if (verifyGhostLink(link.prev_sig, link.action, userId, tsCanon, link.new_sig)) continue;
    // fallback: raw string (for chains where created_at was inserted as exact ISO string)
    if (verifyGhostLink(link.prev_sig, link.action, userId, tsRaw, link.new_sig)) continue;
    // legacy fallback: slice(0,24) for pre-fix chains (always false, but keep for compat)
    if (verifyGhostLink(link.prev_sig, link.action, userId, tsRaw.slice(0, 24), link.new_sig)) continue;
    return false;
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

/**
 * Prepare ghost chain query promises — do NOT await sequentially.
 * Returns array of Neon query promises to be used inside sql.transaction((tx) => [...])
 * Caller must have already computed prev/newSig via ghostNextSig.
 * Timestamp is stored explicitly as created_at so verification matches.
 */
export function prepareGhostChainQueries(
  tx: any,
  userId: string,
  action: string,
  prev: string,
  newSig: string,
  timestamp?: string
): any[] {
  const ts = timestamp ? (()=>{ try{ return new Date(timestamp).toISOString(); } catch{ return String(timestamp);} })() : new Date().toISOString();
  // Store exact timestamp used for hashing as created_at so verifyGhostChain can match
  const updateQ = tx`UPDATE physi_users SET rep_ghost_sig=${newSig}, ghost_sig_updated_at=${ts}::timestamptz, updated_at=NOW() WHERE id=${userId}`;
  const insertQ = tx`INSERT INTO physi_ghost_chain (user_id, prev_sig, new_sig, action, created_at) VALUES (${userId}, ${prev}, ${newSig}, ${action}, ${ts}::timestamptz)`;
  return [updateQ, insertQ];
}

/** Build ghost chain sigs (pure, no DB) */
export function buildGhostChainSigs(
  prevSig: string | null | undefined,
  action: string,
  userId: string,
  timestamp?: string
): { prev: string; newSig: string; timestamp: string } {
  const ts = canonicalTs(timestamp ?? new Date().toISOString());
  const prev = prevSig && String(prevSig).length === 64 ? String(prevSig) : GHOST_GENESIS;
  const newSig = ghostNextSig(prev, action, userId, ts);
  return { prev, newSig, timestamp: ts };
}

/** Server-side helper: extend user's ghost chain in a transaction
 * Refactored: prepares query promises then returns them as array pattern.
 * For use outside sql.transaction (e.g. mining check-in), it will execute via
 * Promise.all on prepared queries. For use inside sql.transaction, use
 * prepareGhostChainQueries directly with pre-computed sigs.
 *
 * IMPORTANT: When used inside sql.transaction((tx) => [...]), do NOT await
 * appendGhostChain(tx, ...) — instead pre-compute sigs with buildGhostChainSigs
 * and spread prepareGhostChainQueries(tx, ...) into the returned array.
 * Neon HTTP driver requires: sql.transaction((tx) => [tx`...`, ...])
 * so query promises must be returned in the array, not awaited separately.
 */
export async function appendGhostChain(
  txOrSql: any,
  userId: string,
  action: string,
  opts?: { prevSig?: string | null; timestamp?: string }
): Promise<{ prevSig: string; newSig: string; timestamp: string; queries: any[] }> {
  const ts = canonicalTs(opts?.timestamp ?? new Date().toISOString());
  const isTransactionClient = typeof (txOrSql as any)?.transaction !== "function";
  let prevSig: string | null = opts?.prevSig !== undefined ? opts.prevSig : null;
  if (prevSig === null && !isTransactionClient) {
    try {
      const rows = await txOrSql`SELECT rep_ghost_sig FROM physi_users WHERE id=${userId} LIMIT 1`;
      prevSig = rows?.[0]?.rep_ghost_sig ?? null;
    } catch { prevSig = null; }
  }
  const { prev, newSig } = buildGhostChainSigs(prevSig, action, userId, ts);
  const queries = prepareGhostChainQueries(txOrSql, userId, action, prev, newSig, ts);
  // For standalone (non-transactional) callers like mining check-in, execute
  // here directly. Do not swallow errors — previous .catch(()=>null) hid failures
  // and left chain at genesis. For transactional callers, return queries for
  // spreading into sql.transaction array — don't double-execute inside batch.
  if (!isTransactionClient) {
    // sql (outside transaction) — execute now
    await Promise.all(queries);
  }
  // Always return queries so caller CAN spread into transaction array if needed
  return { prevSig: prev, newSig, timestamp: ts, queries };
}
