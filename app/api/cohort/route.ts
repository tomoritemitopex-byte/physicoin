/**
 * app/api/cohort/route.ts — Anonymous Coherence
 * GET /api/cohort?user_id=X
 * Returns ONLY { count, pattern_strength } — NEVER peer IDs.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSql, isDbConfigured, dbNotConfigured, ensureAllTables } from "@/lib/db";
import { computeCohortPattern } from "@/lib/anonymousCoherence";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sql = getSql();
    if (!isDbConfigured() || !sql) return NextResponse.json(dbNotConfigured(), { status: 503 });
    try { await ensureAllTables(); } catch {}
    const { searchParams } = new URL(req.url);
    let userId = searchParams.get("user_id")?.trim() || null;
    // Also accept header fallback (not exposing)
    if (!userId) return NextResponse.json({ ok: false, code: "BAD_INPUT", message: "user_id required" }, { status: 400 });

    // Verify user exists (anonymity: don't leak existence vs not)
    try {
      const rows: any[] = await sql`SELECT id FROM physi_users WHERE id=${userId} LIMIT 1` as any;
      if (!rows.length) return NextResponse.json({ ok: false, code: "NOT_FOUND", message: "user not found" }, { status: 404 });
    } catch {}

    const res = await computeCohortPattern(sql, userId);
    // Return ONLY count + strength — NO peer IDs
    return NextResponse.json({
      ok: true,
      count: res.cohort_size,
      pattern_strength: res.pattern_strength,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, code: "INTERNAL", message: "couldn't load cohort" }, { status: 500 });
  }
}
