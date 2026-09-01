/**
 * app/api/prof/alias/route.ts — Prof alias peer voting
 * Peer voting: students vote YES/NO on whether alias and canonical are the same prof.
 * Same pattern as Hall Deduper (physi_hall_aliases): 8-vote quorum + 70% consensus.
 * Fuzzy normalization (profMatchKey = last-word) is ONLY for initial grouping (prof_group_key);
 * the canonical name is decided by students, not algorithm.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSql, isDbConfigured, dbNotConfigured, ensureAllTables } from "@/lib/db";
import { logError, getErrorMessage } from "@/lib/adapters/error";
import { profGroupKey, profQuorumStatus } from "@/lib/profMatch";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const sql = getSql();
    if (!isDbConfigured() || !sql) return NextResponse.json(dbNotConfigured(), { status: 503 });
    try { await ensureAllTables(); } catch {}
    const b = await req.json().catch(() => null);
    const alias_name = String(b?.alias_name || b?.alias || "").trim().slice(0, 80);
    const canonical_name = String(b?.canonical_name || b?.canonical || "").trim().slice(0, 80);
    const voter_id = String(b?.voter_id || "").trim();
    const voteRaw = String(b?.vote || "").toLowerCase();
    if (!alias_name || !canonical_name || !voter_id || !["yes", "no"].includes(voteRaw))
      return NextResponse.json({ ok: false, code: "BAD_INPUT", message: getErrorMessage("BAD_INPUT") }, { status: 400 });
    if (alias_name.toLowerCase() === canonical_name.toLowerCase())
      return NextResponse.json({ ok: false, code: "BAD_INPUT", message: "alias and canonical must differ" }, { status: 400 });

    const voter = await sql`SELECT id FROM physi_users WHERE id=${voter_id} LIMIT 1`;
    if (!voter.length) return NextResponse.json({ ok: false, code: "VOTER_NOT_FOUND", message: getErrorMessage("VOTER_NOT_FOUND") }, { status: 404 });

    const groupKey = profGroupKey(canonical_name) || profGroupKey(alias_name);
    const voteValue = voteRaw === "yes" ? 1 : -1;

    let aliasRow: any = null;
    try {
      const rows = await sql`SELECT * FROM physi_prof_aliases WHERE lower(alias)=lower(${alias_name}) AND lower(canonical)=lower(${canonical_name}) AND prof_group_key=${groupKey} LIMIT 1`;
      aliasRow = rows[0] || null;
      if (!aliasRow) {
        const ins = await sql`INSERT INTO physi_prof_aliases (alias, canonical, prof_group_key) VALUES (${alias_name}, ${canonical_name}, ${groupKey}) ON CONFLICT DO NOTHING RETURNING *`;
        if (ins.length) aliasRow = ins[0];
        else {
          const again = await sql`SELECT * FROM physi_prof_aliases WHERE lower(alias)=lower(${alias_name}) AND lower(canonical)=lower(${canonical_name}) AND prof_group_key=${groupKey} LIMIT 1`;
          aliasRow = again[0] || null;
        }
      }
      if (!aliasRow) return NextResponse.json({ ok: false, code: "INTERNAL", message: getErrorMessage("INTERNAL") }, { status: 500 });
    } catch (e: any) {
      try {
        const rows2 = await sql`SELECT * FROM physi_prof_aliases WHERE lower(alias)=lower(${alias_name}) AND lower(canonical)=lower(${canonical_name}) LIMIT 1`;
        if (rows2.length) aliasRow = rows2[0];
        else {
          const ins2 = await sql`INSERT INTO physi_prof_aliases (alias, canonical, prof_group_key) VALUES (${alias_name}, ${canonical_name}, ${groupKey}) RETURNING *`;
          aliasRow = ins2[0];
        }
      } catch {
        throw e;
      }
    }
    const aliasId = aliasRow.id;

    await sql`INSERT INTO physi_prof_alias_votes (alias_id, voter_id, vote_value) VALUES (${aliasId}, ${voter_id}, ${voteValue}) ON CONFLICT (alias_id, voter_id) DO UPDATE SET vote_value=${voteValue}`;

    const agg = await sql`SELECT COUNT(*) FILTER (WHERE vote_value=1) AS yes, COUNT(*) FILTER (WHERE vote_value=-1) AS no FROM physi_prof_alias_votes WHERE alias_id=${aliasId}` as any[];
    const yes = Number((agg[0] as any)?.yes || 0);
    const no = Number((agg[0] as any)?.no || 0);
    const total = yes + no;
    const status = profQuorumStatus(yes, no);

    if (status === "pending") {
      await sql`UPDATE physi_prof_aliases SET vote_count=${total}, votes_yes=${yes}, votes_no=${no}, status='pending', resolved_at=NULL WHERE id=${aliasId}`;
    } else if (status === "resolved") {
      await sql`UPDATE physi_prof_aliases SET vote_count=${total}, votes_yes=${yes}, votes_no=${no}, status='resolved', resolved_at=NOW() WHERE id=${aliasId}`;
    } else {
      await sql`UPDATE physi_prof_aliases SET vote_count=${total}, votes_yes=${yes}, votes_no=${no}, status='rejected', resolved_at=NOW() WHERE id=${aliasId}`;
    }

    const updated = await sql`SELECT * FROM physi_prof_aliases WHERE id=${aliasId} LIMIT 1`;
    return NextResponse.json({ ok: true, alias: updated[0], votes: { yes, no, total }, status, quorum_needed: Math.max(0, 8 - total) });
  } catch (e) {
    logError("PROF_ALIAS_VOTE_FAILED", e, {});
    return NextResponse.json({ ok: false, code: "INTERNAL", message: getErrorMessage("INTERNAL") }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const sql = getSql();
    if (!isDbConfigured() || !sql) return NextResponse.json(dbNotConfigured(), { status: 503 });
    try { await ensureAllTables(); } catch {}
    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get("status") || "pending";
    const groupKey = searchParams.get("prof_group_key") || searchParams.get("group_key");
    let rows: any[];
    if (groupKey) {
      rows = await sql`SELECT * FROM physi_prof_aliases WHERE prof_group_key=${groupKey} AND status=${statusFilter} ORDER BY vote_count DESC, created_at DESC LIMIT 50`;
    } else {
      rows = await sql`SELECT * FROM physi_prof_aliases WHERE status=${statusFilter} ORDER BY vote_count DESC, created_at DESC LIMIT 50`;
    }
    return NextResponse.json({ ok: true, proposals: rows, count: rows.length });
  } catch (e) {
    logError("PROF_ALIAS_FETCH_FAILED", e, {});
    return NextResponse.json({ ok: false, code: "INTERNAL", message: getErrorMessage("INTERNAL") }, { status: 500 });
  }
}
