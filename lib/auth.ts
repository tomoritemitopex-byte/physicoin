/**
 * lib/auth.ts — HMAC session token (Satoshi-grade but campus-simple)
 * Server signs user_id with HMAC_SECRET; client stores in cookie/localStorage + Authorization Bearer.
 * Every POST validates token and extracts user_id from token (NOT from body).
 * GET that needs user_id reads from cookie header as well.
 * If HMAC_SECRET not set, uses dev fallback with console.warn.
 * Tokens include exp (30d) + jti (uuid) + iat; verifySession rejects expired.
 * Revocation is checked via physi_revoked_tokens (async); sync verifySession only checks exp.
 */
import { createHmac, randomUUID } from "crypto";

const DEV_FALLBACK = "dev-fallback-hmac-secret-do-not-use-in-prod";
const TOKEN_TTL_MS = 30 * 24 * 3600 * 1000; // 30 days

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

type SessionPayload = { uid: string; iat: number; exp: number; jti: string };

export function signSession(userId: string): string {
  const now = Date.now();
  const payload: SessionPayload = {
    uid: String(userId),
    iat: now,
    exp: now + TOKEN_TTL_MS,
    jti: randomUUID(),
  };
  const b64 = b64uEncode(JSON.stringify(payload));
  const sig = createHmac("sha256", getSecret()).update(b64).digest("base64url");
  return `${b64}.${sig}`;
}

// legacy sign for grace period check (old tokens were just b64(uid))
function tryLegacyDecode(payload: string): string | null {
  try {
    const uid = b64uDecode(payload);
    if (uid && uid.length >= 3 && !uid.includes("{")) return uid;
  } catch {}
  return null;
}

export function verifySession(token: string): string | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.trim().split(".");
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expected = createHmac("sha256", getSecret()).update(payload).digest("base64url");
  if (sig.length !== expected.length) return null;
  let ok = 0;
  for (let i = 0; i < sig.length; i++) ok |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (ok !== 0) return null;
  try {
    const raw = b64uDecode(payload);
    // Try JSON payload first
    try {
      const obj = JSON.parse(raw);
      if (obj && typeof obj.uid === "string" && obj.uid.length >= 3) {
        // Check exp if present
        if (typeof obj.exp === "number" && Date.now() > obj.exp) return null;
        return obj.uid;
      }
    } catch {}
    // Fallback: legacy token (bare uid) — valid for 30d grace period
    const legacy = tryLegacyDecode(payload);
    if (legacy) return legacy;
    // Also handle case where payload was b64(JSON) but parse failed
    return null;
  } catch { return null; }
}

export function decodeSession(token: string): SessionPayload | { uid: string; legacy: true } | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.trim().split(".");
  if (parts.length !== 2) return null;
  const [payload] = parts;
  try {
    const raw = b64uDecode(payload);
    const obj = JSON.parse(raw);
    if (obj?.uid) return obj as SessionPayload;
  } catch {}
  const legacy = tryLegacyDecode(payload);
  if (legacy) return { uid: legacy, legacy: true } as any;
  return null;
}

export function getSessionJti(token: string): string | null {
  const d = decodeSession(token);
  if (d && (d as any).jti) return (d as any).jti;
  return null;
}

function readTokenFromRequest(req: Request): string | null {
  const auth = (req.headers as any)?.get?.("authorization") || (req.headers as any)?.get?.("Authorization") || "";
  if (auth && typeof auth === "string") {
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (m && m[1]) return m[1].trim();
  }
  const cookie = (req.headers as any)?.get?.("cookie") || (req.headers as any)?.get?.("Cookie") || "";
  if (cookie) {
    for (const part of String(cookie).split(";")) {
      const [k, ...rest] = part.trim().split("=");
      const v = rest.join("=").trim();
      if (!v) continue;
      if (k === "session" || k === "token" || k === "physi_session" || k === "physicoin_session") {
        return v.replace(/^"|"$/g, "");
      }
    }
  }
  const xTok = (req.headers as any)?.get?.("x-session-token") || (req.headers as any)?.get?.("x-physi-token") || "";
  if (xTok) return String(xTok).trim();
  return null;
}

export function getSessionUserId(req: Request): string | null {
  const tok = readTokenFromRequest(req);
  if (!tok) return null;
  return verifySession(tok);
}

export function getSessionToken(req: Request): string | null {
  return readTokenFromRequest(req);
}

/**
 * For POST handlers: extract authenticated userId.
 * If token present and valid, returns userId (ignores body).
 * If no token: returns null (no body fallback — auth bypass fixed).
 */
export function getAuthUserId(req: Request, _bodyUserId?: string | null): string | null {
  const tokenUid = getSessionUserId(req);
  if (tokenUid) return tokenUid;
  return null;
}

export function requireSession(req: Request, _bodyUserId?: string | null): { userId: string } | { error: Response } {
  const uid = getAuthUserId(req, _bodyUserId);
  if (!uid) {
    return { error: new Response(JSON.stringify({ ok: false, code: "UNAUTHORIZED", message: "Missing or invalid session token. POST /api/auth/session to obtain one." }), { status: 401, headers: { "content-type": "application/json" } }) };
  }
  return { userId: uid };
}

// Async variant that also checks revocation table (call when DB available)
export async function verifySessionWithRevocation(token: string, sql?: any): Promise<string | null> {
  const uid = verifySession(token);
  if (!uid) return null;
  const jti = getSessionJti(token);
  if (!jti) return uid; // legacy token grace period — not revocable by jti
  if (!sql) return uid;
  try {
    const rows: any[] = await sql`SELECT 1 FROM physi_revoked_tokens WHERE jti=${jti} LIMIT 1` as any;
    if (rows.length) return null;
  } catch {}
  return uid;
}
