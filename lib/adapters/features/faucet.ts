/**
 * lib/adapters/features/faucet.ts — Weekly Faucet + Api Adapter
 * Seeds the field: 1.0/week to proven humans (>=3 votes ever, account
 * older than a day). Bots and day-olds get nothing. One drip per
 * wallet per ISO week (idempotent). Trigger: Vercel Cron (see
 * vercel.json) with CRON_SECRET, or manual POST with the same key.
 * Pays from the SEPARATE truth ledger (physi_truth_rewards kind faucet),
 * never from the daily mint.
 */
import { NextResponse } from "next/server";
import { getSql, isDbConfigured, dbNotConfigured } from "@/lib/db";
import { registerApiAdapter } from "../api";
import { registerFeature } from "../features";
import { logError, getErrorMessage, isMissingTable } from "../error";

registerFeature({
  id: "faucet",
  label: "Faucet",
  apiRoute: "/api/faucet",
  description: "Weekly drip to proven contributors (kind faucet, separate ledger)",
});

function isoWeek(d = new Date()): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - day + 3);
  const first = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((t.getTime() - first.getTime()) / 86400000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
  return `${t.getUTCFullYear()}-W${week}`;
}

async function drip(): Promise<Response> {
  try {
    if (!isDbConfigured()) return NextResponse.json(dbNotConfigured(), { status: 503 });
    // Inverted-audit P0 (K-A3): no lazy ensure*() on the cron path —
    // build-time migrate owns DDL; missing tables fail closed below.
    const sql = getSql();
    if (!sql) return NextResponse.json(dbNotConfigured(), { status: 503 });
    const week = isoWeek();
    const wallets = await sql`
      SELECT u.id FROM physi_users u
      WHERE u.created_at < NOW() - INTERVAL '24 hours'
        AND (SELECT count(*) FROM physi_verifications v WHERE v.verifier_id = u.id) >= 3
        AND NOT EXISTS (SELECT 1 FROM physi_faucet_drips f WHERE f.user_id = u.id AND f.week = ${week})`;
    let dripped = 0;
    for (const w of wallets as Array<{ id: string }>) {
      try {
        // Inverted-audit P1 (K-E3): claim the (user, week) row FIRST with
        // ON CONFLICT DO NOTHING. A concurrent/retried cron fire loses the
        // race here and skips — balance + rewards are only credited by the
        // winner, so double-pay is structurally impossible.
        const claimed: any[] = await sql`INSERT INTO physi_faucet_drips (user_id, week, amount) VALUES (${w.id}, ${week}, 1) ON CONFLICT (user_id, week) DO NOTHING RETURNING *` as any;
        if (!claimed.length) continue;
        await sql`UPDATE physi_users SET mining_balance = LEAST(10000, mining_balance + 1) WHERE id = ${w.id}`;
        await sql`INSERT INTO physi_truth_rewards (user_id, kind, amount) VALUES (${w.id}, 'faucet', 1)`;
        dripped++;
      } catch (e) {
        if (isMissingTable(e)) {
          logError("TABLE_NOT_READY", e, { route: "/api/faucet" });
          return NextResponse.json({ ok: false, code: "TABLE_NOT_READY", message: "Faucet tables not ready — redeploy to run migration." }, { status: 503 });
        }
        logError("FAUCET_USER_FAILED", e, { route: "/api/faucet", user: w.id });
      }
    }
    return NextResponse.json({ ok: true, dripped, week });
  } catch (e) {
    if (isMissingTable(e)) {
      logError("TABLE_NOT_READY", e, { route: "/api/faucet" });
      return NextResponse.json({ ok: false, code: "TABLE_NOT_READY", message: "Faucet tables not ready — redeploy to run migration." }, { status: 503 });
    }
    logError("FAUCET_FAILED", e, { route: "/api/faucet" });
    return NextResponse.json({ ok: false, code: "INTERNAL", message: getErrorMessage("INTERNAL") }, { status: 500 });
  }
}

async function handle(req: Request): Promise<Response> {
  const h = req.headers.get("authorization") || "";
  let key = "";
  if (req.method === "POST") {
    try {
      const b = await req.json().catch(() => ({} as any));
      key = b.key || "";
    } catch {}
  }
  if (!key && h.startsWith("Bearer ")) key = h.slice(7);
  if (!process.env.CRON_SECRET || key !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, code: "FORBIDDEN", message: "Bad faucet key." }, { status: 403 });
  }
  if (req.method === "GET") {
    try {
      const u = new URL(req.url);
      const user_id = u.searchParams.get("user_id") || "";
      if (!isDbConfigured()) return NextResponse.json(dbNotConfigured(), { status: 503 });
      const sql = getSql();
      if (!sql) return NextResponse.json(dbNotConfigured(), { status: 503 });
      const rows = await sql`SELECT kind, amount, event_id, created_at FROM physi_truth_rewards WHERE user_id = ${user_id} ORDER BY created_at DESC LIMIT 20`;
      return NextResponse.json({ ok: true, rewards: rows });
    } catch (e) {
      logError("FAUCET_HISTORY_FAILED", e, { route: "/api/faucet" });
      return NextResponse.json({ ok: false, code: "INTERNAL", message: getErrorMessage("INTERNAL") }, { status: 500 });
    }
  }
  return drip();
}

registerApiAdapter({ id: "faucet", route: "/api/faucet", label: "Faucet API", handle });
