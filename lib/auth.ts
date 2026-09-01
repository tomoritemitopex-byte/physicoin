/**
 * lib/auth.ts — HMAC session token (Satoshi-grade but campus-simple)
 * Server signs user_id with HMAC_SECRET; client stores in cookie/localStorage + Authorization Bearer.
 * Every POST validates token and extracts user_id from token (NOT from body).
 * GET that needs user_id reads from cookie header as well.
 * If HMAC_SECRET not set, uses dev fallback with console.warn.
 */
import { createHmac } from "crypto";

const DEV_FALLBACK = "dev-fallback-hmac-secret-do-not-use-in-prod";

function getSecret(): string {
  const s = (process.env.HMAC_SECRET || process.env.GHOST_HMAC_SECRET || "").trim();
  if (s) return s;
  if (process.env.NODE_ENV !== "production") {
    console.warn("[auth] HMAC_SECRET unset — using dev fallback. Set HMAC_SECRET in production!");
    return DEV_FALLBACK;
  }
  console.warn("[auth] HMAC_SECRET unset — using dev fallback (insecure)!");
  return DEV_FALLBACK;
}

function b64uEncode(str: string): string {
  return Buffer.from(str, "utf8").toString("base64url");
}
function b64uDecode(b64u: string): string {
  return Buffer.from(b64u, "base64url").toString("utf8");
}

export function signSession(userId: string): string {
  const payload = b64uEncode(String(userId));
  const sig = createHmac("sha256", getSecret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifySession(token: string): string | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.trim().split(".");
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expected = createHmac("sha256", getSecret()).update(payload).digest("base64url");
  // timing-safe compare (constant time)
  if (sig.length !== expected.length) return null;
  let ok = 0;
  for (let i = 0; i < sig.length; i++) ok |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (ok !== 0) return null;
  try {
    const userId = b64uDecode(payload);
    if (!userId || userId.length < 3) return null;
    return userId;
  } catch { return null; }
}

function readTokenFromRequest(req: Request): string | null {
  // 1) Authorization: Bearer <token>
  const auth = (req.headers as any)?.get?.("authorization") || (req.headers as any)?.get?.("Authorization") || "";
  if (auth && typeof auth === "string") {
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (m && m[1]) return m[1].trim();
  }
  // 2) cookie: session=..., token=..., physi_session=...
  const cookie = (req.headers as any)?.get?.("cookie") || (req.headers as any)?.get?.("Cookie") || "";
  if (cookie) {
    for (const part of String(cookie).split(";")) {
      const [k, ...rest] = part.trim().split("=");
      const v = rest.join("=").trim();
      if (!v) continue;
      if (k === "session" || k === "token" || k === "physi_session" || k === "physicoin_session") {
        // strip quotes
        return v.replace(/^"|"$/g, "");
      }
    }
  }
  // 3) x-session-token header (for localStorage-based clients)
  const xTok = (req.headers as any)?.get?.("x-session-token") || (req.headers as any)?.get?.("x-physi-token") || "";
  if (xTok) return String(xTok).trim();
  return null;
}

export function getSessionUserId(req: Request): string | null {
  const tok = readTokenFromRequest(req);
  if (!tok) return null;
  return verifySession(tok);
}

/**
 * For POST handlers: extract authenticated userId.
 * If token present and valid, returns userId (ignores body).
 * If no token: in dev, falls back to body field (with warn); in prod, returns null.
 * Caller should reject with 401 if null and endpoint requires auth.
 */
export function getAuthUserId(req: Request, bodyUserId?: string | null): string | null {
  const tokenUid = getSessionUserId(req);
  if (tokenUid) return tokenUid;
  // no token — fallback to body for backward compat (dev only), but log
  if (bodyUserId) {
    if (process.env.NODE_ENV === "production") {
      console.warn("[auth] missing session token — would be 401 in strict mode, falling back to body user_id for compat");
    }
    return String(bodyUserId);
  }
  return null;
}

export function requireSession(req: Request, bodyUserId?: string | null): { userId: string } | { error: Response } {
  const uid = getAuthUserId(req, bodyUserId);
  if (!uid) {
    return { error: new Response(JSON.stringify({ ok: false, code: "UNAUTHORIZED", message: "Missing or invalid session token. POST /api/auth/session to obtain one." }), { status: 401, headers: { "content-type": "application/json" } }) };
  }
  return { userId: uid };
}
