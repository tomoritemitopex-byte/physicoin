import { NextRequest, NextResponse } from "next/server";
import { getSql, isDbConfigured, dbNotConfigured, ensureAllTables, ensureBunkTables } from "@/lib/db";
import { liveStatus } from "@/lib/bunkRadar";

export const dynamic = "force-dynamic";

/**
 * Class Bunk Radar
 * GET  /api/bunk?event_id=... -> live status for one class
 * GET  /api/bunk (no id) -> today's classes with live status
 * POST /api/bunk { event_id, reporter_id, vote: 'no_show'|'happening' } -> anonymous no-show confirmation
 * 3 no_show confirmations triggers alert
 */

export async function GET(req: NextRequest) {
  const sql = getSql();
  if (!isDbConfigured() || !sql) return NextResponse.json(dbNotConfigured(), { status: 503 });
  try { await ensureAllTables(); await ensureBunkTables(); } catch {}
  const { searchParams } = new URL(req.url);
  const eventId = searchParams.get("event_id") || searchParams.get("id") || "";

  const nowMs = Date.now();
  try {
    if (eventId) {
      const ev = await sql`SELECT id, title, venue, event_date, event_time, status FROM physi_events WHERE id=${eventId} LIMIT 1`;
      if (!ev.length) return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
      const reports = await sql`SELECT id, reporter_id, vote, created_at FROM physi_bunk_reports WHERE event_id=${eventId} ORDER BY created_at DESC LIMIT 50`;
      const noShow = (reports as any[]).filter(r => r.vote === "no_show").length;
      const happening = (reports as any[]).filter(r => r.vote === "happening").length;
      const status = liveStatus(String((ev[0] as any).event_date).slice(0, 10), String((ev[0] as any).event_time).slice(0, 5), nowMs, noShow);
      const alert = noShow >= 3;
      return NextResponse.json({ ok: true, event: ev[0], reports, no_show_count: noShow, happening_count: happening, live_status: status, alert, threshold: 3 });
    }
    // list today + tomorrow + ongoing window: fetch recent events and compute status
    const rows = await sql`SELECT id, title, venue, event_date, event_time, status FROM physi_events ORDER BY event_date DESC, event_time DESC LIMIT 40`;
    const enriched: any[] = [];
    for (const r of rows as any[]) {
      try {
        const reports = await sql`SELECT vote FROM physi_bunk_reports WHERE event_id=${r.id} LIMIT 20`;
        const noShow = (reports as any[]).filter(x => x.vote === "no_show").length;
        const s = liveStatus(String(r.event_date).slice(0, 10), String(r.event_time).slice(0, 5), nowMs, noShow);
        enriched.push({ ...r, no_show_count: noShow, live_status: s, alert: noShow >= 3 });
      } catch {
        enriched.push({ ...r, no_show_count: 0, live_status: liveStatus(String(r.event_date).slice(0, 10), String(r.event_time).slice(0, 5), nowMs, 0), alert: false });
      }
    }
    return NextResponse.json({ ok: true, events: enriched, count: enriched.length });
  } catch (e) {
    return NextResponse.json({ ok: false, code: "INTERNAL", message: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const sql = getSql();
  if (!isDbConfigured() || !sql) return NextResponse.json(dbNotConfigured(), { status: 503 });
  try { await ensureAllTables(); await ensureBunkTables(); } catch {}
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, code: "BAD_INPUT", message: "JSON required" }, { status: 400 }); }
  const eventId = String(body?.event_id || body?.id || "").trim();
  const reporterId = body?.reporter_id ? String(body.reporter_id).trim() : null;
  const voteRaw = String(body?.vote || body?.type || "no_show").toLowerCase();
  const vote = voteRaw === "happening" ? "happening" : "no_show";
  if (!eventId) return NextResponse.json({ ok: false, code: "BAD_INPUT", message: "event_id required" }, { status: 400 });

  try {
    const ev = await sql`SELECT id FROM physi_events WHERE id=${eventId} LIMIT 1`;
    if (!ev.length) return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
    // anonymous allowed: reporter_id nullable, but if provided verify user exists and upsert unique
    if (reporterId) {
      const u = await sql`SELECT id FROM physi_users WHERE id=${reporterId} LIMIT 1`;
      if (!u.length) return NextResponse.json({ ok: false, code: "NOT_FOUND", message: "reporter not found" }, { status: 404 });
    }
    // upsert: if reporter already reported, update vote instead of duplicate
    let row: any;
    if (reporterId) {
      try {
        const existing = await sql`SELECT id FROM physi_bunk_reports WHERE event_id=${eventId} AND reporter_id=${reporterId} LIMIT 1`;
        if (existing.length) {
          const upd = await sql`UPDATE physi_bunk_reports SET vote=${vote}, created_at=NOW() WHERE event_id=${eventId} AND reporter_id=${reporterId} RETURNING *`;
          row = upd?.[0];
        } else {
          const ins = await sql`INSERT INTO physi_bunk_reports (event_id, reporter_id, vote) VALUES (${eventId}, ${reporterId}, ${vote}) RETURNING *`;
          row = ins?.[0];
        }
      } catch {
        const ins = await sql`INSERT INTO physi_bunk_reports (event_id, reporter_id, vote) VALUES (${eventId}, ${reporterId}, ${vote}) RETURNING *`;
        row = ins?.[0];
      }
    } else {
      const ins = await sql`INSERT INTO physi_bunk_reports (event_id, reporter_id, vote) VALUES (${eventId}, ${null}, ${vote}) RETURNING *`;
      row = ins?.[0];
    }
    const all = await sql`SELECT vote FROM physi_bunk_reports WHERE event_id=${eventId}`;
    const noShow = (all as any[]).filter(r => r.vote === "no_show").length;
    const status = liveStatus(String((await sql`SELECT event_date, event_time FROM physi_events WHERE id=${eventId} LIMIT 1`)[0]?.event_date || "").slice(0,10), String((await sql`SELECT event_date, event_time FROM physi_events WHERE id=${eventId} LIMIT 1`)[0]?.event_time || "00:00").slice(0,5), Date.now(), noShow);
    const alert = noShow >= 3;
    return NextResponse.json({ ok: true, report: row, no_show_count: noShow, live_status: status, alert, message: alert ? "Heads up — 3 people say this class isn't holding" : vote === "no_show" ? "Noted — thanks for the heads up" : "Thanks for confirming" }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ ok: false, code: "INTERNAL", message: (e as Error).message }, { status: 500 });
  }
}
