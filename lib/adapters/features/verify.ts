/**
 * lib/adapters/features/verify.ts — Verify Feature + Api Adapter
 * Proof receipts: stores is_witness/squad_boost/award for profile scrollable list
 * Satoshi P0: all vote INSERT + quorum + promotion is a single atomic transaction.
 */
import { NextResponse } from "next/server";
import { getSql, isDbConfigured, dbNotConfigured, } from "@/lib/db";
import { registerApiAdapter } from "../api";
import { registerFeature } from "../features";
import { logError, getErrorMessage, isMissingTable } from "../error";
import { GHOST_ACTIONS, prepareGhostChainQueries, buildGhostChainSigs } from "@/lib/ghostWitness";
import { BEDROCK_V5, tallyBucket, computeBadge } from "@/lib/bedrock";
// NOTE (inverted-audit P1 K-P3): no ZK import on purpose — see timetable.ts note.

export const verifyFeature = {
  id: "verify",
  label: "Verify",
  // Inverted-audit P1 (K-C5): voting happens on /app/timetable (Yes/No on the
  // card) — there is no /app/verify page, so the nav points at the real
  // surface instead of a 404. See docs/spot-check.md §6.
  nav: { href: "/app/timetable", label: "Verify", short: "✓" },
  apiRoute: "/api/verify",
  description: "Vote YES/NO/CANCEL with authority weight + proof receipts",
};

registerFeature(verifyFeature);

const GENESIS_REQUIRED = 5; // container seed, not coded data — retarget moves it after genesis
/** Satoshi Test 1: required_points is NOT a constant — dynamic retarget via
 *  recent network average (7-day window), bounded 3..12. Falls back to genesis
 *  only when no history exists.
 */

/**
 * Promotion rule (LIVE — enforced via computePromotion + preparePromotionQueries
 * inside the vote transaction):
 *   canonical iff  yesW >= required_points (dynamic, not hardcoded)
 *                AND yes_ratio >= 0.66
 *                AND total >= 3 (anti-triviality floor, NOT the quorum)
 * Demotion rule:
 *   if NO votes break ratio < 0.66, flip back to 'pending'
 * Inverted-audit P0 (K-C2) reconciliation: the student-facing "8 classmates"
 * promise refers to the scope-merge protocol (QUORUM_MIN=8 in /api/scopes);
 * the per-event green tick uses required_points (dynamic 3..12, seeded 3/5 on
 * create). Both numbers are exposed in every quorum response ({required,
 * yesW, total, ratio}) and the UI binds "needs N more" to `required`
 * (see app/app/timetable/page.tsx quorum(), WindingRoad tally text).
 */

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
  if (!ev) return { promoted: false, demoted: false, yesW, noW, total, ratio, required: Math.max(3, Math.min(8, Math.ceil(total/2)+2)) };
  let required = Number(ev.required_points) || 0;
  if (!required) required = Math.max(3, Math.min(12, Math.round(total * 0.6 + 2)));
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

/**
 * BEDROCK v5.0: flag/counter/unflag actions. One row per (event, member);
 * flag-then-counter flips the row kind. Blind to the crowd (counts only in
 * badge payloads); named to the roster creator via GET ?flags=1.
 */
async function handleFlagAction(sql: any, eventId: string, userId: string, action: string): Promise<Response> {
  if (!BEDROCK_V5.blindFlags) {
    return NextResponse.json({ ok: false, code: "FLAGS_OFF", message: "Flagging is temporarily disabled." }, { status: 503 });
  }
  if (!eventId) return NextResponse.json({ ok: false, code: "BAD_INPUT", message: getErrorMessage("BAD_INPUT") }, { status: 400 });
  try {
    const er: any[] = await sql`SELECT id, roster_id FROM physi_events WHERE id=${eventId} LIMIT 1` as any;
    if (!er.length) return NextResponse.json({ ok: false, code: "NOT_FOUND", message: getErrorMessage("NOT_FOUND") }, { status: 404 });
    const rid = (er[0] as any)?.roster_id;
    if (rid) {
      const { isRosterMember } = await import("./roster");
      if (!(await isRosterMember(sql, String(rid), userId))) {
        return NextResponse.json({ ok: false, code: "ROSTER_ONLY", message: getErrorMessage("ROSTER_ONLY") }, { status: 403 });
      }
    }
    if (action === "unflag") {
      await sql`DELETE FROM physi_tick_flags WHERE event_id=${eventId} AND flagger_id=${userId}`;
      return NextResponse.json({ ok: true, removed: true });
    }
    await sql`INSERT INTO physi_tick_flags (event_id, flagger_id, kind) VALUES (${eventId}, ${userId}, ${action}) ON CONFLICT (event_id, flagger_id) DO UPDATE SET kind=${action}, created_at=NOW()`;
    return NextResponse.json({ ok: true, flagged: action });
  } catch (e) {
    if (isMissingTable(e)) {
      return NextResponse.json({ ok: false, code: "TABLE_NOT_READY", message: "Flag tables not ready — redeploy to run migration." }, { status: 503 });
    }
    logError("FLAG_FAILED", e, { route: "/api/verify", eventId });
    return NextResponse.json({ ok: false, code: "INTERNAL", message: getErrorMessage("INTERNAL") }, { status: 500 });
  }
}

async function handleVerify(req: Request): Promise<Response> {
  try {
    const sql = getSql();
    if (!isDbConfigured() || !sql) return NextResponse.json(dbNotConfigured(), { status: 503 });
    if (req.method === "POST") {
      try {
      } catch (e) {
        logError("VERIFY_SUBMIT_FAILED", e, { route: "/api/verify", phase: "ensure" });
      }
      const b = await req.json().catch(() => null);
      // Auth: extract verifier_id from HMAC session (not body)
      const { getAuthUserId } = await import("@/lib/auth");
       const authUid = getAuthUserId(req as Request);
       if (!authUid) return NextResponse.json({ ok:false, code:"UNAUTHORIZED", message:getErrorMessage("UNAUTHORIZED") }, { status:401 });
      // override body verifier_id with authenticated id
      if (b) b.verifier_id = authUid;
      // BEDROCK v5.0: flag/counter/unflag actions ride POST (auth + event,
      // no vote needed). Blind to the crowd, named to the roster creator.
      const flagAction = String((b as any)?.action ?? "").toLowerCase();
      if (flagAction === "flag" || flagAction === "counter" || flagAction === "unflag") {
        return handleFlagAction(sql, String((b as any)?.event_id ?? ""), String(authUid), flagAction);
      }
      if (!b?.verifier_id || !b?.event_id || !b?.vote) {
        return NextResponse.json({ ok: false, code: "BAD_INPUT", message: getErrorMessage("BAD_INPUT") }, { status: 400 });
      }
      if (!["YES", "NO", "CANCEL"].includes(b.vote)) {
        return NextResponse.json({ ok: false, code: "BAD_VOTE", message: getErrorMessage("BAD_VOTE") }, { status: 400 });
      }
      // Inverted-audit P0 (K-A3): NO lazy ensureVoteBonds() on the hot path —
      // build-time migrate owns DDL. If physi_vote_bonds is missing,
      // stakeForVoteTx returns TABLE_NOT_READY and we fail closed (503).
      try {
        // --- Pre-transaction reads & pure computation ---
        const [u] = await sql`SELECT authority_final, rep_ghost_sig, mining_balance FROM physi_users WHERE id = ${b.verifier_id} LIMIT 1`;
        if (!u) throw new Error("USER_NOT_FOUND");

        // Own post + balance: poster can't count toward their own green
        // tick; voting costs 1 PHY (except CANCEL/unvote). Lets future
        // PHY attach mean something while keeping play on pocket change.
        const bal = Number((u as any).mining_balance ?? 1);
        // one-glance error copy: 429 with code INSUFFICIENT_COINS, not 500 — direct POST can't bypass
        if (bal < 1 && b.vote !== "CANCEL") {
          return NextResponse.json({ ok:false, code:"INSUFFICIENT_COINS", message:getErrorMessage("INSUFFICIENT_COINS") }, { status:429 });
        }
        const [posted] = await sql`SELECT created_by FROM physi_events WHERE id=${b.event_id} LIMIT 1`;
        // self-vouch guard: poster can't count toward own green tick — direct POST with forged body verifier_id is overridden by HMAC authUid above
        if (posted && posted.created_by === b.verifier_id) {
          return NextResponse.json({ ok:false, code:"SELF_VOUCH", message:getErrorMessage("SELF_VOUCH") }, { status:403 });
        }

        let w = Number((u as any).authority_final) || 1.0;
        if (b.vote === "NO") w = w * 0.5;
        if (b.vote === "CANCEL") w = 0;

        const isWitness = b?.is_witness === true || b?.isWitness === true || false;
        // Awards are server-fixed (never client-set): witness 1.0, else 0.3.
        const award = isWitness ? 1.0 : 0.3;

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
        let ev: { id: string; status: string; required_points: number; roster_id?: string | null } | null = null;
        try {
          const rows = await sql`SELECT id, status, required_points, roster_id FROM physi_events WHERE id = ${b.event_id} LIMIT 1`;
          if (rows.length) ev = rows[0] as any;
        } catch {}
        if (!ev) throw new Error("EVENT_NOT_FOUND");
        // BEDROCK roster gate: roster-linked events accept votes from members only.
        if ((ev as any)?.roster_id) {
          try {
            const { isRosterMember } = await import("./roster");
            if (!(await isRosterMember(sql, String((ev as any).roster_id), String(b.verifier_id)))) {
              return NextResponse.json({ ok:false, code:"ROSTER_ONLY", message:getErrorMessage("ROSTER_ONLY") }, { status:403 });
            }
          } catch {}
        }

        let required = Number((ev as any).required_points) || 0;
        if (!required) {
          try {
            const r2 = await sql`SELECT COALESCE(AVG(NULLIF(required_points,0)),5)::float as a FROM physi_events WHERE created_at > NOW() - INTERVAL '7 days'`;
            const raw2 = Number((r2 as any)[0]?.a);
            required = Math.max(3, Math.min(12, Math.round(isFinite(raw2) && raw2>0 ? raw2 : GENESIS_REQUIRED)));
          } catch { required = GENESIS_REQUIRED; }
        }
        const promote = yesW >= required && ratio >= 0.66 && total >= 3;
        const demote = (ev as any).status === "verified" && noW > 0 && ratio < 0.66;
        const quorumDecision = { promoted: promote, demoted: demote, yesW, noW, total, ratio, required };

        // --- Atomic transaction: stake + vote + ghost + promotion ---
        // P0 fix: stake is now INSIDE the transaction on the tx connection (FOR UPDATE on tx),
        // so failed vote rolls back stake deduction, and concurrent votes can't double-spend.
        let verification: any = null;
        // Use async transaction for stake conditional logic (Neon supports async tx)
        const runTx = async () => {
          let innerVerification: any = null;
          await sql.transaction(async (tx: any) => {
            // Inverted-audit P0 (K-P1): serialize ghost-chain extension. prev
            // was read pre-tx for projection; re-read it here under
            // FOR UPDATE so two concurrent votes can't fork the chain (same
            // prev → two children). Timestamp stays fixed so created_at
            // matches the hashed payload.
            let lockedPrev: string | null = ghostBuild.prev;
            try {
              const locked: any[] = await tx`SELECT rep_ghost_sig FROM physi_users WHERE id=${b.verifier_id} FOR UPDATE` as any;
              if (locked.length) lockedPrev = (locked[0] as any).rep_ghost_sig ?? null;
            } catch {}
            const lockedBuild = buildGhostChainSigs(lockedPrev, act, String(b.verifier_id), ghostBuild.timestamp);
            // 1. Stake deduction + bond insert/update atomically (free re-vote fix: released/burned re-charged)
            if (b.vote !== "CANCEL") {
              const { stakeForVoteTx, VOTE_STAKE } = await import("@/lib/voteBond");
              const stakeRes: any = await stakeForVoteTx(tx, String(b.verifier_id), String(b.event_id), VOTE_STAKE);
              if (!stakeRes.ok) {
                const err: any = new Error(stakeRes.code);
                err.stakeRes = stakeRes;
                throw err;
              }
            }
            // 2. Insert/replace verification
            const verifRows = await tx`
              INSERT INTO physi_verifications (verifier_id, event_id, vote, authority_weight, is_witness, squad_boost, award)
              VALUES (${b.verifier_id}, ${b.event_id}, ${b.vote}, ${w}, ${isWitness}, false, ${award})
              ON CONFLICT (verifier_id, event_id) DO UPDATE SET vote = EXCLUDED.vote, authority_weight = EXCLUDED.authority_weight, is_witness = EXCLUDED.is_witness, squad_boost = EXCLUDED.squad_boost, award = EXCLUDED.award
              RETURNING *`;
            innerVerification = verifRows?.[0] ?? (Array.isArray(verifRows) ? verifRows[0] : null);
            // 3. Ghost Witness: extend chain from the LOCKED prev
            const ghostQueries = prepareGhostChainQueries(tx, String(b.verifier_id), act, lockedBuild.prev, lockedBuild.newSig, lockedBuild.timestamp);
            await Promise.all(ghostQueries);
            // 4. Quorum promotion/demotion
            const promoQueries = preparePromotionQueries(tx, b.event_id, b.verifier_id, quorumDecision, (ev as any).status);
            await Promise.all(promoQueries);
            // 5. Embedded earning hook (inside transaction, not sprinkle) — truth poster + voter rewards
            // Instinct 3: must be atomic with promotion so failed vote rolls back pay.
            if (quorumDecision.promoted) {
              try {
                const [posted] = await tx`SELECT created_by FROM physi_events WHERE id=${b.event_id} LIMIT 1`;
                const yesVoters = await tx`SELECT verifier_id, award::float AS award FROM physi_verifications WHERE event_id=${b.event_id} AND vote='YES'`;
                if ((posted as any)?.created_by) {
                  await tx`UPDATE physi_users SET mining_balance = LEAST(10000, mining_balance + 0.5) WHERE id=${(posted as any).created_by}`;
                  await tx`INSERT INTO physi_truth_rewards (user_id, event_id, kind, amount) VALUES (${(posted as any).created_by}, ${b.event_id}, 'truth_poster', 0.5)`;
                }
                for (const v of yesVoters as Array<{verifier_id:string; award:number}>) {
                  const amt = Number(v.award)||0.3;
                  await tx`UPDATE physi_users SET mining_balance = LEAST(10000, mining_balance + ${amt}) WHERE id=${v.verifier_id}`;
                  await tx`INSERT INTO physi_truth_rewards (user_id, event_id, kind, amount) VALUES (${v.verifier_id}, ${b.event_id}, 'truth_voter', ${amt})`;
                }
              } catch {}
            }
          });
          return innerVerification;
        };

        try {
          verification = await runTx();
        } catch (e: any) {
          if (e?.stakeRes) {
            const sr = e.stakeRes;
            if (sr.code === "INSUFFICIENT_STAKE") return NextResponse.json({ ok:false, code:"INSUFFICIENT_STAKE", message: sr.message }, { status:402 });
            // Inverted-audit P0 (K-A3): fail closed when DDL is missing.
            if (sr.code === "TABLE_NOT_READY") return NextResponse.json({ ok:false, code:"TABLE_NOT_READY", message: getErrorMessage("TABLE_NOT_READY") }, { status:503 });
            return NextResponse.json({ ok:false, code: sr.code, message: sr.message }, { status:500 });
          }
          throw e;
        }
        const needed = Math.max(0, Math.ceil(required - yesW));
        // BEDROCK v5.0: POST receipts are redacted like GET — the voter knows
        // their own weight; everyone else's stays server-side until lock.
        const quorum = promote || demote || (ev as any).status === "verified"
          ? { promoted: promote, demoted: demote, yesW, noW, total, ratio, locked: true }
          : { promoted: false, demoted: false, required, needed, bucket: tallyBucket(needed), locked: false };
        const result = { verification, quorum };

        // Header recompute: after canonical_log INSERT, rebuild header for event's date
        if (promote || demote) {
          try {
            const { rebuildHeader } = await import("@/lib/header");
            // need event date for header — fetch if not already
            let hdrDate: string | null = null;
            try {
              const dRows: any[] = await sql`SELECT event_date::text as d FROM physi_events WHERE id=${b.event_id} LIMIT 1` as any;
              hdrDate = dRows[0]?.d ? String(dRows[0].d).slice(0,10) : null;
            } catch {}
            if (hdrDate) await rebuildHeader(hdrDate);
          } catch {}
        }

        // Stake-to-vote settlement: on quorum reached, settle bonds
        if (promote || demote) {
          try {
            const majority: "YES" | "NO" = yesW > noW ? "YES" : "NO";
            // demotion means NO majority broke ratio — burn YES losers, refund NO winners
            const { resolveBonds } = await import("@/lib/voteBond");
            await resolveBonds(sql, String(b.event_id), majority);
          } catch {}
        } else if (!promote && !demote && (b.vote === "YES" || b.vote === "NO")) {
          // No quorum yet — stake stays held; nothing to do
        }

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
        // Inverted-audit P0 (K-A3): fail closed when build-time migrate hasn't
        // run — never confuse missing DDL with a vote bug.
        if (isMissingTable(e)) {
          logError("TABLE_NOT_READY", e, { route: "/api/verify", method: "POST" });
          return NextResponse.json({ ok: false, code: "TABLE_NOT_READY", message: getErrorMessage("TABLE_NOT_READY") }, { status: 503 });
        }
        logError("VERIFY_FAILED", e, { route: "/api/verify", method: "POST" });
        return NextResponse.json({ ok: false, code: "VERIFY_FAILED", message: getErrorMessage("VERIFY_FAILED") }, { status: 500 });
      }
    }
    // GET
    try {
    } catch (e) {
      logError("VERIFY_FETCH_FAILED", e, { route: "/api/verify", phase: "ensure" });
    }
    const url = new URL(req.url);
    const eid = url.searchParams.get("event_id");
    const vid = url.searchParams.get("verifier_id") || url.searchParams.get("user_id");
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20",10)||20,50);
    // BEDROCK v5.0: creator-only flagger list (flags blind to crowd, named to
    // roster creator — retaliation-proof visibility for adjudication).
    if (eid && url.searchParams.get("flags") === "1") {
      try {
        const { getAuthUserId } = await import("@/lib/auth");
        const uid = getAuthUserId(req as Request);
        if (!uid) return NextResponse.json({ ok: false, code: "UNAUTHORIZED", message: getErrorMessage("UNAUTHORIZED") }, { status: 401 });
        const er: any[] = await sql`SELECT id, roster_id, created_by FROM physi_events WHERE id=${eid} LIMIT 1` as any;
        if (!er.length) return NextResponse.json({ ok: false, code: "NOT_FOUND", message: getErrorMessage("NOT_FOUND") }, { status: 404 });
        const rid = (er[0] as any)?.roster_id;
        let allowed = false;
        if (rid) {
          const rr: any[] = await sql`SELECT created_by FROM physi_rosters WHERE id=${rid} LIMIT 1` as any;
          allowed = rr.length > 0 && String((rr[0] as any).created_by) === String(uid);
        } else {
          allowed = String((er[0] as any).created_by) === String(uid);
        }
        if (!allowed) return NextResponse.json({ ok: false, code: "FORBIDDEN", message: "Flag details are visible to the roster creator only." }, { status: 403 });
        const flags = await sql`SELECT f.kind, f.created_at, u.nickname FROM physi_tick_flags f JOIN physi_users u ON u.id=f.flagger_id WHERE f.event_id=${eid} ORDER BY f.created_at ASC`;
        return NextResponse.json({ ok: true, flags });
      } catch (e) {
        if (isMissingTable(e)) return NextResponse.json({ ok: false, code: "TABLE_NOT_READY", message: "Flag tables not ready — redeploy to run migration." }, { status: 503 });
        logError("FLAGS_FETCH_FAILED", e, { route: "/api/verify" });
        return NextResponse.json({ ok: false, code: "INTERNAL", message: getErrorMessage("INTERNAL") }, { status: 500 });
      }
    }
    // proof receipts: fetch by verifier_id with join to events.
    // BEDROCK: your own receipts only — session must match, otherwise anyone
    // could enumerate anybody's vote history. (Blind-until-locked below hides
    // *who* voted while pending; this hides *how you* voted from others.)
    if (vid) {
      try {
        const { getSessionUserId } = await import("@/lib/auth");
        const self = getSessionUserId(req as Request);
        if (!self || self !== vid) {
          return NextResponse.json({ ok: false, code: "FORBIDDEN", message: "You can only view your own receipts." }, { status: 403 });
        }
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
      let required = Number(ev.required_points) || 0;
      if (!required) {
        try {
          const r3 = await sql`SELECT COALESCE(AVG(NULLIF(required_points,0)),5)::float as a FROM physi_events WHERE created_at > NOW() - INTERVAL '7 days'`;
          const raw3 = Number((r3 as any)[0]?.a);
          required = Math.max(3, Math.min(12, Math.round(isFinite(raw3) && raw3>0 ? raw3 : GENESIS_REQUIRED)));
        } catch { required = GENESIS_REQUIRED; }
      }
      const locked = ev.status === "verified";
      const needed = Math.max(0, Math.ceil(required - yesW));
      // BEDROCK v5.0 (spoil fix): pending payload carries bucket ONLY.
      // yesW/noW/total/ratio join exclusively on lock — the exact `needed`
      // integer never leaves the server (it was a live vote-ticker).
      let badge = { struck: false, flags: 0, counters: 0, threshold: 4 };
      if (BEDROCK_V5.blindFlags) {
        try {
          const frows = await sql`SELECT kind, COUNT(*)::int AS c FROM physi_tick_flags WHERE event_id=${eid} GROUP BY kind` as any[];
          let f = 0, c = 0;
          for (const r of frows) {
            if (String(r.kind) === "flag") f = Number(r.c) || 0;
            else if (String(r.kind) === "counter") c = Number(r.c) || 0;
          }
          let members: number | null = null;
          try {
            const er: any[] = await sql`SELECT roster_id FROM physi_events WHERE id=${eid} LIMIT 1` as any;
            const rid = (er[0] as any)?.roster_id;
            if (rid) {
              const m: any[] = await sql`SELECT COUNT(*)::int AS c FROM physi_roster_members WHERE roster_id=${rid}` as any;
              members = Number((m[0] as any)?.c ?? 0);
            }
          } catch {}
          badge = computeBadge(f, c, members);
        } catch (e) {
          if (!isMissingTable(e)) logError("BADGE_FAILED", e, { route: "/api/verify", eventId: eid });
        }
      }
      const quorum = locked
        ? {
            yesW, noW, total, ratio, required,
            promoted: yesW >= required && ratio >= 0.66 && total >= 3,
            demoted: ev.status === "verified" && noW > 0 && ratio < 0.66,
            status: ev.status, locked, needed: 0, bucket: "Locked", badge,
          }
        : {
            required, bucket: tallyBucket(needed), locked,
            promoted: false, demoted: false, status: ev.status, badge,
          };
      // Blind-until-locked, v5.0 final: pending rows are vote-only (weights
      // fingerprint voters: 1.00 vs 1.10 is an ID card). Full rows on lock.
      const masked = locked
        ? vRows
        : (vRows as any[]).map((v: any) => ({ vote: (v as any).vote }));
      // Satoshi Test 2: chain verification — verify checks prev_hash chain, not one block alone.
      // Recompute header chain tip for the event's date.
      let chain_valid: boolean|null = null;
      let chain_len = 0;
      try {
        const hdrs = await sql`SELECT date::text as d, prev_hash, hmac FROM physi_headers ORDER BY date ASC LIMIT 100`;
        if (hdrs.length > 1) {
          let ok = true;
          for (let i=1;i<hdrs.length;i++) {
            const h = hdrs[i] as any;
            const p = hdrs[i-1] as any;
            if (h.prev_hash !== p.hmac) { ok=false; break; }
          }
          chain_valid = ok; chain_len = hdrs.length;
        } else if (hdrs.length===1) { chain_valid = true; chain_len=1; }
      } catch { chain_valid = null; }
      return NextResponse.json({ ok: true, event: ev, verifications: masked, quorum, chain: { valid: chain_valid, len: chain_len } });
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
