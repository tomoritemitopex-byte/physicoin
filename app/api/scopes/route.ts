/**
 * app/api/scopes/route.ts — Scope Merge Protocol API
 * Zero-official consensus: students vote on whether two scope tags
 * represent the same learning outcome. No faculty arbitration.
 * Satoshi P2: pure peer resolution.
 * Extensions: Ghost Witness SHA256 chain + Scope Value Mining rewards.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSql, isDbConfigured, dbNotConfigured, ensureAllTables } from "@/lib/db";
import { logError, getErrorMessage } from "@/lib/adapters/error";
import { GHOST_ACTIONS, prepareGhostChainQueries, buildGhostChainSigs } from "@/lib/ghostWitness";
import { awardScopeRewards, buildScopeRewardDetails, prepareScopeRewardQueries } from "@/lib/scopeMining";

// Satoshi P2: Quorum thresholds — 8 peers minimum, 70% agreement
const QUORUM_MIN = 8;
const QUORUM_RATIO = 0.70;

export async function POST(req: NextRequest) {
  try {
    const sql = getSql();
    if (!isDbConfigured() || !sql) return NextResponse.json(dbNotConfigured(), { status: 503 });
    try { await ensureAllTables(); } catch {}

    const b = await req.json().catch(() => null);
    if (!b?.voter_id || !b?.scope_a || !b?.scope_b)
      return NextResponse.json({ ok: false, code: "BAD_INPUT", message: getErrorMessage("BAD_INPUT") }, { status: 400 });

    const voteValue = b.vote === "yes" ? 1 : -1;
    const sa = String(b.scope_a).trim();
    const sb = String(b.scope_b).trim();

    if (!sa || !sb || sa === sb)
      return NextResponse.json({ ok: false, code: "INVALID_SCOPE", message: "scope_a and scope_b must differ" }, { status: 400 });

    try {
      // Verify voter exists
      const [voter] = await sql`SELECT id, rep_ghost_sig FROM physi_users WHERE id = ${b.voter_id} LIMIT 1`;
      if (!voter) {
        return NextResponse.json({ ok: false, code: "VOTER_NOT_FOUND", message: "Invalid voter_id" }, { status: 404 });
      }

      // --- Pre-transaction reads & pure computation (required for Neon HTTP batch tx) ---
      const ghostAction = voteValue === 1 ? GHOST_ACTIONS.SCOPE_VOTE_YES : GHOST_ACTIONS.SCOPE_VOTE_NO;
      const prevSigRaw: string | null = (voter as any)?.rep_ghost_sig ?? null;
      // Fallback fetch if rep_ghost_sig not in first select (should be there)
      let prevSig: string | null = prevSigRaw;
      if (prevSig === null) {
        try {
          const rows = await sql`SELECT rep_ghost_sig FROM physi_users WHERE id=${b.voter_id} LIMIT 1`;
          prevSig = (rows?.[0] as any)?.rep_ghost_sig ?? null;
        } catch { prevSig = null; }
      }
      const ghostBuild = buildGhostChainSigs(prevSig, ghostAction, String(b.voter_id));

      // Fetch existing vote for projector (handle upsert delta)
      let existingVote: { vote_value: number } | null = null;
      try {
        const rows = await sql`SELECT vote_value FROM physi_scope_votes WHERE voter_id=${b.voter_id} AND scope_a=${sa} AND scope_b=${sb} LIMIT 1`;
        if (rows.length) existingVote = rows[0] as any;
      } catch {}

      // Fetch current aggregates before insert
      let curYes = 0, curNo = 0;
      try {
        const votes = await sql`
          SELECT
            COUNT(*) FILTER (WHERE vote_value = 1) AS yes,
            COUNT(*) FILTER (WHERE vote_value = -1) AS no
          FROM physi_scope_votes
          WHERE scope_a = ${sa} AND scope_b = ${sb}
        `;
        curYes = Number((votes[0] as any)?.yes || 0);
        curNo = Number((votes[0] as any)?.no || 0);
      } catch {}

      // Project counts after upsert
      let projectedYes = curYes;
      let projectedNo = curNo;
      if (existingVote) {
        const old = Number(existingVote.vote_value);
        if (old === 1) projectedYes -= 1;
        if (old === -1) projectedNo -= 1;
      }
      if (voteValue === 1) projectedYes += 1;
      else projectedNo += 1;
      const total = projectedYes + projectedNo;

      let status: "merged"|"separate"|"pending" = "pending";
      const quorumYes = total >= QUORUM_MIN && projectedYes / total >= QUORUM_RATIO;
      const quorumNo = total >= QUORUM_MIN && projectedNo / total >= QUORUM_RATIO;
      if (quorumYes) status = "merged";
      else if (quorumNo) status = "separate";

      // Build reward details (projected votes list)
      let votesForRewards: Array<{ voter_id: string; vote_value: number }> = [];
      try {
        const all = await sql`SELECT voter_id, vote_value FROM physi_scope_votes WHERE scope_a=${sa} AND scope_b=${sb}` as Array<{ voter_id: string; vote_value: number }>;
        votesForRewards = (all as any[]).map((r: any) => ({ voter_id: String(r.voter_id), vote_value: Number(r.vote_value) }));
      } catch {}
      // Apply projected upsert to votesForRewards
      const idx = votesForRewards.findIndex((v) => String(v.voter_id) === String(b.voter_id));
      if (idx >= 0) votesForRewards[idx] = { voter_id: String(b.voter_id), vote_value: voteValue };
      else votesForRewards.push({ voter_id: String(b.voter_id), vote_value: voteValue });

      const rewardInfo = buildScopeRewardDetails(votesForRewards, String(b.voter_id));
      const shouldReward = status !== "pending" && rewardInfo.rewards.length > 0;
      const rewardedDetails = shouldReward ? rewardInfo.rewards : [];

      // --- Transactional batch: prepare query promises then return as array (Neon HTTP correct pattern) ---
      await sql.transaction((tx: any) => {
        const queries: any[] = [];
        // 1. Insert vote (upsert)
        const voteQ = tx`
          INSERT INTO physi_scope_votes (voter_id, scope_a, scope_b, vote_value)
          VALUES (${b.voter_id}, ${sa}, ${sb}, ${voteValue})
          ON CONFLICT (voter_id, scope_a, scope_b) DO UPDATE SET vote_value = ${voteValue}
        `;
        queries.push(voteQ);

        // 2. Ghost Witness: extend caller's chain (prepare queries)
        const ghostQueries = prepareGhostChainQueries(tx, String(b.voter_id), ghostAction, ghostBuild.prev, ghostBuild.newSig);
        queries.push(...ghostQueries);

        // 3. Resolution + mining rewards (quorum dependent — decided before tx)
        if (quorumYes) {
          const resQ = tx`
            INSERT INTO physi_scope_resolution (scope_a, scope_b, merged_into, resolution)
            VALUES (${sa}, ${sb}, ${sa}, 'merged')
            ON CONFLICT (scope_a, scope_b) DO UPDATE SET resolution = 'merged', merged_into = ${sa}, resolved_at = NOW()
          `;
          queries.push(resQ);
          if (shouldReward) {
            const rewardQueries = prepareScopeRewardQueries(tx, sa, sb, rewardedDetails);
            queries.push(...rewardQueries);
          }
        } else if (quorumNo) {
          const resQ = tx`
            INSERT INTO physi_scope_resolution (scope_a, scope_b, resolution)
            VALUES (${sa}, ${sb}, NULL, 'separate')
            ON CONFLICT (scope_a, scope_b) DO UPDATE SET resolution = 'separate', merged_into = NULL, resolved_at = NOW()
          `;
          queries.push(resQ);
          if (shouldReward) {
            const rewardQueries = prepareScopeRewardQueries(tx, sa, sb, rewardedDetails);
            queries.push(...rewardQueries);
          }
        }
        // Return array of query promises (non-async function)
        return queries;
      });

      const ghost = { newSig: ghostBuild.newSig, prevSig: ghostBuild.prev };
      const rewarded = shouldReward ? { awarded: rewardedDetails.reduce((s, r) => s + r.amount, 0), details: rewardedDetails } : null;
      const result = { yes: projectedYes, no: projectedNo, total, status, ghost, rewarded };

      if (result.status === "merged") {
        return NextResponse.json({ ok: true, status: "merged", into: sa, votes: { yes: result.yes, no: result.no, total: result.total }, ghost_sig: result.ghost?.newSig, mining_rewards: result.rewarded });
      }
      if (result.status === "separate") {
        return NextResponse.json({ ok: true, status: "separate", votes: { yes: result.yes, no: result.no, total: result.total }, ghost_sig: result.ghost?.newSig, mining_rewards: result.rewarded });
      }

      return NextResponse.json({
        ok: true,
        status: "pending",
        votes: { yes: result.yes, no: result.no, total: result.total },
        quorum_needed: Math.max(0, QUORUM_MIN - result.total),
        ghost_sig: result.ghost?.newSig,
      });
    } catch (e) {
      logError("SCOPE_VOTE_FAILED", e, { scope_a: sa, scope_b: sb });
      throw e;
    }
  } catch (e) {
    logError("SCOPE_API_ERROR", e, { method: req.method });
    return NextResponse.json({ ok: false, code: "INTERNAL", message: getErrorMessage("INTERNAL") }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const sql = getSql();
    if (!isDbConfigured() || !sql) return NextResponse.json(dbNotConfigured(), { status: 503 });
    try { await ensureAllTables(); } catch {}

    const { searchParams } = new URL(req.url);
    const scopeA = searchParams.get("a");
    const scopeB = searchParams.get("b");

    try {
      if (scopeA && scopeB) {
        const resolution = await sql`
          SELECT resolution, merged_into, resolved_at
          FROM physi_scope_resolution
          WHERE scope_a = ${scopeA} AND scope_b = ${scopeB}
        `;

        const vote_counts = await sql`
          SELECT
            COUNT(*) FILTER (WHERE vote_value = 1) AS yes,
            COUNT(*) FILTER (WHERE vote_value = -1) AS no,
            COALESCE(SUM(rep_earned),0)::float AS total_rep_earned
          FROM physi_scope_votes
          WHERE scope_a = ${scopeA} AND scope_b = ${scopeB}
        `;

        return NextResponse.json({
          ok: true,
          resolution: (resolution as any[])[0] || null,
          votes: {
            yes: Number((vote_counts[0] as any)?.yes || 0),
            no: Number((vote_counts[0] as any)?.no || 0),
            rep_earned: Number((vote_counts[0] as any)?.total_rep_earned || 0),
          },
        });
      }

      // List all unresolved scope conflicts with vote counts + rep_earned
      const conflicts = await sql`
        SELECT
          scope_a,
          scope_b,
          COUNT(*) FILTER (WHERE vote_value = 1) AS yes_votes,
          COUNT(*) FILTER (WHERE vote_value = -1) AS no_votes,
          COALESCE(SUM(rep_earned),0)::float AS rep_earned
        FROM physi_scope_votes v
        WHERE NOT EXISTS (
          SELECT 1 FROM physi_scope_resolution r
          WHERE r.scope_a = v.scope_a AND r.scope_b = v.scope_b
        )
        GROUP BY scope_a, scope_b
        HAVING COUNT(*) >= 1
        ORDER BY COUNT(*) DESC
        LIMIT 50
      `;

      return NextResponse.json({ ok: true, conflicts: conflicts || [] });
    } catch (e) {
      logError("SCOPE_FETCH_FAILED", e, { method: "GET" });
      throw e;
    }
  } catch (e) {
    logError("SCOPE_API_ERROR", e, { method: req.method });
    return NextResponse.json({ ok: false, code: "INTERNAL", message: getErrorMessage("INTERNAL") }, { status: 500 });
  }
}
