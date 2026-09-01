import { NextRequest, NextResponse } from "next/server";
import { getSql, isDbConfigured, dbNotConfigured, ensureAllTables } from "@/lib/db";
import { verifyGhostChain } from "@/lib/ghostWitness";

export const dynamic = "force-dynamic";

/**
 * GET /api/ghost-chain?user_id=UUID&verify=1
 * Returns user's ghost chain + current sig, optionally verifies chain integrity.
 */
export async function GET(req: NextRequest) {
  const sql = getSql();
  if (!isDbConfigured() || !sql) return NextResponse.json(dbNotConfigured(), { status: 503 });
  try { await ensureAllTables(); } catch {}
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("user_id") || searchParams.get("userId");
  if (!userId) return NextResponse.json({ ok: false, code: "BAD_INPUT", message: "user_id required" }, { status: 400 });
  try {
    const user = await sql`SELECT id, rep_ghost_sig, ghost_sig_updated_at FROM physi_users WHERE id=${userId} LIMIT 1`;
    if (!user.length) return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
    const chain = await sql`SELECT id, user_id, prev_sig, new_sig, action, created_at FROM physi_ghost_chain WHERE user_id=${userId} ORDER BY created_at ASC LIMIT 100`;
    const verify = searchParams.get("verify") === "1" || searchParams.get("verify") === "true";
    let chainValid: boolean | null = null;
    if (verify && chain.length > 0) {
      chainValid = verifyGhostChain(chain as any);
    }
    return NextResponse.json({ ok: true, user: user[0], chain, chain_valid: chainValid, count: chain.length });
  } catch (e) {
    return NextResponse.json({ ok: false, code: "INTERNAL" }, { status: 500 });
  }
}
