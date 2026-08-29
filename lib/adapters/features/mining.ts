/**
 * lib/adapters/features/mining.ts — Mining Feature + Api Adapter
 */
import { NextResponse } from "next/server";
import { getSql, isDbConfigured, dbNotConfigured, ensureAllTables } from "@/lib/db";
import { registerApiAdapter } from "../api";
import { registerFeature } from "../features";

export const miningFeature = {
  id: "mining",
  label: "Check-in",
  nav: { href: "/app/mining", label: "Check-in", short: "In" },
  apiRoute: "/api/mining",
  description: "Daily check-in — base_reward × authority_final → TEST-PHYSI",
};

registerFeature(miningFeature);

async function handleMining(req: Request): Promise<Response> {
  const sql = getSql();
  if (!isDbConfigured() || !sql) return NextResponse.json(dbNotConfigured(), { status: 503 });
  if (req.method === "POST") {
    await ensureAllTables();
    const b = await req.json().catch(() => null);
    if (!b?.user_id) return NextResponse.json({ ok: false, code: "BAD_INPUT", error: "user_id required" }, { status: 400 });
    const u = await sql`SELECT mining_balance, authority_final FROM physi_users WHERE id = ${b.user_id} LIMIT 1`;
    if (!u.length) return NextResponse.json({ ok: false, code: "USER_NOT_FOUND" }, { status: 404 });
    const mult = Number((u[0] as { authority_final?: number }).authority_final ?? 1.0);
    const base = Number(b.base_reward ?? 10);
    const earned = +(base * mult).toFixed(2);
    const r = await sql`
      INSERT INTO physi_mining_logs (user_id, base_reward, authority_multiplier, earned_amount)
      VALUES (${b.user_id}, ${base}, ${mult}, ${earned}) RETURNING *`;
    await sql`UPDATE physi_users SET mining_balance = mining_balance + ${earned}, updated_at = NOW() WHERE id = ${b.user_id}`;
    return NextResponse.json({ ok: true, log: r[0], earned });
  }
  // GET
  try {
    await ensureAllTables();
  } catch {}
  const uid = new URL(req.url).searchParams.get("user_id");
  if (!uid) return NextResponse.json({ ok: false, code: "BAD_INPUT", error: "user_id required" }, { status: 400 });
  const rows = await sql`SELECT * FROM physi_mining_logs WHERE user_id = ${uid} ORDER BY created_at DESC LIMIT 50`;
  return NextResponse.json({ ok: true, logs: rows });
}

registerApiAdapter({
  id: "mining",
  route: "/api/mining",
  label: "Mining API",
  handle: handleMining,
});
