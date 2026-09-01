/**
 * lib/scopeMining.ts — Scope Value Mining (Satoshi Intuition #2)
 * Rep rewards for scope voting.
 * +0.1 Rep for majority voters, +0.5 Rep bonus for quorum reachers (the 8th voter who tips quorum).
 */
export const SCOPE_REWARD_MAJORITY = 0.1;
export const SCOPE_REWARD_QUORUM_BONUS = 0.5;
export const SCOPE_QUORUM_MIN = 8;
export const SCOPE_QUORUM_RATIO = 0.70;

/** Determine if vote is majority (winning side) */
export function isMajorityVote(voteValue: number, yesCount: number, noCount: number): boolean {
  if (yesCount > noCount) return voteValue === 1;
  if (noCount > yesCount) return voteValue === -1;
  return false; // tie = no majority reward
}

/** Compute rewards for all voters after quorum resolution */
export function computeScopeRewards(votes: Array<{ voter_id: string; vote_value: number }>, quorumReached: boolean): Array<{ voter_id: string; amount: number; reason: string }> {
  if (!quorumReached || votes.length < SCOPE_QUORUM_MIN) return [];
  const yes = votes.filter(v => v.vote_value === 1).length;
  const no = votes.filter(v => v.vote_value === -1).length;
  const majoritySide = yes > no ? 1 : -1;
  // quorum reacher = last voter(s) who pushed total to >=8 with ratio >=0.70
  // simplified: all voters on majority side get +0.1, and the most recent voter who tipped quorum gets +0.5 bonus
  const rewards: Array<{ voter_id: string; amount: number; reason: string }> = [];
  for (const v of votes) {
    if (v.vote_value === majoritySide) {
      rewards.push({ voter_id: v.voter_id, amount: SCOPE_REWARD_MAJORITY, reason: "majority" });
    }
  }
  // quorum bonus: awarded to the voters who made total reach quorum_min (up to 1 bonus)
  // we award to the last inserted voter implicitly via caller; here we mark no one automatically —
  // caller should add bonus to the triggering voter.
  return rewards;
}

/**
 * Prepare scope mining reward query promises — do NOT await sequentially.
 * Returns array of Neon query promises for use inside sql.transaction((tx)=>[...])
 */
export function prepareScopeRewardQueries(
  tx: any,
  scopeA: string,
  scopeB: string,
  rewards: Array<{ voter_id: string; amount: number }>
): any[] {
  const queries: any[] = [];
  for (const r of rewards) {
    // prepare query promises (no await)
    const q1 = tx`UPDATE physi_scope_votes SET rep_earned = COALESCE(rep_earned,0) + ${r.amount} WHERE voter_id=${r.voter_id} AND scope_a=${scopeA} AND scope_b=${scopeB}`;
    const q2 = tx`UPDATE physi_users SET mining_balance = mining_balance + ${r.amount}, updated_at=NOW() WHERE id=${r.voter_id}`;
    const q3 = tx`INSERT INTO physi_mining_logs (user_id, base_reward, authority_multiplier, earned_amount) VALUES (${r.voter_id}, ${r.amount}, 1.0, ${r.amount})`;
    queries.push(q1, q2, q3);
  }
  return queries;
}

/**
 * Build reward details (pure computation, no DB) — used to prepare queries outside transaction.
 */
export function buildScopeRewardDetails(
  votes: Array<{ voter_id: string; vote_value: number }>,
  triggeringVoterId: string
): { rewards: Array<{ voter_id: string; amount: number }>; quorumReached: boolean; yes: number; no: number; total: number } {
  const yes = votes.filter((v: any) => Number(v.vote_value) === 1).length;
  const no = votes.filter((v: any) => Number(v.vote_value) === -1).length;
  const total = yes + no;
  const quorumYes = total >= SCOPE_QUORUM_MIN && yes / total >= SCOPE_QUORUM_RATIO;
  const quorumNo = total >= SCOPE_QUORUM_MIN && no / total >= SCOPE_QUORUM_RATIO;
  const quorumReached = quorumYes || quorumNo;
  if (!quorumReached) return { rewards: [], quorumReached, yes, no, total };
  const majoritySide = yes > no ? 1 : -1;
  const rewards: Array<{ voter_id: string; amount: number }> = [];
  for (const v of votes) {
    if (Number(v.vote_value) !== majoritySide) continue;
    let amount = SCOPE_REWARD_MAJORITY;
    if (String(v.voter_id) === String(triggeringVoterId)) amount += SCOPE_REWARD_QUORUM_BONUS;
    rewards.push({ voter_id: v.voter_id, amount });
  }
  return { rewards, quorumReached, yes, no, total };
}

/** Server helper: award scope mining rewards inside transaction
 * Refactored: prepares query promises then returns them as array pattern when inside
 * sql.transaction. For backwards compat, if called with a tx that is inside an
 * already-batched transaction, the queries are prepared and awaited via Promise.all.
 * Preferred new usage: compute rewards outside, then use prepareScopeRewardQueries
 * inside sql.transaction((tx)=>[...]).
 */
export async function awardScopeRewards(
  tx: any,
  scopeA: string,
  scopeB: string,
  triggeringVoterId: string
): Promise<{ awarded: number; details: Array<{ voter_id: string; amount: number }> }> {
  const votes: Array<{ voter_id: string; vote_value: number; rep_earned?: number }> = await tx`
    SELECT voter_id, vote_value FROM physi_scope_votes WHERE scope_a=${scopeA} AND scope_b=${scopeB}
  `;
  const { rewards, quorumReached } = buildScopeRewardDetails(votes as any, triggeringVoterId);
  if (!quorumReached || rewards.length === 0) return { awarded: 0, details: [] };

  // Prepare query promises (no sequential awaits)
  const queries = prepareScopeRewardQueries(tx, scopeA, scopeB, rewards);
  // Execute with Promise.all (batched, not sequential)
  try { await Promise.all(queries.map((q) => q.catch(() => null))); } catch {}

  let awarded = 0;
  const details: Array<{ voter_id: string; amount: number }> = [];
  for (const r of rewards) {
    details.push({ voter_id: r.voter_id, amount: r.amount });
    awarded += r.amount;
  }
  return { awarded, details };
}
