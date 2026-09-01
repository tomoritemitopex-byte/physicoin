/**
 * lib/adapters/features/verify.ts — Verify Feature + Api Adapter
 * Proof receipts: stores is_witness/squad_boost/award for profile scrollable list
 * Satoshi P0: all vote INSERT + quorum + promotion is a single atomic transaction.
 */
import { NextResponse } from "next/server";
import { getSql, isDbConfigured, dbNotConfigured, ensureAllTables } from "@/lib/db";
import { registerApiAdapter } from "../api";
import { registerFeature } from "../features";
import { logError, getErrorMessage } from "../error";
import { GHOST_ACTIONS, appendGhostChain } from "@/lib/ghostWitness";
import { zkThresholdCheck } from "@/lib/zkAuthority";

export const verifyFeature = {
  id: "verify",
  label: "Verify",
  nav: { href: "/app/verify", label: "Verify", short: "✓" },
  apiRoute: "/api/verify",
  description: "Vote YES/NO/CANCEL with authority weight + proof receipts",
};

registerFeature(verifyFeature);

/**
 * Satoshi P0-2: promoteIfQuorum — enforce required_points on the event row.
 * Promotion rule:
 *   canonical iff  yesW >= required_points
 *                AND yes_ratio >= 0.66
 *                AND total >= 3
 * Demotion rule:
 *   if NO votes break ratio < 0.66, flip back to 'pending'
 */
async function promoteIfQuorum(tx: any, eventId: string, verifierId: string): Promise<{ promoted: boolean; demoted: boolean; yesW: number; noW: number; total: number; ratio: number }> {
  // aggregate weighted votes (consistent snapshot within tx)
  const agg = await tx`SELECT vote, SUM(authority_weight)::float as w FROM physi_verifications WHERE event_id=${eventId} GROUP BY vote`;
  let yesW = 0, noW = 0, total = 0;
  for (const row of agg as Array<{vote:string; w:number}>) {
    const weight = Number(row.w) || 0;
    total += weight;
    if (row.vote === "YES") yesW = weight;
    if (row.vote === "NO") noW = weight;
  }
  const ratio = total > 0 ? yesW / total : 0;

  // lock event row to prevent concurrent promotion races
  const [ev] = await tx`SELECT id, status, required_points FROM physi_events WHERE id = ${eventId} FOR UPDATE`;
  if (!ev) return { promoted: false, demoted: false, yesW, noW, total, ratio };

  const required = Number(ev.required_points) || 5;
  const promote = yesW >= required && ratio >= 0.66 && total >= 3;
  const demote = ev.status === "verified" && noW > 0 && ratio < 0.66;

  if (promote && ev.status !== "verified") {
    await tx`UPDATE physi_events SET status='verified', authority_points=${yesW}, required_points=${total}, updated_at=NOW() WHERE id=${eventId}`;
    await tx`INSERT INTO physi_canonical_log (event_id, yes_weight, total_weight, yes_ratio, promoted_by) VALUES (${eventId}, ${yesW}, ${total}, ${ratio}, ${verifierId})`;
  } else if (demote) {
    await tx`UPDATE physi_events SET status='pending', authority_points=${yesW}, required_points=${required}, updated_at=NOW() WHERE id=${eventId}`;
  } else {
    await tx`UPDATE physi_events SET authority_points=${yesW}, required_points=${required}, updated_at=NOW() WHERE id=${eventId}`;
  }

  return { promoted: promote, demoted: demote, yesW, noW, total, ratio };
}

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
        // Satoshi P0-3: atomic transaction — INSERT vote + quorum + promotion all together.
        // Prevents double-spend: two concurrent votes can't both pass quorum.
        // Satoshi P0-1: no string-based authority bonuses — weight is pure authority_final (1.0).
        const result = await sql.transaction(async (tx: any) => {
          // 1. Fetch voter authority
          const [u] = await tx`SELECT authority_final, rep_ghost_sig FROM physi_users WHERE id = ${b.verifier_id} LIMIT 1`;
          if (!u) throw new Error("USER_NOT_FOUND");

          // 2. Compute weight — NO squad boost, NO lecturer bypass, NO string matching
          // NO votes subtract half-weight; CANCEL is witness no-op (0 weight)
          let w = Number((u as any).authority_final) || 1.0;
          if (b.vote === "NO") w = w * 0.5;
          if (b.vote === "CANCEL") w = 0;

          // 3. Insert/replace verification (upsert — one vote per verifier per event)
          const isWitness = b?.is_witness === true || b?.isWitness === true || false;
          const award = Number(b?.award ?? (isWitness ? 1.0 : 0.3));
          const r = await tx`
            INSERT INTO physi_verifications (verifier_id, event_id, vote, authority_weight, is_witness, squad_boost, award)
            VALUES (${b.verifier_id}, ${b.event_id}, ${b.vote}, ${w}, ${isWitness}, false, ${award})
            ON CONFLICT (verifier_id, event_id) DO UPDATE SET vote = EXCLUDED.vote, authority_weight = EXCLUDED.authority_weight, is_witness = EXCLUDED.is_witness, squad_boost = EXCLUDED.squad_boost, award = EXCLUDED.award
            RETURNING *`;

          // 3b. Ghost Witness: extend chain
          try {
            const act = b.vote === "YES" ? GHOST_ACTIONS.VERIFY_YES : b.vote === "NO" ? GHOST_ACTIONS.VERIFY_NO : GHOST_ACTIONS.VERIFY_CANCEL;
            await appendGhostChain(tx, String(b.verifier_id), act);
          } catch {}

          // 4. Quorum check + promotion/demotion (all within same tx — atomic)
          const q = await promoteIfQuorum(tx, b.event_id, b.verifier_id);

          return { verification: r[0], quorum: q };
        });

        // fire-and-forget notify on promotion (never blocks response)
        if (result.quorum.promoted) {
          try {
            const { notifyCanonical } = await import("@/lib/adapters/notify");
            const evRows = await sql`SELECT * FROM physi_events WHERE id=${b.event_id} LIMIT 1`;
            const ev = evRows?.[0] as Record<string, unknown> | undefined;
            if (ev) {
              notifyCanonical({
                id: String(ev.id ?? b.event_id),
                title: String((ev as {title?:string}).title ?? ""),
                venue: String((ev as {venue?:string}).venue ?? ""),
                event_date: String((ev as {event_date?:string}).event_date ?? ""),
                event_time: String((ev as {event_time?:string}).event_time ?? ""),
                yes_weight: result.quorum.yesW,
                total_weight: result.quorum.total,
                yes_ratio: result.quorum.ratio,
              }).catch(()=>{});
            }
          } catch {}
        }

        return NextResponse.json({ ok: true, verification: result.verification, quorum: result.quorum });
      } catch (e: unknown) {
        if (String((e as Error).message).includes("USER_NOT_FOUND")) {
          return NextResponse.json({ ok: false, code: "USER_NOT_FOUND", message: getErrorMessage("USER_NOT_FOUND") }, { status: 404 });
        }
        if (String((e as Error).message).includes("EVENT_NOT_FOUND")) {
          return NextResponse.json({ ok: false, code: "NOT_FOUND", message: getErrorMessage("NOT_FOUND") }, { status: 404 });
        }
        logError("VERIFY_FAILED", e, { route: "/api/verify", method: "POST" });
        return NextResponse.json({ ok: false, code: "VERIFY_FAILED", message: getErrorMessage("VERIFY_FAILED") }, { status: 500 });
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
    // Satoshi P0-2 enforcement: GET ?event_id= returns recomputed quorum so any peer
    // can verify why an event is or isn't green.
    if (!eid) return NextResponse.json({ ok: false, code: "BAD_INPUT", message: getErrorMessage("BAD_INPUT") }, { status: 400 });
    try {
      const vRows = await sql`SELECT * FROM physi_verifications WHERE event_id = ${eid} ORDER BY created_at DESC`;
      const evRows = await sql`SELECT * FROM physi_events WHERE id = ${eid} LIMIT 1`;
      if (!evRows.length) return NextResponse.json({ ok: false, code: "NOT_FOUND", message: getErrorMessage("NOT_FOUND") }, { status: 404 });
      const ev = evRows[0] as Record<string, unknown>;
      // recompute quorum deterministically from DB
      const agg = await sql`SELECT vote, SUM(authority_weight)::float as w FROM physi_verifications WHERE event_id=${eid} GROUP BY vote`;
      let yesW = 0, noW = 0, total = 0;
      for (const row of agg as Array<{vote:string; w:number}>) {
        const weight = Number(row.w) || 0;
        total += weight;
        if (row.vote === "YES") yesW = weight;
        if (row.vote === "NO") noW = weight;
      }
      const ratio = total > 0 ? yesW / total : 0;
      const required = Number(ev.required_points) || 5;
      const quorum = {
        yesW, noW, total, ratio, required,
        promoted: yesW >= required && ratio >= 0.66 && total >= 3,
        demoted: ev.status === "verified" && noW > 0 && ratio < 0.66,
        status: ev.status,
      };
      return NextResponse.json({ ok: true, event: ev, verifications: vRows, quorum });
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
