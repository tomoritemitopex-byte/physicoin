import { NextRequest, NextResponse } from "next/server";
import { getSql, isDbConfigured, dbNotConfigured, ensureAllTables } from "@/lib/db";
import { zkThresholdCheck, zkVerifyAuthority } from "@/lib/zkAuthority";

export const dynamic = "force-dynamic";

/**
 * ZK-Proof Authority API
 * GET  /api/zk?user_id=UUID&event_id=UUID  → threshold check (privacy: no raw authority leaked)
 * POST /api/zk { user_id, event_id }        → same, with proof token
 */
export async function GET(req: NextRequest) {
  const sql = getSql();
  if (!isDbConfigured() || !sql) return NextResponse.json(dbNotConfigured(), { status: 503 });
  try { await ensureAllTables(); } catch {}
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("user_id");
  const eventId = searchParams.get("event_id");
  if (!userId || !eventId) return NextResponse.json({ ok: false, code: "BAD_INPUT", message: "user_id and event_id required" }, { status: 400 });
  try {
    const [u] = await sql`SELECT authority_final FROM physi_users WHERE id=${userId} LIMIT 1`;
    if (!u) return NextResponse.json({ ok: false, code: "USER_NOT_FOUND" }, { status: 404 });
    const [ev] = await sql`SELECT id, required_points, is_zk_attested, status FROM physi_events WHERE id=${eventId} LIMIT 1`;
    if (!ev) return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
    const auth = Number((u as any).authority_final) || 1.0;
    const reqPts = Number((ev as any).required_points) || 5;
    const isZk = !!(ev as any).is_zk_attested;
    const check = zkThresholdCheck(auth, reqPts, isZk);
    const v = zkVerifyAuthority(auth, reqPts);
    return NextResponse.json({ ok: true, zk_attested: isZk, threshold: reqPts, check, verify: v, event_status: (ev as any).status });
  } catch (e) {
    return NextResponse.json({ ok: false, code: "INTERNAL" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const sql = getSql();
  if (!isDbConfigured() || !sql) return NextResponse.json(dbNotConfigured(), { status: 503 });
  try { await ensureAllTables(); } catch {}
  const b = await req.json().catch(() => null);
  if (!b?.user_id || !b?.event_id) return NextResponse.json({ ok: false, code: "BAD_INPUT", message: "user_id and event_id required" }, { status: 400 });
  try {
    const [u] = await sql`SELECT authority_final FROM physi_users WHERE id=${b.user_id} LIMIT 1`;
    if (!u) return NextResponse.json({ ok: false, code: "USER_NOT_FOUND" }, { status: 404 });
    const [ev] = await sql`SELECT id, required_points, is_zk_attested FROM physi_events WHERE id=${b.event_id} LIMIT 1`;
    if (!ev) return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
    const auth = Number((u as any).authority_final) || 1.0;
    const reqPts = Number((ev as any).required_points) || 5;
    const isZk = !!(ev as any).is_zk_attested;
    // ZK proof: only boolean + proof token, never raw authority
    const result = zkThresholdCheck(auth, reqPts, isZk);
    return NextResponse.json({ ok: true, zk_attested: isZk, ...result, proof_token: result.proof });
  } catch (e) {
    return NextResponse.json({ ok: false, code: "INTERNAL" }, { status: 500 });
  }
}
