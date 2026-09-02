import { NextRequest, NextResponse } from "next/server";
import { getSql, ensureRevokedTokens } from "@/lib/db";
import { decodeSession, getSessionToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/logout — revoke current token's jti
 * Body: {} (token from Authorization header / cookie)
 */
export async function POST(req: NextRequest) {
  try {
    const sql = getSql();
    const token = getSessionToken(req as unknown as Request);
    if (!token) return NextResponse.json({ ok:false, code:"BAD_INPUT", message:"No session token" }, { status:400 });
    const dec: any = decodeSession(token);
    if (!dec?.jti) {
      // legacy token — just clear cookies
      const resp = NextResponse.json({ ok:true, message:"Logged out (legacy token)" });
      resp.cookies.set("session", "", { maxAge: 0, path: "/" });
      resp.cookies.set("physi_session", "", { maxAge: 0, path: "/" });
      return resp;
    }
    if (sql) {
      try { await ensureRevokedTokens(); } catch {}
      try {
        const expMs = dec.exp ? new Date(dec.exp).toISOString() : new Date(Date.now()+30*24*3600*1000).toISOString();
        await sql`INSERT INTO physi_revoked_tokens (jti, user_id, expires_at) VALUES (${dec.jti}, ${dec.uid}, ${expMs}::timestamptz) ON CONFLICT (jti) DO NOTHING`;
      } catch (e) {
        // fallback without user_id fk
        try { await sql`INSERT INTO physi_revoked_tokens (jti, expires_at) VALUES (${dec.jti}, ${new Date(dec.exp || Date.now()+30*24*3600*1000).toISOString()}::timestamptz) ON CONFLICT (jti) DO NOTHING`; } catch {}
      }
    }
    const resp = NextResponse.json({ ok:true, jti: dec.jti });
    resp.cookies.set("session", "", { maxAge: 0, path: "/" });
    resp.cookies.set("physi_session", "", { maxAge: 0, path: "/" });
    resp.cookies.set("physicoin_session", "", { maxAge: 0, path: "/" });
    return resp;
  } catch (e) {
    return NextResponse.json({ ok:false, code:"INTERNAL", message:"logout failed" }, { status:500 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
