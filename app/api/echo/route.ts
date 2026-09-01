/**
 * app/api/echo/route.ts — Presence Echoes
 * GET /api/echo?event_id=X
 * Returns { echo_strength: 0-1, participant_count, label } — count only, no identities.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSql, isDbConfigured, dbNotConfigured, ensureAllTables } from "@/lib/db";
import { calculateEchoStrength } from "@/lib/presenceEcho";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sql = getSql();
    if (!isDbConfigured() || !sql) return NextResponse.json(dbNotConfigured(), { status: 503 });
    try { await ensureAllTables(); } catch {}
    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get("event_id")?.trim() || null;
    if (!eventId) return NextResponse.json({ ok: false, code: "BAD_INPUT", message: "event_id required" }, { status: 400 });

    const res = await calculateEchoStrength(sql, eventId);
    return NextResponse.json({
      ok: true,
      echo_strength: res.echo_strength,
      participant_count: res.participant_count,
      label: res.label,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, code: "INTERNAL", message: "couldn't load echo" }, { status: 500 });
  }
}
