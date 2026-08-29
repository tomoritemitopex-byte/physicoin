/**
 * lib/adapters/features/verify.ts — Verify Feature + Api Adapter
 */
import { NextResponse } from "next/server";
import { getSql, isDbConfigured, dbNotConfigured, ensureAllTables } from "@/lib/db";
import { registerApiAdapter } from "../api";
import { registerFeature } from "../features";
import { logError, getErrorMessage } from "../error";

export const verifyFeature = {
  id: "verify",
  label: "Verify",
  nav: { href: "/app/verify", label: "Verify", short: "✓" },
  apiRoute: "/api/verify",
  description: "Vote YES/NO/CANCEL with authority weight",
};

registerFeature(verifyFeature);

async function handleVerify(req: Request): Promise<Response> {
  try {
    const sql = getSql();
    if (!isDbConfigured() || !sql) return NextResponse.json(dbNotConfigured(), { status: 503 });
    if (req.method === "POST") {
      try {
        await ensureAllTables();
      } catch (e) {
        logError("VERIFY_SUBMIT_FAILED", e, { route: "/api/verify", phase: "ensure" });
      }
      const b = await req.json().catch(() => null);
      if (!b?.verifier_id || !b?.event_id || !b?.vote) {
        return NextResponse.json({ ok: false, code: "BAD_INPUT", message: getErrorMessage("BAD_INPUT") }, { status: 400 });
      }
      if (!["YES", "NO", "CANCEL"].includes(b.vote)) {
        return NextResponse.json({ ok: false, code: "BAD_VOTE", message: getErrorMessage("BAD_VOTE") }, { status: 400 });
      }
      try {
        const u = await sql`SELECT authority_final FROM physi_users WHERE id = ${b.verifier_id} LIMIT 1`;
        if (!u.length) return NextResponse.json({ ok: false, code: "USER_NOT_FOUND", message: getErrorMessage("USER_NOT_FOUND") }, { status: 404 });
        const w = Number((u[0] as { authority_final?: number }).authority_final ?? 1.0);
        try {
          const r = await sql`
        INSERT INTO physi_verifications (verifier_id, event_id, vote, authority_weight)
        VALUES (${b.verifier_id}, ${b.event_id}, ${b.vote}, ${w})
        ON CONFLICT (verifier_id, event_id) DO UPDATE SET vote = EXCLUDED.vote, authority_weight = EXCLUDED.authority_weight
        RETURNING *`;
          return NextResponse.json({ ok: true, verification: r[0] });
        } catch (e: unknown) {
          logError("VERIFY_FAILED", e, { route: "/api/verify", method: "POST" });
          return NextResponse.json({ ok: false, code: "VERIFY_FAILED", message: getErrorMessage("VERIFY_FAILED") }, { status: 500 });
        }
      } catch (e) {
        // user lookup failure
        logError("VERIFY_SUBMIT_FAILED", e, { route: "/api/verify", method: "POST" });
        return NextResponse.json({ ok: false, code: "VERIFY_SUBMIT_FAILED", message: getErrorMessage("VERIFY_SUBMIT_FAILED") }, { status: 500 });
      }
    }
    // GET
    try {
      await ensureAllTables();
    } catch (e) {
      logError("VERIFY_FETCH_FAILED", e, { route: "/api/verify", phase: "ensure" });
    }
    const eid = new URL(req.url).searchParams.get("event_id");
    if (!eid) return NextResponse.json({ ok: false, code: "BAD_INPUT", message: getErrorMessage("BAD_INPUT") }, { status: 400 });
    try {
      const rows = await sql`SELECT * FROM physi_verifications WHERE event_id = ${eid} ORDER BY created_at DESC`;
      return NextResponse.json({ ok: true, verifications: rows });
    } catch (e) {
      logError("VERIFY_FETCH_FAILED", e, { route: "/api/verify", method: "GET" });
      return NextResponse.json({ ok: false, code: "VERIFY_FETCH_FAILED", message: getErrorMessage("VERIFY_FETCH_FAILED") }, { status: 500 });
    }
  } catch (e) {
    logError("INTERNAL", e, { route: "/api/verify", method: req.method });
    return NextResponse.json({ ok: false, code: "INTERNAL", message: getErrorMessage("INTERNAL") }, { status: 500 });
  }
}

registerApiAdapter({
  id: "verify",
  route: "/api/verify",
  label: "Verify API",
  handle: handleVerify,
});
