/**
 * app/api/scopes/route.ts — Scope Merge Protocol API
 * Zero-official consensus: students vote on whether two scope tags
 * represent the same learning outcome. No faculty arbitration.
 * Satoshi P2: pure peer resolution.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSql, isDbConfigured, dbNotConfigured } from "@/lib/db";
import { logError, getErrorMessage } from "@/lib/adapters/error";

// Satoshi P2: Quorum thresholds — 8 peers minimum, 70% agreement
const QUORUM_MIN = 8;
const QUORUM_RATIO = 0.70;

export async function POST(req: NextRequest) {
  try {
    const sql = getSql();
    if (!isDbConfigured() || !sql) return NextResponse.json(dbNotConfigured(), { status: 503 });

    const b = await req.json().catch(() => null);
    if (!b?.voter_id || !b?.scope_a || !b?.scope_b)
      return NextResponse.json({ ok: false, code: "BAD_INPUT", message: getErrorMessage("BAD_INPUT") }, { status: 400 });

    const voteValue = b.vote === "yes" ? 1 : -1;
    const sa = String(b.scope_a).trim();
    const sb = String(b.scope_b).trim();

    if (!sa || !sb || sa === sb)
      return NextResponse.json({ ok: false, code: "INVALID_SCOPE", message: "scope_a and scope_b must differ" }, { status: 400 });

    try {
      // Insert or update vote
      await sql`
        INSERT INTO physi_scope_votes (voter_id, scope_a, scope_b, vote_value)
        VALUES (${b.voter_id}, ${sa}, ${sb}, ${voteValue})
        ON CONFLICT (voter_id, scope_a, scope_b) DO UPDATE SET vote_value = ${voteValue}
      `;

      // Count votes
      const votes = await sql`
        SELECT
          COUNT(*) FILTER (WHERE vote_value = 1) AS yes,
          COUNT(*) FILTER (WHERE vote_value = -1) AS no
        FROM physi_scope_votes
        WHERE scope_a = ${sa} AND scope_b = ${sb}
      `;
      const yes = Number(votes[0]?.yes || 0);
      const no = Number(votes[0]?.no || 0);
      const total = yes + no;

      // Satoshi P2: Resolve if quorum reached
      if (total >= QUORUM_MIN && yes / total >= QUORUM_RATIO) {
        await sql`
          INSERT INTO physi_scope_resolution (scope_a, scope_b, merged_into, resolution)
          VALUES (${sa}, ${sb}, ${sa}, 'merged')
          ON CONFLICT (scope_a, scope_b) DO UPDATE SET resolution = 'merged', merged_into = ${sa}, resolved_at = NOW()
        `;
        return NextResponse.json({ ok: true, status: "merged", into: sa, votes: { yes, no, total } });
      }

      if (total >= QUORUM_MIN && no / total >= QUORUM_RATIO) {
        await sql`
          INSERT INTO physi_scope_resolution (scope_a, scope_b, resolution)
          VALUES (${sa}, ${sb}, NULL, 'separate')
          ON CONFLICT (scope_a, scope_b) DO UPDATE SET resolution = 'separate', merged_into = NULL, resolved_at = NOW()
        `;
        return NextResponse.json({ ok: true, status: "separate", votes: { yes, no, total } });
      }

      return NextResponse.json({
        ok: true,
        status: "pending",
        votes: { yes, no, total },
        quorum_needed: Math.max(0, QUORUM_MIN - total),
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

    const { searchParams } = new URL(req.url);
    const scopeA = searchParams.get("a");
    const scopeB = searchParams.get("b");

    try {
      if (scopeA && scopeB) {
        // Single scope-pair resolution + vote counts
        const resolution = await sql`
          SELECT resolution, merged_into, resolved_at
          FROM physi_scope_resolution
          WHERE scope_a = ${scopeA} AND scope_b = ${scopeB}
        `;

        const vote_counts = await sql`
          SELECT
            COUNT(*) FILTER (WHERE vote_value = 1) AS yes,
            COUNT(*) FILTER (WHERE vote_value = -1) AS no
          FROM physi_scope_votes
          WHERE scope_a = ${scopeA} AND scope_b = ${scopeB}
        `;

        return NextResponse.json({
          ok: true,
          resolution: resolution[0] || null,
          votes: {
            yes: Number(vote_counts[0]?.yes || 0),
            no: Number(vote_counts[0]?.no || 0),
          },
        });
      }

      // List all unresolved scope conflicts with vote counts
      const conflicts = await sql`
        SELECT
          scope_a,
          scope_b,
          COUNT(*) FILTER (WHERE vote_value = 1) AS yes_votes,
          COUNT(*) FILTER (WHERE vote_value = -1) AS no_votes
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
