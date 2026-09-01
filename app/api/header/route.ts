import { NextRequest, NextResponse } from "next/server";
import { getSql, isDbConfigured, dbNotConfigured, ensureHeaders } from "@/lib/db";
import { ensureAndGetHeader, verifyHeaderHmac } from "@/lib/header";

export const dynamic = "force-dynamic";

/**
 * GET /api/header?date=YYYY-MM-DD -> header JSON (builds if missing)
 * SPV root of trust: date, prevHash, merkleRoot, ghostTipRoot, count, hmac
 */
export async function GET(req: NextRequest) {
  const sql = getSql();
  if (!isDbConfigured() || !sql) return NextResponse.json(dbNotConfigured(), { status: 503 });
  try { await ensureHeaders(); } catch {}
  const { searchParams } = new URL(req.url);
  const date = (searchParams.get("date") || new Date().toISOString().slice(0,10)).slice(0,10);
  try {
    const hdr = await ensureAndGetHeader(date);
    return NextResponse.json({ ok:true, header: hdr, verified: verifyHeaderHmac(hdr) });
  } catch (e) {
    return NextResponse.json({ ok:false, code:"HEADER_FAILED", message: (e as Error).message }, { status:500 });
  }
}
