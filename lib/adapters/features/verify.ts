/**
 * lib/adapters/features/verify.ts — Verify Feature + Api Adapter
 */
import { NextResponse } from "next/server";
import { getSql, isDbConfigured, dbNotConfigured, ensureAllTables } from "@/lib/db";
import { registerApiAdapter } from "../api";
import { registerFeature } from "../features";

export const verifyFeature = {
  id: "verify",
  label: "Verify",
  nav: { href: "/app/verify", label: "Verify", short: "✓" },
  apiRoute: "/api/verify",
  description: "Vote YES/NO/CANCEL with authority weight",
};

registerFeature(verifyFeature);

async function handleVerify(req: Request): Promise<Response> {
  const sql = getSql();
  if (!isDbConfigured() || !sql) return NextResponse.json(dbNotConfigured(), { status: 503 });
  if (req.method === "POST") {
    await ensureAllTables();
    const b = await req.json().catch(() => null);
    if (!b?.verifier_id || !b?.event_id || !b?.vote) {
      return NextResponse.json({ ok: false, code: "BAD_INPUT", error: "verifier_id, event_id, vote required" }, { status: 400 });
    }
    if (!["YES", "NO", "CANCEL"].includes(b.vote)) {
      return NextResponse.json({ ok: false, code: "BAD_VOTE", error: "vote must be YES|NO|CANCEL" }, { status: 400 });
    }
    const u = await sql`SELECT authority_final FROM physi_users WHERE id = ${b.verifier_id} LIMIT 1`;
    if (!u.length) return NextResponse.json({ ok: false, code: "USER_NOT_FOUND" }, { status: 404 });
    const w = Number((u[0] as { authority_final?: number }).authority_final ?? 1.0);
    try {
      const r = await sql`
        INSERT INTO physi_verifications (verifier_id, event_id, vote, authority_weight)
        VALUES (${b.verifier_id}, ${b.event_id}, ${b.vote}, ${w})
        ON CONFLICT (verifier_id, event_id) DO UPDATE SET vote = EXCLUDED.vote, authority_weight = EXCLUDED.authority_weight
        RETURNING *`;
      return NextResponse.json({ ok: true, verification: r[0] });
    } catch (e: unknown) {
      return NextResponse.json({ ok: false, code: "VERIFY_FAILED", error: (e as Error).message }, { status: 500 });
    }
  }
  // GET
  try {
    await ensureAllTables();
  } catch {}
  const eid = new URL(req.url).searchParams.get("event_id");
  if (!eid) return NextResponse.json({ ok: false, code: "BAD_INPUT", error: "event_id required" }, { status: 400 });
  const rows = await sql`SELECT * FROM physi_verifications WHERE event_id = ${eid} ORDER BY created_at DESC`;
  return NextResponse.json({ ok: true, verifications: rows });
}

registerApiAdapter({
  id: "verify",
  route: "/api/verify",
  label: "Verify API",
  handle: handleVerify,
});
