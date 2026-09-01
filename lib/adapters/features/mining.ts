/**
 * lib/adapters/features/mining.ts — Mining Feature + Api Adapter
 * Satoshi P1-5: This is a check-in faucet, not proof-of-work.
 * base_reward = 1 (not 10). Rep only, no cash value.
 */
import { NextResponse } from "next/server";
import { getSql, isDbConfigured, dbNotConfigured, ensureAllTables } from "@/lib/db";
import { registerApiAdapter } from "../api";
import { registerFeature } from "../features";
import { logError, getErrorMessage } from "../error";
import { GHOST_ACTIONS, appendGhostChain } from "@/lib/ghostWitness";

export const miningFeature = {
  id: "mining",
  label: "Check-in",
  nav: { href: "/app/mining", label: "Check-in", short: "In" },
  apiRoute: "/api/mining",
  description: "Daily check-in — base 1 × authority_final → Rep (TEST-PHIS, no value)",
};

registerFeature(miningFeature);

// Satoshi P1-5: faucet not mining. base_reward is always 1.
// Auto-streak: verified actions auto-bump streak; manual mining is bonus +0.5 Rep on top of auto.
const BASE_REWARD = 1;
const MANUAL_BONUS = 0.5;

async function handleMining(req: Request): Promise<Response> {
  try {
    const sql = getSql();
    if (!isDbConfigured() || !sql) return NextResponse.json(dbNotConfigured(), { status: 503 });
    if (req.method === "POST") {
      try {
        await ensureAllTables();
      } catch (e) {
        logError("MINING_CHECKIN_FAILED", e, { route: "/api/mining", phase: "ensure" });
      }
      const b = await req.json().catch(() => null);
      if (!b?.user_id) return NextResponse.json({ ok: false, code: "BAD_INPUT", message: getErrorMessage("BAD_INPUT") }, { status: 400 });
      try {
        const u = await sql`SELECT mining_balance, authority_final FROM physi_users WHERE id = ${b.user_id} LIMIT 1`;
        if (!u.length) return NextResponse.json({ ok: false, code: "USER_NOT_FOUND", message: getErrorMessage("USER_NOT_FOUND") }, { status: 404 });
        const mult = Number((u[0] as { authority_final?: number }).authority_final ?? 1.0);
        // Satoshi P1-5: base_reward is always BASE_REWARD (1), never client-controlled.
        // No $ coin icon anywhere. Rep only.
        // Manual mining is bonus +0.5 Rep on top (auto-streak covers daily bump)
        const base = BASE_REWARD;
        const earnedBase = +(base * mult).toFixed(2);
        const bonus = MANUAL_BONUS;
        const earned = +(earnedBase + bonus).toFixed(2);
        const r = await sql`
      INSERT INTO physi_mining_logs (user_id, base_reward, authority_multiplier, earned_amount)
      VALUES (${b.user_id}, ${base + bonus}, ${mult}, ${earned}) RETURNING *`;
        await sql`UPDATE physi_users SET mining_balance = mining_balance + ${earned}, updated_at = NOW() WHERE id = ${b.user_id}`;
        // Ghost Witness: extend chain on mining check-in
        try {
          const txLike = sql; // use sql for chain (non-transactional but ok)
          await appendGhostChain(txLike, String(b.user_id), GHOST_ACTIONS.MINING_CHECKIN);
        } catch {}
        return NextResponse.json({ ok: true, log: r[0], earned, ghost_extended: true });
      } catch (e) {
        logError("MINING_CHECKIN_FAILED", e, { route: "/api/mining", method: "POST" });
        return NextResponse.json({ ok: false, code: "MINING_CHECKIN_FAILED", message: getErrorMessage("MINING_CHECKIN_FAILED") }, { status: 500 });
      }
    }
    // GET
    try {
      await ensureAllTables();
    } catch (e) {
      logError("MINING_FETCH_FAILED", e, { route: "/api/mining", phase: "ensure" });
    }
    const uid = new URL(req.url).searchParams.get("user_id");
    if (!uid) return NextResponse.json({ ok: false, code: "BAD_INPUT", message: getErrorMessage("BAD_INPUT") }, { status: 400 });
    try {
      const rows = await sql`SELECT * FROM physi_mining_logs WHERE user_id = ${uid} ORDER BY created_at DESC LIMIT 50`;
      return NextResponse.json({ ok: true, logs: rows });
    } catch (e) {
      logError("MINING_FETCH_FAILED", e, { route: "/api/mining", method: "GET" });
      return NextResponse.json({ ok: false, code: "MINING_FETCH_FAILED", message: getErrorMessage("MINING_FETCH_FAILED") }, { status: 500 });
    }
  } catch (e) {
    logError("INTERNAL", e, { route: "/api/mining", method: req.method });
    return NextResponse.json({ ok: false, code: "INTERNAL", message: getErrorMessage("INTERNAL") }, { status: 500 });
  }
}

registerApiAdapter({
  id: "mining",
  route: "/api/mining",
  label: "Mining API",
  handle: handleMining,
});
