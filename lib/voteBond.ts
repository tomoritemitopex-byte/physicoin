/**
 * lib/voteBond.ts — stake-to-vote bond (Satoshi: truth costs)
 * stakeForVoteTx: SELECT ... FOR UPDATE inside tx, assert balance, deduct, INSERT/UPDATE bond held.
 * P0 fix: stake is now atomic with vote — no lost Rep, no double-spend, no free re-vote.
 */

export const VOTE_STAKE = 1.0;
export const MINING_BALANCE_CAP = 10000;

export type StakeResult = { ok: true; stake: number } | { ok: false; code: string; message: string };

/**
 * Transactional stake — must be called inside sql.transaction(async (tx) => ...)
 * Uses the tx connection so FOR UPDATE locks are held for the vote transaction.
 * - held bond: idempotent, no double-charge
 * - released/burned bond: re-charge (truth flip costs again)
 * - no bond: charge
 */
export async function stakeForVoteTx(tx: any, userId: string, eventId: string, cost = VOTE_STAKE): Promise<StakeResult> {
  // Check existing bond with row lock
  let existing: any[] = [];
  try {
    existing = (await tx`SELECT status, stake FROM physi_vote_bonds WHERE verifier_id=${userId} AND event_id=${eventId} LIMIT 1 FOR UPDATE` as any) || [];
  } catch {
    existing = [];
  }
  if (existing.length) {
    const st = String(existing[0].status);
    if (st === "held") return { ok: true, stake: Number(existing[0].stake) };
    // released/burned -> fall through to re-charge (free re-vote fix)
  }

  // Lock user row on tx
  let bal = 0;
  try {
    const rows: any[] = (await tx`SELECT mining_balance FROM physi_users WHERE id=${userId} FOR UPDATE` as any) || [];
    if (!rows.length) return { ok: false, code: "USER_NOT_FOUND", message: "User not found" };
    bal = Number(rows[0].mining_balance) || 0;
  } catch {
    return { ok: false, code: "DB_ERROR", message: "Failed to check balance" };
  }
  if (bal < cost) return { ok: false, code: "INSUFFICIENT_STAKE", message: `Need ${cost} Rep to vote (you have ${bal.toFixed(2)}). Earn Rep via daily check-in.` };

  // Deduct — inside tx, rolls back automatically if later vote insert fails
  try {
    await tx`UPDATE physi_users SET mining_balance = mining_balance - ${cost}, updated_at=NOW() WHERE id=${userId}`;
  } catch {
    return { ok: false, code: "DB_ERROR", message: "Failed to deduct stake" };
  }

  // Insert or re-activate bond to held
  try {
    if (existing.length) {
      await tx`UPDATE physi_vote_bonds SET stake=${cost}, status='held', created_at=NOW() WHERE verifier_id=${userId} AND event_id=${eventId}`;
    } else {
      await tx`INSERT INTO physi_vote_bonds (verifier_id, event_id, stake, status) VALUES (${userId}, ${eventId}, ${cost}, 'held') ON CONFLICT (verifier_id, event_id) DO UPDATE SET stake=${cost}, status='held'`;
    }
  } catch {
    // tx will rollback deduct on outer failure; no manual refund needed inside tx
    return { ok: false, code: "DB_ERROR", message: "Failed to hold bond" };
  }
  return { ok: true, stake: cost };
}

/**
 * Legacy helper — kept for non-transactional callers. Wraps stakeForVoteTx in its own transaction.
 * Prefer stakeForVoteTx inside the vote transaction (verify.ts).
 * @deprecated use stakeForVoteTx(tx, ...) inside sql.transaction
 */
export async function stakeForVote(sql: any, userId: string, eventId: string, cost = VOTE_STAKE): Promise<StakeResult> {
  // If sql already looks like a transaction client (no .transaction), delegate directly
  const isTx = typeof sql?.transaction !== "function";
  if (isTx) {
    return stakeForVoteTx(sql, userId, eventId, cost);
  }
  try {
    const result: StakeResult = await sql.transaction(async (tx: any) => {
      const r = await stakeForVoteTx(tx, userId, eventId, cost);
      if (!r.ok) {
        // throw with stakeResult attached so caller can return 402; transaction will rollback automatically
        const err: any = new Error(r.code);
        (err as any).stakeResult = r;
        throw err;
      }
      return r;
    });
    return result as StakeResult;
  } catch (e: any) {
    if (e?.stakeResult) return e.stakeResult as StakeResult;
    // Re-throw unexpected transaction failures as DB_ERROR
    if (String(e?.message) === "INSUFFICIENT_STAKE" || String(e?.message) === "USER_NOT_FOUND") {
      return { ok: false, code: String(e.message), message: e.message } as StakeResult;
    }
    // If stake check already returned INSUFFICIENT_STAKE via stakeResult, handled above
    // Otherwise surface DB error
    if (e?.message && typeof e.message === "string" && e.message.includes("INSUFFICIENT_STAKE")) {
      return { ok: false, code: "INSUFFICIENT_STAKE", message: e.message } as any;
    }
    return { ok: false, code: "DB_ERROR", message: "Failed to hold bond" };
  }
}

export async function resolveBonds(sql: any, eventId: string, majorityVote: "YES" | "NO"): Promise<void> {
  try {
    const rows: any[] = await sql`SELECT b.verifier_id, b.stake, v.vote FROM physi_vote_bonds b JOIN physi_verifications v ON v.verifier_id=b.verifier_id AND v.event_id=b.event_id WHERE b.event_id=${eventId} AND b.status='held'` as any;
    for (const r of rows) {
      const isWinner = String(r.vote) === majorityVote;
      if (isWinner) {
        try {
          await sql`UPDATE physi_vote_bonds SET status='released' WHERE verifier_id=${r.verifier_id} AND event_id=${eventId}`;
          await sql`UPDATE physi_users SET mining_balance = LEAST(${MINING_BALANCE_CAP}, mining_balance + ${Number(r.stake)}) WHERE id=${r.verifier_id}`;
        } catch {}
      } else {
        try { await sql`UPDATE physi_vote_bonds SET status='burned' WHERE verifier_id=${r.verifier_id} AND event_id=${eventId}`; } catch {}
      }
    }
    try { await sql`UPDATE physi_vote_bonds SET status='burned' WHERE event_id=${eventId} AND status='held'`; } catch {}
  } catch {}
}
