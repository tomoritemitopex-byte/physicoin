import { NextRequest, NextResponse } from "next/server";
import { getSql, isDbConfigured, dbNotConfigured, ensureAllTables } from "@/lib/db";
import { logError, getErrorMessage } from "@/lib/adapters/error";
import { computeVoteWeight, weightFromTotal } from "@/lib/voteWeight";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sql = getSql();
    if (!isDbConfigured() || !sql) return NextResponse.json(dbNotConfigured(), { status: 503 });
    try { await ensureAllTables(); } catch {}
    const uid = new URL(req.url).searchParams.get("user_id") || new URL(req.url).searchParams.get("voter_id");
    if (!uid) return NextResponse.json({ ok: false, code: "BAD_INPUT", message: "user_id required" }, { status: 400 });
    const weight = await computeVoteWeight(sql, uid);
    // also return breakdown
    let breakdown = { verifications: 0, scope_votes: 0, hall_votes: 0, prof_votes: 0, total: 0 };
    try {
      const [v1, v2, v3, v4] = await Promise.all([
        sql`SELECT COUNT(*)::int AS c FROM physi_verifications WHERE verifier_id=${uid}`.then((r:any)=>Number(r[0]?.c||0)).catch(()=>0),
        sql`SELECT COUNT(*)::int AS c FROM physi_scope_votes WHERE voter_id=${uid}`.then((r:any)=>Number(r[0]?.c||0)).catch(()=>0),
        sql`SELECT COUNT(*)::int AS c FROM physi_hall_alias_votes WHERE voter_id=${uid}`.then((r:any)=>Number(r[0]?.c||0)).catch(()=>0),
        sql`SELECT COUNT(*)::int AS c FROM physi_prof_alias_votes WHERE voter_id=${uid}`.then((r:any)=>Number(r[0]?.c||0)).catch(()=>0),
      ]);
      breakdown = { verifications: v1, scope_votes: v2, hall_votes: v3, prof_votes: v4, total: v1+v2+v3+v4 };
    } catch {}
    return NextResponse.json({ ok: true, weight, label: `${weight}×`, breakdown, tiers: "0-4→0.5x 5-19→1.0x 20-49→1.25x 50+→1.5x" });
  } catch (e) {
    logError("VOTE_WEIGHT_FAILED", e, {});
    return NextResponse.json({ ok: false, code: "INTERNAL", message: getErrorMessage("INTERNAL") }, { status: 500 });
  }
}
