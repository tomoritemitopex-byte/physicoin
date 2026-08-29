/**
 * lib/adapters/features/timetable.ts — Timetable Feature + Api Adapter
 * Plug-in: registers itself via registerAdapter — no imports needed elsewhere.
 */
import { NextResponse } from "next/server";
import { getSql, isDbConfigured, dbNotConfigured, ensureAllTables } from "@/lib/db";
import { registerApiAdapter } from "../api";
import { registerFeature } from "../features";
import { logError, getErrorMessage } from "../error";

export const timetableFeature = {
  id: "timetable",
  label: "Timetable",
  nav: { href: "/app/timetable", label: "Timetable", short: "TT" },
  apiRoute: "/api/timetable",
  description: "Live timetable feed — advisory events with vote-based green tick",
};

registerFeature(timetableFeature);

async function handleTimetable(req: Request): Promise<Response> {
  try {
    const sql = getSql();
    if (!isDbConfigured() || !sql) return NextResponse.json(dbNotConfigured(), { status: 503 });
    if (req.method === "POST") {
      try {
        await ensureAllTables();
      } catch (e) {
        logError("TIMETABLE_CREATE_FAILED", e, { route: "/api/timetable", method: "POST", phase: "ensure" });
      }
      let body: unknown;
      try {
        body = await req.json();
      } catch (e) {
        logError("BAD_INPUT", e, { route: "/api/timetable" });
        return NextResponse.json({ ok: false, code: "BAD_INPUT", message: getErrorMessage("BAD_INPUT") }, { status: 400 });
      }
      const b = body as Record<string, unknown>;
      if (!b?.title || !b?.venue || !b?.event_date || !b?.event_time || !b?.scope_type) {
        return NextResponse.json(
          { ok: false, code: "BAD_INPUT", message: getErrorMessage("BAD_INPUT") },
          { status: 400 }
        );
      }
      try {
        const r = await sql`
        INSERT INTO physi_events (title, venue, event_date, event_time, scope_type, scope_value, status, authority_points, required_points, created_by)
        VALUES (${String(b.title)}, ${String(b.venue)}, ${String(b.event_date)}, ${String(b.event_time)}, ${String(b.scope_type)}, ${(b.scope_value as string) ?? null}, ${String((b.status as string) ?? "pending")}, ${Number((b.authority_points as number) ?? 0)}, ${Number((b.required_points as number) ?? 0)}, ${(b.created_by as string) ?? null})
        RETURNING *`;
        return NextResponse.json({ ok: true, event: r[0] }, { status: 201 });
      } catch (e) {
        logError("TIMETABLE_CREATE_FAILED", e, { route: "/api/timetable", method: "POST" });
        return NextResponse.json({ ok: false, code: "TIMETABLE_CREATE_FAILED", message: getErrorMessage("TIMETABLE_CREATE_FAILED") }, { status: 500 });
      }
    }
    // GET
    try {
      await ensureAllTables();
    } catch (e) {
      logError("TIMETABLE_FETCH_FAILED", e, { route: "/api/timetable", method: "GET", phase: "ensure" });
    }
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 200);
    const offset = Math.max(parseInt(searchParams.get("offset") ?? "0", 10) || 0, 0);
    try {
      let rows: unknown[];
      if (status) {
        rows = await sql`SELECT * FROM physi_events WHERE status = ${status} ORDER BY event_date DESC, event_time DESC LIMIT ${limit} OFFSET ${offset}`;
      } else {
        rows = await sql`SELECT * FROM physi_events ORDER BY event_date DESC, event_time DESC LIMIT ${limit} OFFSET ${offset}`;
      }
      return NextResponse.json({ ok: true, events: rows, count: (rows as unknown[]).length });
    } catch (e) {
      logError("TIMETABLE_FETCH_FAILED", e, { route: "/api/timetable", method: "GET" });
      return NextResponse.json({ ok: false, code: "TIMETABLE_FETCH_FAILED", message: getErrorMessage("TIMETABLE_FETCH_FAILED") }, { status: 500 });
    }
  } catch (e) {
    logError("INTERNAL", e, { route: "/api/timetable", method: req.method });
    return NextResponse.json({ ok: false, code: "INTERNAL", message: getErrorMessage("INTERNAL") }, { status: 500 });
  }
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
