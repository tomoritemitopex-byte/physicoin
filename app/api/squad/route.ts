import { NextRequest, NextResponse } from "next/server";
import { getSql, isDbConfigured, dbNotConfigured, ensureAllTables, ensureSquadTables } from "@/lib/db";
import { buildGhostChainSigs, prepareGhostChainQueries, GHOST_GENESIS } from "@/lib/ghostWitness";

export const dynamic = "force-dynamic";

/**
 * Find My People — Squad Locator
 * POST /api/squad  { user_id, programme, level, building_id, lat, lng } -> ping (12min TTL)
 * GET  /api/squad?programme=PHYS&level=200L&building_id=phys&viewer_id=... -> heat dots (anonymous counts per building)
 * Reuses ghost chain for auth, presence building coords, campus BUILDINGS.
 */

export async function GET(req: NextRequest) {
  const sql = getSql();
  if (!isDbConfigured() || !sql) return NextResponse.json(dbNotConfigured(), { status: 503 });
  try { await ensureAllTables(); await ensureSquadTables(); } catch {}
  const { searchParams } = new URL(req.url);
  const programme = (searchParams.get("programme") || searchParams.get("program") || "").trim();
  const level = (searchParams.get("level") || "").trim();
  const buildingId = (searchParams.get("building_id") || searchParams.get("building") || "").trim();
  const viewerId = searchParams.get("viewer_id") || searchParams.get("user_id") || null;

  try {
    // purge expired
    try { await sql`DELETE FROM physi_squad_pings WHERE expires_at < NOW()`; } catch {}
    try { await sql`DELETE FROM physi_squad_waves WHERE expires_at < NOW()`; } catch {}

    let rows: any[] = [];
    if (programme && level) {
      rows = await sql`SELECT id, programme, level, building_id, lat, lng, created_at, user_id FROM physi_squad_pings WHERE programme ILIKE ${programme} AND level ILIKE ${level} AND expires_at > NOW() ORDER BY created_at DESC LIMIT 80`;
    } else if (buildingId) {
      rows = await sql`SELECT id, programme, level, building_id, lat, lng, created_at, user_id FROM physi_squad_pings WHERE building_id=${buildingId} AND expires_at > NOW() ORDER BY created_at DESC LIMIT 80`;
    } else {
      rows = await sql`SELECT id, programme, level, building_id, lat, lng, created_at, user_id FROM physi_squad_pings WHERE expires_at > NOW() ORDER BY created_at DESC LIMIT 80`;
    }

    // heat: count per building
    const heat: Record<string, number> = {};
    for (const r of rows) {
      const bid = String(r.building_id || "phys").toLowerCase();
      heat[bid] = (heat[bid] || 0) + 1;
    }
    // dots: anonymized (no user_id exposed to other viewers) — use ghost avatar seed from ping id
    const dots = rows.map((r: any, i: number) => ({
      id: r.id,
      building_id: r.building_id,
      programme: r.programme,
      level: r.level,
      lat: r.lat,
      lng: r.lng,
      created_at: r.created_at,
      anon_seed: String(r.id).slice(0, 8),
      is_me: viewerId ? String(r.user_id) === String(viewerId) : false,
    }));

    // waves for viewer (ephemeral chat 5min)
    let waves: any[] = [];
    if (viewerId) {
      try {
        waves = await sql`SELECT id, from_user, to_user, message, created_at, expires_at FROM physi_squad_waves WHERE to_user=${viewerId} AND expires_at > NOW() ORDER BY created_at DESC LIMIT 20`;
      } catch {}
    }

    return NextResponse.json({ ok: true, heat, dots, waves, count: rows.length, ttl_min: 12 });
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
  const userId = String(body?.user_id || body?.userId || body?.id || "").trim();
  if (!userId) return NextResponse.json({ ok: false, code: "BAD_INPUT", message: "user_id required" }, { status: 400 });
  const programme = String(body?.programme || body?.program || body?.programmes || "PHYS").trim().toUpperCase().slice(0, 20) || "PHYS";
  const level = String(body?.level || "100L").trim().toUpperCase().slice(0, 10) || "100L";
  const buildingId = String(body?.building_id || body?.buildingId || body?.building || "phys").trim().toLowerCase().slice(0, 24) || "phys";
  const lat = body?.lat != null ? Number(body.lat) : null;
  const lng = body?.lng != null ? Number(body.lng) : null;

  try {
    const u = await sql`SELECT id, rep_ghost_sig FROM physi_users WHERE id=${userId} LIMIT 1`;
    if (!u.length) return NextResponse.json({ ok: false, code: "NOT_FOUND", message: "user not found — create profile first" }, { status: 404 });
    const prevSig = (u[0] as any).rep_ghost_sig ?? GHOST_GENESIS;
    const ghostBuild = buildGhostChainSigs(prevSig, "squad:ping", userId);

    // keep only one active ping per user: delete old
    try { await sql`DELETE FROM physi_squad_pings WHERE user_id=${userId}`; } catch {}

    const ghostQs = prepareGhostChainQueries(sql, userId, "squad:ping", ghostBuild.prev, ghostBuild.newSig);

    // Insert ping - do as transaction-like batch: use sql transaction array pattern if available
    // Neon HTTP: must return array from transaction callback; we do sequential + Promise.all for ghost chain for simplicity
    const ping = await sql`INSERT INTO physi_squad_pings (user_id, programme, level, building_id, lat, lng, expires_at) VALUES (${userId}, ${programme}, ${level}, ${buildingId}, ${lat}, ${lng}, NOW() + INTERVAL '12 minutes') RETURNING *`;
    try { await Promise.all(ghostQs); } catch (e) { console.warn("[squad] ghost chain warn", (e as Error).message); }

    return NextResponse.json({ ok: true, ping: ping?.[0] ?? null, ghost_sig: ghostBuild.newSig }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ ok: false, code: "INTERNAL", message: (e as Error).message }, { status: 500 });
  }
}
