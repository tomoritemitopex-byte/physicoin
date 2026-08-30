/**
 * lib/adapters/features/verify.ts — Verify Feature + Api Adapter
 * Proof receipts: stores is_witness/squad_boost/award for profile scrollable list
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
  description: "Vote YES/NO/CANCEL with authority weight + proof receipts",
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
        const u = await sql`SELECT authority_final, nickname FROM physi_users WHERE id = ${b.verifier_id} LIMIT 1`;
        if (!u.length) return NextResponse.json({ ok: false, code: "USER_NOT_FOUND", message: getErrorMessage("USER_NOT_FOUND") }, { status: 404 });
        let w = Number((u[0] as { authority_final?: number }).authority_final ?? 1.0);
        // --- Squad sup-quorum: if body.squad===true and vote YES on own gist, 1.5x weight ---
        const isSquadBoost = b?.squad === true && String(b.vote).toUpperCase() === "YES";
        if (isSquadBoost) w = Number((w * 1.5).toFixed(2));
        // --- Lecturer emerald bypass: if lecturer + official pin, treat as 8/8 weight override ---
        const isLecturerEmerald = b?.lecturer === true && b?.emerald === true && String(b.vote).toUpperCase() === "YES";
        if (isLecturerEmerald) w = Math.max(w, 8);
        // proof receipts fields
        const isWitness = b?.is_witness === true || b?.isWitness === true || false;
        const award = Number(b?.award ?? (isWitness ? 1.0 : 0.3));
        try {
          const r = await sql`
        INSERT INTO physi_verifications (verifier_id, event_id, vote, authority_weight, is_witness, squad_boost, award)
        VALUES (${b.verifier_id}, ${b.event_id}, ${b.vote}, ${w}, ${isWitness}, ${isSquadBoost}, ${award})
        ON CONFLICT (verifier_id, event_id) DO UPDATE SET vote = EXCLUDED.vote, authority_weight = EXCLUDED.authority_weight, is_witness = EXCLUDED.is_witness, squad_boost = EXCLUDED.squad_boost, award = EXCLUDED.award
        RETURNING *`;
          // quorum check + canonical promotion + notify (fire-and-forget, never blocks response)
          try {
            const agg = await sql`SELECT vote, SUM(authority_weight)::float as w FROM physi_verifications WHERE event_id=${b.event_id} GROUP BY vote`;
            let yesW = 0, noW = 0, total = 0;
            for (const row of agg as Array<{vote:string; w:number}>) {
              const weight = Number(row.w) || 0;
              total += weight;
              if (row.vote === "YES") yesW = weight;
              if (row.vote === "NO") noW = weight;
            }
            let ratio = total > 0 ? yesW / total : 0;
            // quorum: at least 3 YES weight (or 3 votes) and >=60% YES, total >=3
            let quorumReached = yesW >= 3 && ratio >= 0.6 && total >= 3;
            // lecturer emerald bypass — force 8/8 canonical regardless of quorum math
            const emeraldBypass = (b as any)?.lecturer === true && (b as any)?.emerald === true && String(b.vote).toUpperCase()==="YES";
            if (emeraldBypass) { yesW = 8; total = 8; ratio = 1; quorumReached = true; }
            if (quorumReached) {
              const evRows = await sql`SELECT * FROM physi_events WHERE id=${b.event_id} LIMIT 1`;
              const ev = evRows?.[0] as Record<string, unknown> | undefined;
              if (ev && ev.status !== "verified") {
                await sql`UPDATE physi_events SET status='verified', authority_points=${yesW}, required_points=${total}, updated_at=NOW() WHERE id=${b.event_id}`;
                try { await sql`INSERT INTO physi_canonical_log (event_id, yes_weight, total_weight, yes_ratio, promoted_by) VALUES (${b.event_id}, ${yesW}, ${total}, ${ratio}, ${b.verifier_id})`; } catch {}
                // notify canonical (Telegram or log)
                try {
                  const { notifyCanonical } = await import("@/lib/adapters/notify");
                  notifyCanonical({ id: String(ev.id ?? b.event_id), title: String((ev as {title?:string}).title ?? ""), venue: String((ev as {venue?:string}).venue ?? ""), event_date: String((ev as {event_date?:string}).event_date ?? ""), event_time: String((ev as {event_time?:string}).event_time ?? ""), yes_weight: yesW, total_weight: total, yes_ratio: ratio }).catch(()=>{});
                } catch {}
              }
            }
          } catch (e) { console.warn("[verify] quorum check failed:", (e as Error).message); }
          return NextResponse.json({ ok: true, verification: r[0] });
        } catch (e: unknown) {
          logError("VERIFY_FAILED", e, { route: "/api/verify", method: "POST" });
          return NextResponse.json({ ok: false, code: "VERIFY_FAILED", message: getErrorMessage("VERIFY_FAILED") }, { status: 500 });
        }
      } catch (e) {
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
    const url = new URL(req.url);
    const eid = url.searchParams.get("event_id");
    const vid = url.searchParams.get("verifier_id") || url.searchParams.get("user_id");
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20",10)||20,50);
    // proof receipts: fetch by verifier_id with join to events
    if (vid) {
      try {
        const rows = await sql`
          SELECT v.*, e.title as event_title, e.venue as event_venue, e.event_date, e.event_time, e.severity as event_severity
          FROM physi_verifications v
          LEFT JOIN physi_events e ON e.id = v.event_id
          WHERE v.verifier_id = ${vid}
          ORDER BY v.created_at DESC LIMIT ${limit}`;
        return NextResponse.json({ ok:true, proofs: rows, verifications: rows });
      } catch(e){ logError("VERIFY_FETCH_FAILED", e, {route:"/api/verify", method:"GET"}); return NextResponse.json({ ok:false, code:"VERIFY_FETCH_FAILED", message:getErrorMessage("VERIFY_FETCH_FAILED")},{status:500}); }
    }
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
