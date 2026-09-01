import { NextRequest, NextResponse } from "next/server";
import { getSql, isDbConfigured, dbNotConfigured } from "@/lib/db";
import { signSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/session { user_id } -> { token }
 * Issues HMAC-signed session token. In prod, verify user exists. Client stores in cookie/localStorage and sends as Authorization: Bearer <token>.
 */
export async function POST(req: NextRequest) {
  try {
    const b = await req.json().catch(() => null);
    const uid = String(b?.user_id || b?.userId || b?.id || "").trim();
    if (!uid) return NextResponse.json({ ok:false, code:"BAD_INPUT", message:"user_id required" }, { status:400 });
    const sql = getSql();
    if (isDbConfigured() && sql) {
      try {
        const rows: any[] = await sql`SELECT id FROM physi_users WHERE id=${uid} LIMIT 1` as any;
        if (!rows.length) return NextResponse.json({ ok:false, code:"USER_NOT_FOUND", message:"user not found" }, { status:404 });
      } catch {}
    }
    const token = signSession(uid);
    const resp = NextResponse.json({ ok:true, token, user_id: uid });
    // also set cookie for browser clients
    resp.cookies.set("session", token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60*60*24*30 });
    resp.cookies.set("physi_session", token, { httpOnly: false, sameSite: "lax", path: "/", maxAge: 60*60*24*30 });
    return resp;
  } catch (e) {
    return NextResponse.json({ ok:false, code:"INTERNAL", message:"failed to create session" }, { status:500 });
  }
}

export async function GET(req: NextRequest) {
  const { verifySession } = await import("@/lib/auth");
  const auth = req.headers.get("authorization") || req.headers.get("cookie") || "";
  let token: string | null = null;
  const m = auth.match(/Bearer\s+(.+)/i);
  if (m) token = m[1];
  else {
    const cookie = req.headers.get("cookie") || "";
    for (const part of cookie.split(";")) {
      const [k,...rest] = part.trim().split("=");
      if (k.trim()==="session" || k.trim()==="physi_session") token = rest.join("=").trim().replace(/^"|"$/g,"");
    }
  }
  const uid = token ? verifySession(token) : null;
  return NextResponse.json({ ok: !!uid, user_id: uid, authenticated: !!uid });
}
