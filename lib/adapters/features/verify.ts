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
import { GHOST_ACTIONS, prepareGhostChainQueries, buildGhostChainSigs } from "@/lib/ghostWitness";
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
 * Refactored: prepares query promises then returns them as array (no sequential awaits).
 */
async function promoteIfQuorum(tx: any, eventId: string, verifierId: string): Promise<{ promoted: boolean; demoted: boolean; yesW: number; noW: number; total: number; ratio: number }> {
  // aggregate weighted votes (consistent snapshot — caller should have fetched before tx in batch mode)
  // For backwards compat, still supports sequential mode but prepares queries
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

  // Prepare query promises (no sequential awaits — batch via Promise.all)
  const queries: any[] = [];
  if (promote && ev.status !== "verified") {
    const q1 = tx`UPDATE physi_events SET status='verified', authority_points=${yesW}, required_points=${total}, updated_at=NOW() WHERE id=${eventId}`;
    const q2 = tx`INSERT INTO physi_canonical_log (event_id, yes_weight, total_weight, yes_ratio, promoted_by) VALUES (${eventId}, ${yesW}, ${total}, ${ratio}, ${verifierId})`;
    queries.push(q1, q2);
  } else if (demote) {
    const q1 = tx`UPDATE physi_events SET status='pending', authority_points=${yesW}, required_points=${required}, updated_at=NOW() WHERE id=${eventId}`;
    queries.push(q1);
  } else {
    const q1 = tx`UPDATE physi_events SET authority_points=${yesW}, required_points=${required}, updated_at=NOW() WHERE id=${eventId}`;
    queries.push(q1);
  }
  try { await Promise.all(queries.map((q: any) => q.catch(() => null))); } catch {}

  return { promoted: promote, demoted: demote, yesW, noW, total, ratio };
}

/**
 * Pure helper: compute promotion decision from pre-fetched aggregates and event row.
 * Used for Neon HTTP batch transaction where reads must happen before tx.
 */
function computePromotion(
  agg: Array<{ vote: string; w: number }>,
  ev: { id: string; status: string; required_points: number } | null,
  projectedYesW: number,
  projectedNoW: number,
  projectedTotal: number
): { promoted: boolean; demoted: boolean; yesW: number; noW: number; total: number; ratio: number; required: number } {
  let yesW = projectedYesW;
  let noW = projectedNoW;
  let total = projectedTotal;
  // If no projection supplied, compute from agg
  if (projectedTotal === -1) {
    yesW = 0; noW = 0; total = 0;
    for (const row of agg) {
      const weight = Number(row.w) || 0;
      total += weight;
      if (row.vote === "YES") yesW = weight;
      if (row.vote === "NO") noW = weight;
    }
  }
  const ratio = total > 0 ? yesW / total : 0;
  if (!ev) return { promoted: false, demoted: false, yesW, noW, total, ratio, required: 5 };
  const required = Number(ev.required_points) || 5;
  const promote = yesW >= required && ratio >= 0.66 && total >= 3;
  const demote = ev.status === "verified" && noW > 0 && ratio < 0.66;
  return { promoted: promote, demoted: demote, yesW, noW, total, ratio, required };
}

/**
 * Prepare promotion query promises (no sequential awaits)
 */
function preparePromotionQueries(
  tx: any,
  eventId: string,
  verifierId: string,
  decision: { promoted: boolean; demoted: boolean; yesW: number; total: number; ratio: number; required: number },
  evStatus: string
): any[] {
  const queries: any[] = [];
  if (decision.promoted && evStatus !== "verified") {
    const q1 = tx`UPDATE physi_events SET status='verified', authority_points=${decision.yesW}, required_points=${decision.total}, updated_at=NOW() WHERE id=${eventId}`;
    const q2 = tx`INSERT INTO physi_canonical_log (event_id, yes_weight, total_weight, yes_ratio, promoted_by) VALUES (${eventId}, ${decision.yesW}, ${decision.total}, ${decision.ratio}, ${verifierId})`;
    queries.push(q1, q2);
  } else if (decision.demoted) {
    const q1 = tx`UPDATE physi_events SET status='pending', authority_points=${decision.yesW}, required_points=${decision.required}, updated_at=NOW() WHERE id=${eventId}`;
    queries.push(q1);
  } else {
    const q1 = tx`UPDATE physi_events SET authority_points=${decision.yesW}, required_points=${decision.required}, updated_at=NOW() WHERE id=${eventId}`;
    queries.push(q1);
  }
  return queries;
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
      // Auth: extract verifier_id from HMAC session (not body)
      const { getAuthUserId } = await import("@/lib/auth");
      const authUid = getAuthUserId(req as Request, b?.verifier_id || b?.verifierId);
      if (!authUid) return NextResponse.json({ ok:false, code:"UNAUTHORIZED", message:"Missing session token. POST /api/auth/session to obtain one." }, { status:401 });
      // override body verifier_id with authenticated id
      if (b) b.verifier_id = authUid;
      if (!b?.verifier_id || !b?.event_id || !b?.vote) {
        return NextResponse.json({ ok: false, code: "BAD_INPUT", message: getErrorMessage("BAD_INPUT") }, { status: 400 });
      }
      if (!["YES", "NO", "CANCEL"].includes(b.vote)) {
        return NextResponse.json({ ok: false, code: "BAD_VOTE", message: getErrorMessage("BAD_VOTE") }, { status: 400 });
      }
      try {
        // --- Pre-transaction reads & pure computation (Neon HTTP batch requires non-async tx fn) ---
        const [u] = await sql`SELECT authority_final, rep_ghost_sig FROM physi_users WHERE id = ${b.verifier_id} LIMIT 1`;
        if (!u) throw new Error("USER_NOT_FOUND");

        let w = Number((u as any).authority_final) || 1.0;
        if (b.vote === "NO") w = w * 0.5;
        if (b.vote === "CANCEL") w = 0;

        const isWitness = b?.is_witness === true || b?.isWitness === true || false;
        const award = Number(b?.award ?? (isWitness ? 1.0 : 0.3));

        const act = b.vote === "YES" ? GHOST_ACTIONS.VERIFY_YES : b.vote === "NO" ? GHOST_ACTIONS.VERIFY_NO : GHOST_ACTIONS.VERIFY_CANCEL;
        const prevSig = (u as any).rep_ghost_sig ?? null;
        const ghostBuild = buildGhostChainSigs(prevSig, act, String(b.verifier_id));

        // Fetch existing verification to compute delta
        let existingVerif: { vote: string; authority_weight: number } | null = null;
        try {
          const rows = await sql`SELECT vote, authority_weight FROM physi_verifications WHERE verifier_id=${b.verifier_id} AND event_id=${b.event_id} LIMIT 1`;
          if (rows.length) existingVerif = rows[0] as any;
        } catch {}

        // Fetch current aggregates
        let agg: Array<{ vote: string; w: number }> = [];
        try {
          const rows = await sql`SELECT vote, SUM(authority_weight)::float as w FROM physi_verifications WHERE event_id=${b.event_id} GROUP BY vote`;
          agg = rows as any;
        } catch {}

        // Compute projected aggregates after upsert
        let yesW = 0, noW = 0, total = 0;
        for (const row of agg) {
          const weight = Number((row as any).w) || 0;
          total += weight;
          if (row.vote === "YES") yesW = weight;
          if (row.vote === "NO") noW = weight;
        }
        if (existingVerif) {
          const oldW = Number((existingVerif as any).authority_weight) || 0;
          total -= oldW;
          if ((existingVerif as any).vote === "YES") yesW -= oldW;
          if ((existingVerif as any).vote === "NO") noW -= oldW;
        }
        if (b.vote === "YES") { yesW += w; total += w; }
        else if (b.vote === "NO") { noW += w; total += w; }
        // CANCEL adds 0

        const ratio = total > 0 ? yesW / total : 0;

        // Fetch event row
        let ev: { id: string; status: string; required_points: number } | null = null;
        try {
          const rows = await sql`SELECT id, status, required_points FROM physi_events WHERE id = ${b.event_id} LIMIT 1`;
          if (rows.length) ev = rows[0] as any;
        } catch {}
        if (!ev) throw new Error("EVENT_NOT_FOUND");

        const required = Number((ev as any).required_points) || 5;
        const promote = yesW >= required && ratio >= 0.66 && total >= 3;
        const demote = (ev as any).status === "verified" && noW > 0 && ratio < 0.66;
        const quorumDecision = { promoted: promote, demoted: demote, yesW, noW, total, ratio, required };

        // --- Transactional batch: prepare query promises then return as array (Neon HTTP correct pattern) ---
        const txResults = await sql.transaction((tx: any) => {
          const queries: any[] = [];
          // 1. Insert/replace verification (upsert — one vote per verifier per event)
          const verifQ = tx`
            INSERT INTO physi_verifications (verifier_id, event_id, vote, authority_weight, is_witness, squad_boost, award)
            VALUES (${b.verifier_id}, ${b.event_id}, ${b.vote}, ${w}, ${isWitness}, false, ${award})
            ON CONFLICT (verifier_id, event_id) DO UPDATE SET vote = EXCLUDED.vote, authority_weight = EXCLUDED.authority_weight, is_witness = EXCLUDED.is_witness, squad_boost = EXCLUDED.squad_boost, award = EXCLUDED.award
            RETURNING *`;
          queries.push(verifQ);

          // 2. Ghost Witness: extend chain (prepare queries)
          const ghostQueries = prepareGhostChainQueries(tx, String(b.verifier_id), act, ghostBuild.prev, ghostBuild.newSig, ghostBuild.timestamp);
          queries.push(...ghostQueries);

          // 3. Quorum check + promotion/demotion (prepare queries based on pre-computed decision)
          const promoQueries = preparePromotionQueries(tx, b.event_id, b.verifier_id, quorumDecision, (ev as any).status);
          queries.push(...promoQueries);

          return queries;
        });

        const verification = (txResults as any[])[0]?.[0] ?? null;
        const quorum = { promoted: promote, demoted: demote, yesW, noW, total, ratio };
        const result = { verification, quorum };

        // RBF: also tally vote into physi_slot_claims if event is in active mempool
        try {
          const evSlotRows: any[] = await sql`SELECT slot_key, venue, status FROM physi_events WHERE id=${b.event_id} LIMIT 1` as any;
          const sk = evSlotRows[0]?.slot_key;
          const venue = evSlotRows[0]?.venue;
          const st = evSlotRows[0]?.status;
          if (sk && st === 'pending') {
            if (b.vote === 'YES') {
              try { await sql`UPDATE physi_slot_claims SET vote_weight_yes = vote_weight_yes + ${w} WHERE slot_key=${sk} AND lower(venue)=lower(${venue})`; } catch {}
              try { await sql`UPDATE physi_slot_claims SET vote_weight_yes = vote_weight_yes + ${w} WHERE event_id=${b.event_id}`; } catch {}
            } else if (b.vote === 'NO') {
              try { await sql`UPDATE physi_slot_claims SET vote_weight_no = vote_weight_no + ${w} WHERE slot_key=${sk} AND lower(venue)=lower(${venue})`; } catch {}
              try { await sql`UPDATE physi_slot_claims SET vote_weight_no = vote_weight_no + ${w} WHERE event_id=${b.event_id}`; } catch {}
            }
          }
        } catch {}

        // fire-and-forget notify on promotion (never blocks response)
        if (result.quorum.promoted) {
          try {
            const { notifyCanonical } = await import("@/lib/adapters/notify");
            const evRows = await sql`SELECT * FROM physi_events WHERE id=${b.event_id} LIMIT 1`;
            const ev2 = evRows?.[0] as Record<string, unknown> | undefined;
            if (ev2) {
              notifyCanonical({
                id: String(ev2.id ?? b.event_id),
                title: String((ev2 as {title?:string}).title ?? ""),
                venue: String((ev2 as {venue?:string}).venue ?? ""),
                event_date: String((ev2 as {event_date?:string}).event_date ?? ""),
                event_time: String((ev2 as {event_time?:string}).event_time ?? ""),
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
