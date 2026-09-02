/**
 * lib/voteBond.ts — stake-to-vote bond (Satoshi: truth costs)
 * stakeForVote: SELECT ... FOR UPDATE, assert balance, deduct, INSERT held bond.
 * release/burn on quorum resolution.
 */
import { getSql } from "./db";

export const VOTE_STAKE = 1.0;
export const MINING_BALANCE_CAP = 10000;

export async function stakeForVote(sql: any, userId: string, eventId: string, cost = VOTE_STAKE): Promise<{ ok: true; stake: number } | { ok: false; code: string; message: string }> {
  // idempotent: if bond already held for this verifier+event, don't double-charge
  try {
    const existing: any[] = await sql`SELECT status, stake FROM physi_vote_bonds WHERE verifier_id=${userId} AND event_id=${eventId} LIMIT 1` as any;
    if (existing.length) {
      const st = String(existing[0].status);
      if (st === "held") return { ok: true, stake: Number(existing[0].stake) };
      // if released/burned, already resolved — don't re-stake? Allow re-vote but don't charge again? For now return held
      return { ok: true, stake: Number(existing[0].stake) };
    }
  } catch {}
  // lock user row
  let bal = 0;
  try {
    const rows: any[] = await sql`SELECT mining_balance FROM physi_users WHERE id=${userId} FOR UPDATE` as any;
    if (!rows.length) return { ok: false, code: "USER_NOT_FOUND", message: "User not found" };
    bal = Number(rows[0].mining_balance) || 0;
  } catch (e) {
    return { ok: false, code: "DB_ERROR", message: "Failed to check balance" };
  }
  if (bal < cost) return { ok: false, code: "INSUFFICIENT_STAKE", message: `Need ${cost} Rep to vote (you have ${bal.toFixed(2)}). Earn Rep via daily check-in.` };
  // deduct and insert bond atomically inside caller's transaction if sql is tx, else do serially with FOR UPDATE already held?
  // Caller should have called this inside a transaction. We execute here; if caller is transaction batch, queries are already in tx.
  try {
    await sql`UPDATE physi_users SET mining_balance = mining_balance - ${cost}, updated_at=NOW() WHERE id=${userId}`;
  } catch (e) {
    return { ok: false, code: "DB_ERROR", message: "Failed to deduct stake" };
  }
  try {
    await sql`INSERT INTO physi_vote_bonds (verifier_id, event_id, stake, status) VALUES (${userId}, ${eventId}, ${cost}, 'held') ON CONFLICT (verifier_id, event_id) DO NOTHING`;
  } catch (e) {
    // refund on insert fail
    try { await sql`UPDATE physi_users SET mining_balance = mining_balance + ${cost} WHERE id=${userId}`; } catch {}
    return { ok: false, code: "DB_ERROR", message: "Failed to hold bond" };
  }
  return { ok: true, stake: cost };
}

export async function resolveBonds(sql: any, eventId: string, majorityVote: "YES" | "NO"): Promise<void> {
  try {
    // winners refund, losers burn
    const winners: any[] = await sql`SELECT verifier_id, stake FROM physi_vote_bonds WHERE event_id=${eventId} AND status='held'` as any;
    // Need to know each bond's vote — join verifications
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
    // Any held bonds without matching verification (edge) -> burn
    try { await sql`UPDATE physi_vote_bonds SET status='burned' WHERE event_id=${eventId} AND status='held'`; } catch {}
  } catch {}
}
