import { NextRequest, NextResponse } from "next/server";
import { getSql, isDbConfigured, dbNotConfigured, ensureAllTables, ensureSquadTables } from "@/lib/db";
import { buildGhostChainSigs, prepareGhostChainQueries, GHOST_GENESIS } from "@/lib/ghostWitness";

export const dynamic = "force-dynamic";

/**
 * Wave back — ephemeral chat 5min TTL
 * POST /api/squad/wave { from_user, to_user, message? }
 * GET  /api/squad/wave?user_id=... -> waves for that user (inbox)
 */

export async function GET(req: NextRequest) {
  const sql = getSql();
  if (!isDbConfigured() || !sql) return NextResponse.json(dbNotConfigured(), { status: 503 });
  try { await ensureAllTables(); await ensureSquadTables(); } catch {}
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("user_id") || searchParams.get("to_user") || "";
  if (!userId) return NextResponse.json({ ok: false, code: "BAD_INPUT", message: "user_id required" }, { status: 400 });
  try {
    try { await sql`DELETE FROM physi_squad_waves WHERE expires_at < NOW()`; } catch {}
    const waves = await sql`SELECT id, from_user, to_user, message, created_at, expires_at FROM physi_squad_waves WHERE to_user=${userId} AND expires_at > NOW() ORDER BY created_at DESC LIMIT 30`;
    // also sent
    const sent = await sql`SELECT id, from_user, to_user, message, created_at, expires_at FROM physi_squad_waves WHERE from_user=${userId} AND expires_at > NOW() ORDER BY created_at DESC LIMIT 30`;
    return NextResponse.json({ ok: true, waves, sent, count: waves.length });
  } catch (e) {
    return NextResponse.json({ ok: false, code: "INTERNAL", message: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const sql = getSql();
  if (!isDbConfigured() || !sql) return NextResponse.json(dbNotConfigured(), { status: 503 });
  try { await ensureAllTables(); await ensureSquadTables(); } catch {}
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, code: "BAD_INPUT", message: "JSON required" }, { status: 400 }); }
  const fromUser = String(body?.from_user || body?.fromUser || body?.user_id || "").trim();
  const toUser = String(body?.to_user || body?.toUser || body?.target_id || "").trim();
  if (!fromUser || !toUser) return NextResponse.json({ ok: false, code: "BAD_INPUT", message: "from_user and to_user required" }, { status: 400 });
  if (fromUser === toUser) return NextResponse.json({ ok: false, code: "BAD_INPUT", message: "can't wave to yourself" }, { status: 400 });
  const message = String(body?.message || "👋 hey — you around?").slice(0, 280);

  try {
    const u = await sql`SELECT id, rep_ghost_sig FROM physi_users WHERE id=${fromUser} LIMIT 1`;
    if (!u.length) return NextResponse.json({ ok: false, code: "NOT_FOUND", message: "sender not found" }, { status: 404 });
    const toU = await sql`SELECT id FROM physi_users WHERE id=${toUser} LIMIT 1`;
    if (!toU.length) return NextResponse.json({ ok: false, code: "NOT_FOUND", message: "recipient not found" }, { status: 404 });

    const prevSig = (u[0] as any).rep_ghost_sig ?? GHOST_GENESIS;
    const ghostBuild = buildGhostChainSigs(prevSig, "squad:wave", fromUser);
    const ghostQs = prepareGhostChainQueries(sql, fromUser, "squad:wave", ghostBuild.prev, ghostBuild.newSig);

    const wave = await sql`INSERT INTO physi_squad_waves (from_user, to_user, message, expires_at) VALUES (${fromUser}, ${toUser}, ${message}, NOW() + INTERVAL '5 minutes') RETURNING *`;
    try { await Promise.all(ghostQs); } catch {}

    return NextResponse.json({ ok: true, wave: wave?.[0] ?? null, ttl_min: 5 }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ ok: false, code: "INTERNAL", message: (e as Error).message }, { status: 500 });
  }
}
