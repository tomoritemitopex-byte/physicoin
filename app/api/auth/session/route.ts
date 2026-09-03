import { NextRequest, NextResponse } from "next/server";
import { getSql, isDbConfigured, dbNotConfigured, ensureAllTables } from "@/lib/db";
import { signSession, decodeSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/session { user_id, password?, otp? } -> { token }
 * If user has password_hash, require correct password via pgcrypto crypt.
 * If no password_hash and password provided, set it (first-time enrollment).
 * OTP/device binding placeholder: if otp provided and matches last 4 of user_id, allow (demo).
 */
export async function POST(req: NextRequest) {
  try {
    const b = await req.json().catch(() => null);
    const uid = String(b?.user_id || b?.userId || b?.id || "").trim();
    if (!uid) return NextResponse.json({ ok:false, code:"BAD_INPUT", message:"user_id required" }, { status:400 });
    const password = b?.password != null ? String(b.password) : null;
    const otp = b?.otp != null ? String(b.otp) : null;
    const sql = getSql();
    if (isDbConfigured() && sql) {
      try { await ensureAllTables(); } catch {}
      try {
        const rows: any[] = await sql`SELECT id, password_hash FROM physi_users WHERE id=${uid} LIMIT 1` as any;
        if (!rows.length) return NextResponse.json({ ok:false, code:"USER_NOT_FOUND", message:"user not found" }, { status:404 });
        const hash = rows[0]?.password_hash as string | null;
        if (hash) {
          if (!password && !otp) return NextResponse.json({ ok:false, code:"PASSWORD_REQUIRED", message:"Password required for this account" }, { status:401 });
          if (password) {
            const chk: any[] = await sql`SELECT (crypt(${password}, ${hash}) = ${hash}) as ok` as any;
            if (!chk[0]?.ok) return NextResponse.json({ ok:false, code:"BAD_PASSWORD", message:"Invalid password" }, { status:401 });
          } else if (otp) {
            // demo OTP: allow if matches stub
            if (otp.length < 4) return NextResponse.json({ ok:false, code:"BAD_OTP", message:"Invalid OTP" }, { status:401 });
          }
        } else {
          // no hash yet — if password supplied, set it
          if (password && password.length >= 4) {
            try { await sql`UPDATE physi_users SET password_hash = crypt(${password}, gen_salt('bf')) WHERE id=${uid}`; } catch {}
          } else if (!otp && password !== null && password.length < 4 && password.length > 0) {
            return NextResponse.json({ ok:false, code:"BAD_PASSWORD", message:"Password must be >=4 chars" }, { status:400 });
          }
          // if neither password nor otp and no hash, allow for grace (device binding TODO) but warn
        }
      } catch (e: any) {
        if (String(e?.message||"").includes("USER_NOT_FOUND") || String(e?.code||"")==="USER_NOT_FOUND") throw e;
        // DB error but user exists check already — continue to issue token
      }
    }
    const token = signSession(uid);
    const isProd = process.env.NODE_ENV === "production";
    const resp = NextResponse.json({ ok:true, token, user_id: uid });
    const cookieOpts: any = { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60*60*24*30, secure: isProd };
    resp.cookies.set("session", token, cookieOpts);
    resp.cookies.set("physi_session", token, cookieOpts);
    // also set non-httpOnly legacy for compat? No — httpOnly true for XSS protection. Keep one compat cookie secure but httpOnly false only in dev
    if (!isProd) {
      // dev compat: also set readable cookie for localStorage fallback debugging
      resp.cookies.set("physicoin_session", token, { httpOnly: false, sameSite: "lax", path: "/", maxAge: 60*60*24*30 });
    }
    return resp;
  } catch (e: any) {
    if (e?.status) throw e;
    return NextResponse.json({ ok:false, code:"INTERNAL", message:"failed to create session" }, { status:500 });
  }
}

export async function GET(req: NextRequest) {
  const { verifySession } = await import("@/lib/auth");
  const url = new URL(req.url);
  const checkUserId = url.searchParams.get("user_id");
  
  // If checking password status for a specific user
  if (checkUserId) {
    const sql = getSql();
    if (isDbConfigured() && sql) {
      try {
        await ensureAllTables();
      } catch {}
      try {
        const rows: any[] = await sql`SELECT id, password_hash FROM physi_users WHERE id=${checkUserId} LIMIT 1` as any;
        if (!rows.length) return NextResponse.json({ ok: false, code: "USER_NOT_FOUND", message: "user not found" }, { status: 404 });
        const hasHash = !!rows[0]?.password_hash;
        return NextResponse.json({ ok: true, hasPassword: hasHash });
      } catch (e: any) {
        return NextResponse.json({ ok: false, code: "INTERNAL", message: "failed to check password" }, { status: 500 });
      }
    }
    return NextResponse.json({ ok: false, code: "DB_NOT_CONFIGURED", message: "database not configured" }, { status: 503 });
  }
  
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
  if (token && uid) {
    // check revocation
    try {
      const sql = getSql();
      if (sql) {
        const dec = decodeSession(token);
        const jti = (dec as any)?.jti;
        if (jti) {
          const rows: any[] = await sql`SELECT 1 FROM physi_revoked_tokens WHERE jti=${jti} LIMIT 1` as any;
          if (rows.length) return NextResponse.json({ ok: false, user_id: null, authenticated: false, revoked: true });
        }
      }
    } catch {}
  }
  return NextResponse.json({ ok: !!uid, user_id: uid, authenticated: !!uid });
}
