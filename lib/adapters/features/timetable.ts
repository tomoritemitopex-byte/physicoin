/**
 * lib/adapters/features/timetable.ts — Timetable Feature + Api Adapter
 * Plug-in: registers itself via registerAdapter — no imports needed elsewhere.
 */
import { NextResponse } from "next/server";
import { getSql, isDbConfigured, dbNotConfigured, ensureAllTables } from "@/lib/db";
import { registerApiAdapter } from "../api";
import { registerFeature } from "../features";

export const timetableFeature = {
  id: "timetable",
  label: "Timetable",
  nav: { href: "/app/timetable", label: "Timetable", short: "TT" },
  apiRoute: "/api/timetable",
  description: "Live timetable feed — advisory events with vote-based green tick",
};

registerFeature(timetableFeature);

async function handleTimetable(req: Request): Promise<Response> {
  const sql = getSql();
  if (!isDbConfigured() || !sql) return NextResponse.json(dbNotConfigured(), { status: 503 });
  if (req.method === "POST") {
    await ensureAllTables();
    const body = await req.json().catch(() => null);
    if (!body?.title || !body?.venue || !body?.event_date || !body?.event_time || !body?.scope_type) {
      return NextResponse.json(
        { ok: false, code: "BAD_INPUT", error: "title, venue, event_date, event_time, scope_type required" },
        { status: 400 }
      );
    }
    const r = await sql`
      INSERT INTO physi_events (title, venue, event_date, event_time, scope_type, scope_value, status, authority_points, required_points, created_by)
      VALUES (${body.title}, ${body.venue}, ${body.event_date}, ${body.event_time}, ${body.scope_type}, ${body.scope_value ?? null}, ${body.status ?? "pending"}, ${body.authority_points ?? 0}, ${body.required_points ?? 0}, ${body.created_by ?? null})
      RETURNING *`;
    return NextResponse.json({ ok: true, event: r[0] }, { status: 201 });
  }
  // GET
  try {
    await ensureAllTables();
  } catch {}
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 200);
  const offset = Math.max(parseInt(searchParams.get("offset") ?? "0", 10) || 0, 0);
  let rows: unknown[];
  if (status) {
    rows = await sql`SELECT * FROM physi_events WHERE status = ${status} ORDER BY event_date DESC, event_time DESC LIMIT ${limit} OFFSET ${offset}`;
  } else {
    rows = await sql`SELECT * FROM physi_events ORDER BY event_date DESC, event_time DESC LIMIT ${limit} OFFSET ${offset}`;
  }
  return NextResponse.json({ ok: true, events: rows, count: (rows as unknown[]).length });
}

registerApiAdapter({
  id: "timetable",
  route: "/api/timetable",
  label: "Timetable API",
  handle: handleTimetable,
});

// also alias /api/events to same handler (backward compat)
registerApiAdapter({
  id: "events",
  route: "/api/events",
  label: "Events API (alias of timetable)",
  handle: handleTimetable,
});
