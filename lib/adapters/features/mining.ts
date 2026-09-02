/**
 * lib/adapters/features/mining.ts — Mining Feature + Api Adapter
 * Satoshi P1-5: This is a check-in faucet, not proof-of-work.
 * base_reward = 1 * 0.5^(total_logs/50000) halving every 50k campus check-ins.
 * Cap: mining_balance <= 10000
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
  description: "Daily check-in — base 1 × authority_final → Rep (halved every 50k campus check-ins)",
};

registerFeature(miningFeature);

const BASE_REWARD_RAW = 1;
const MANUAL_BONUS = 0.5;
const HALVING_INTERVAL = 50000;
const BALANCE_CAP = 10000;

async function getHalvedBase(sql: any): Promise<number> {
  try {
    const rows: any[] = await sql`SELECT COUNT(*)::int as c FROM physi_mining_logs` as any;
    const total = Number(rows?.[0]?.c || 0);
    const halvings = Math.floor(total / HALVING_INTERVAL);
    return BASE_REWARD_RAW * Math.pow(0.5, halvings);
  } catch {
    return BASE_REWARD_RAW;
  }
}

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
      const { getAuthUserId } = await import("@/lib/auth");
      const authUserId = getAuthUserId(req as Request);
      if (!authUserId) return NextResponse.json({ ok: false, code: "UNAUTHORIZED", message: "Missing session token. POST /api/auth/session to obtain one." }, { status: 401 });
      const userId = authUserId;
      try {
        const u = await sql`SELECT mining_balance, authority_final, rep_ghost_sig FROM physi_users WHERE id = ${userId} LIMIT 1`;
        if (!u.length) return NextResponse.json({ ok: false, code: "USER_NOT_FOUND", message: getErrorMessage("USER_NOT_FOUND") }, { status: 404 });
        if (Number(u[0].mining_balance) >= BALANCE_CAP) return NextResponse.json({ ok:false, code:"BALANCE_CAP", message:`Mining balance capped at ${BALANCE_CAP} Rep` }, { status: 429 });
        try {
          const last: any[] = await sql`SELECT created_at FROM physi_mining_logs WHERE user_id=${userId} AND created_at > NOW() - INTERVAL '24 hours' LIMIT 1` as any;
          if (last.length) {
            const nextAt = new Date(new Date(last[0].created_at).getTime() + 24*3600*1000).toISOString();
            return NextResponse.json({ ok:false, code:"RATE_LIMITED", message:"Daily check-in already claimed. Try again after 24h.", next_at: nextAt }, { status: 429 });
          }
        } catch {}
        const mult = Number((u[0] as { authority_final?: number }).authority_final ?? 1.0);
        const halvedBase = await getHalvedBase(sql);
        const earnedBase = +(halvedBase * mult).toFixed(2);
        const bonus = MANUAL_BONUS * Math.pow(0.5, Math.floor((await getHalvedBase(sql)) !== BASE_REWARD_RAW ? 0 : 0)); // keep bonus constant for now
        // bonus not halved separately; halvedBase already accounts
        const earned = +(earnedBase + MANUAL_BONUS).toFixed(2);
        const cappedEarned = Math.min(earned, BALANCE_CAP - Number(u[0].mining_balance));
        if (cappedEarned <= 0) return NextResponse.json({ ok:false, code:"BALANCE_CAP", message:`Mining balance capped at ${BALANCE_CAP} Rep` }, { status: 429 });
        const baseForLog = halvedBase + MANUAL_BONUS;
        const r = await sql`
      INSERT INTO physi_mining_logs (user_id, base_reward, authority_multiplier, earned_amount)
      VALUES (${userId}, ${baseForLog}, ${mult}, ${cappedEarned}) RETURNING *`;
        await sql`UPDATE physi_users SET mining_balance = LEAST(${BALANCE_CAP}, mining_balance + ${cappedEarned}), updated_at = NOW() WHERE id = ${userId}`;
        try {
          await appendGhostChain(sql, String(userId), GHOST_ACTIONS.MINING_CHECKIN, { prevSig: (u[0] as any).rep_ghost_sig ?? null });
        } catch {}
        return NextResponse.json({ ok: true, log: r[0], earned: cappedEarned, halvedBase, ghost_extended: true });
      } catch (e) {
        logError("MINING_CHECKIN_FAILED", e, { route: "/api/mining", method: "POST" });
        return NextResponse.json({ ok: false, code: "MINING_CHECKIN_FAILED", message: getErrorMessage("MINING_CHECKIN_FAILED") }, { status: 500 });
      }
    }
    try {
      await ensureAllTables();
    } catch (e) {
      logError("MINING_FETCH_FAILED", e, { route: "/api/mining", phase: "ensure" });
    }
    const { getSessionUserId } = await import("@/lib/auth");
    const sessionUid = getSessionUserId(req as Request);
    const uid = sessionUid || new URL(req.url).searchParams.get("user_id");
    if (!uid) return NextResponse.json({ ok: false, code: "BAD_INPUT", message: getErrorMessage("BAD_INPUT") }, { status: 400 });
    try {
      const rows = await sql`SELECT * FROM physi_mining_logs WHERE user_id = ${uid} ORDER BY created_at DESC LIMIT 50`;
      const halvedBase = await getHalvedBase(sql);
      return NextResponse.json({ ok: true, logs: rows, halvedBase, cap: BALANCE_CAP });
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
