/**
 * lib/adapters/features/streak.ts — Streak Rescue Feature + Api Adapter
 *
 * Inverted-audit P1 (K-E4): Keep-The-Fire rescues were localStorage-only
 * (lib/streak.ts rescueStreak) — unfalsifiable and self-farmable. This is the
 * server-authoritative ledger: physi_streak_rescues, created by build-time
 * migrate. Rules (policy constants below):
 *   - rescuer != rescued (no self-rescue)
 *   - rescued missed >= 1 day (no check-in in 24h — rescue is for missed days)
 *   - 1 rescue per 14d per pair (throttle by query, not constraint)
 * Local UI (StreakRescueCard) stays as offline preview; the ledger is truth.
 */
import { NextResponse } from "next/server";
import { getSql, isDbConfigured, dbNotConfigured } from "@/lib/db";
import { registerApiAdapter } from "../api";
import { registerFeature } from "../features";
import { logError, getErrorMessage, isMissingTable } from "../error";

export const streakFeature = {
  id: "streak",
  label: "Streak Rescue",
  nav: { href: "/app/mining", label: "Streaks", short: "Fire" },
  apiRoute: "/api/streak/rescue",
  description: "Server-authoritative Keep-The-Fire rescues — 1 per 14d per pair, no self-rescue",
};

registerFeature(streakFeature);

const RESCUE_PAIR_DAYS = 14;
const RESCUE_GAP_HOURS = 24;

async function handleStreakRescue(req: Request): Promise<Response> {
  try {
    const sql = getSql();
    if (!isDbConfigured() || !sql) return NextResponse.json(dbNotConfigured(), { status: 503 });

    if (req.method === "GET") {
      const uid = new URL(req.url).searchParams.get("user_id") || new URL(req.url).searchParams.get("userId");
      if (!uid) return NextResponse.json({ ok: false, code: "BAD_INPUT", message: getErrorMessage("BAD_INPUT") }, { status: 400 });
      try {
        const rows = await sql`SELECT id, rescuer_id, rescued_id, created_at FROM physi_streak_rescues WHERE rescuer_id=${uid} OR rescued_id=${uid} ORDER BY created_at DESC LIMIT 20`;
        return NextResponse.json({ ok: true, rescues: rows });
      } catch (e) {
        if (isMissingTable(e)) return NextResponse.json({ ok: false, code: "TABLE_NOT_READY", message: "Streak tables not ready — redeploy to run migration." }, { status: 503 });
        logError("STREAK_FETCH_FAILED", e, { route: "/api/streak/rescue" });
        return NextResponse.json({ ok: false, code: "INTERNAL", message: getErrorMessage("INTERNAL") }, { status: 500 });
      }
    }

    if (req.method !== "POST") return NextResponse.json({ ok: false, code: "METHOD_NOT_ALLOWED" }, { status: 405 });

    const { getAuthUserId } = await import("@/lib/auth");
    const rescuer = getAuthUserId(req as Request);
    if (!rescuer) return NextResponse.json({ ok: false, code: "UNAUTHORIZED", message: getErrorMessage("UNAUTHORIZED") }, { status: 401 });
    const b = await req.json().catch(() => null);
    const rescued = String(b?.rescued_id ?? b?.rescuedId ?? b?.user_id ?? "").trim();
    if (!rescued) return NextResponse.json({ ok: false, code: "BAD_INPUT", message: getErrorMessage("BAD_INPUT") }, { status: 400 });
    if (rescued === rescuer) {
      return NextResponse.json({ ok: false, code: "SELF_RESCUE", message: getErrorMessage("SELF_RESCUE") }, { status: 403 });
    }

    try {
      const target = await sql`SELECT id FROM physi_users WHERE id=${rescued} LIMIT 1`;
      if (!target.length) return NextResponse.json({ ok: false, code: "USER_NOT_FOUND", message: getErrorMessage("USER_NOT_FOUND") }, { status: 404 });

      // 24h gap proof: rescued must have missed at least a day (no check-in)
      const recent = await sql`SELECT id FROM physi_mining_logs WHERE user_id=${rescued} AND created_at > NOW() - INTERVAL '24 hours' LIMIT 1` as any[];
      if (recent.length) {
        return NextResponse.json({ ok: false, code: "RESCUE_NO_GAP", message: getErrorMessage("RESCUE_NO_GAP") }, { status: 409 });
      }

      // 1 rescue / 14d / pair
      const prior = await sql`SELECT created_at FROM physi_streak_rescues WHERE rescuer_id=${rescuer} AND rescued_id=${rescued} AND created_at > NOW() - INTERVAL '14 days' ORDER BY created_at DESC LIMIT 1` as any[];
      if (prior.length) {
        const nextAt = new Date(new Date(prior[0].created_at).getTime() + RESCUE_PAIR_DAYS * 86400000);
        const retryAfter = Math.max(1, Math.ceil((nextAt.getTime() - Date.now()) / 1000));
        return NextResponse.json({ ok: false, code: "RESCUE_TOO_SOON", message: getErrorMessage("RESCUE_TOO_SOON"), retryAfter, next_at: nextAt.toISOString() }, { status: 429 });
      }

      const rows = await sql`INSERT INTO physi_streak_rescues (rescuer_id, rescued_id) VALUES (${rescuer}, ${rescued}) RETURNING *`;
      return NextResponse.json({ ok: true, rescue: (rows as any[])[0] ?? null, pair_days: RESCUE_PAIR_DAYS, gap_hours: RESCUE_GAP_HOURS }, { status: 201 });
    } catch (e) {
      if (isMissingTable(e)) {
        logError("TABLE_NOT_READY", e, { route: "/api/streak/rescue" });
        return NextResponse.json({ ok: false, code: "TABLE_NOT_READY", message: "Streak tables not ready — redeploy to run migration." }, { status: 503 });
      }
      logError("STREAK_RESCUE_FAILED", e, { route: "/api/streak/rescue" });
      return NextResponse.json({ ok: false, code: "INTERNAL", message: getErrorMessage("INTERNAL") }, { status: 500 });
    }
  } catch (e) {
    logError("INTERNAL", e, { route: "/api/streak/rescue", method: req.method });
    return NextResponse.json({ ok: false, code: "INTERNAL", message: getErrorMessage("INTERNAL") }, { status: 500 });
  }
}

registerApiAdapter({
  id: "streak",
  route: "/api/streak/rescue",
  label: "Streak Rescue API",
  handle: handleStreakRescue,
});
