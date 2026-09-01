import { NextRequest, NextResponse } from "next/server";
import { getSql, isDbConfigured, dbNotConfigured, ensureHeaders } from "@/lib/db";
import { ensureAndGetHeader } from "@/lib/header";
import { getProofWithSide, verifyProofWithSide } from "@/lib/merkle";

export const dynamic = "force-dynamic";

/**
 * GET /api/proof?event_id=X&date=YYYY-MM-DD -> { branch, root, header }
 * SPV: verifyMerkleProof(event_id, branch, header.merkleRoot)
 */
export async function GET(req: NextRequest) {
  const sql = getSql();
  if (!isDbConfigured() || !sql) return NextResponse.json(dbNotConfigured(), { status: 503 });
  try { await ensureHeaders(); } catch {}
  const { searchParams } = new URL(req.url);
  const eventId = searchParams.get("event_id") || searchParams.get("id");
  if (!eventId) return NextResponse.json({ ok:false, code:"BAD_INPUT", message:"event_id required" }, { status:400 });
  let date = searchParams.get("date")?.slice(0,10) || null;
  try {
    if (!date) {
      const r: any[] = await sql`SELECT event_date::text as d FROM physi_events WHERE id=${eventId} LIMIT 1` as any;
      if (r.length) date = String(r[0].d).slice(0,10);
    }
    if (!date) date = new Date().toISOString().slice(0,10);
    // fetch verified ids for that date (canonical set)
    const rows: any[] = await sql`SELECT id::text as id FROM physi_events WHERE status='verified' AND event_date=${date}::date ORDER BY id` as any;
    const ids = (rows || []).map((r:any)=> String(r.id));
    const header = await ensureAndGetHeader(date);
    if (!ids.includes(String(eventId))) {
      // event not in canonical set for that date -> no proof (still return header)
      return NextResponse.json({ ok:true, header, branch: [], root: header.merkleRoot, included: false, hint: "event not in verified set for this date" });
    }
    const { branch, root, leaf } = getProofWithSide(ids, String(eventId));
    const verified = verifyProofWithSide(String(eventId), branch, root);
    return NextResponse.json({ ok:true, header, branch, root, leaf, event_id: eventId, date, included: true, verified, hint: "verifyProofWithSide(event_id, branch, header.merkleRoot) -> true" });
  } catch (e) {
    return NextResponse.json({ ok:false, code:"PROOF_FAILED", message: (e as Error).message }, { status:500 });
  }
}
