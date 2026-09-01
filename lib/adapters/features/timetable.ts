/**
 * lib/adapters/features/timetable.ts — Timetable Feature + Api Adapter
 * Plug-in: registers itself via registerAdapter — no imports needed elsewhere.
 * Severity + timeline diff history added (move/shift/cancelled)
 */
import { NextResponse } from "next/server";
import { getSql, isDbConfigured, dbNotConfigured, ensureAllTables } from "@/lib/db";
import { registerApiAdapter } from "../api";
import { registerFeature } from "../features";
import { logError, getErrorMessage } from "../error";
import { zkThresholdCheck } from "@/lib/zkAuthority";

export const timetableFeature = {
  id: "timetable",
  label: "Timetable",
  nav: { href: "/app/timetable", label: "Timetable", short: "TT" },
  apiRoute: "/api/timetable",
  description: "Live timetable feed — advisory events with vote-based green tick",
};

registerFeature(timetableFeature);

const SEVERITIES = ["move","shift","cancelled"] as const;
type Severity = typeof SEVERITIES[number];
function isSeverity(v:any): v is Severity { return SEVERITIES.includes(String(v) as any); }

async function handleTimetable(req: Request): Promise<Response> {
  try {
    const sql = getSql();
    if (!isDbConfigured() || !sql) return NextResponse.json(dbNotConfigured(), { status: 503 });

    // PATCH / PUT — update venue/time and log history diff LT2->LT5
    if (req.method === "PATCH" || req.method === "PUT") {
      try { await ensureAllTables(); } catch(e){ logError("TIMETABLE_CREATE_FAILED", e, { route:"/api/timetable", method:req.method, phase:"ensure"}); }
      let body: any;
      try { body = await req.json(); } catch(e){ return NextResponse.json({ ok:false, code:"BAD_INPUT", message:getErrorMessage("BAD_INPUT")},{status:400}); }
      const id = String(body?.id || body?.event_id || "").trim();
      if (!id) return NextResponse.json({ ok:false, code:"BAD_INPUT", message:"id required"},{status:400});
      const rows = await sql`SELECT * FROM physi_events WHERE id=${id} LIMIT 1`;
      if (!rows.length) return NextResponse.json({ ok:false, code:"NOT_FOUND", message:getErrorMessage("NOT_FOUND")},{status:404});
      const prev = rows[0] as any;
      const newVenue = body.venue !== undefined ? String(body.venue) : prev.venue;
      const newDate = body.event_date !== undefined ? String(body.event_date) : String(prev.event_date).slice(0,10);
      const newTime = body.event_time !== undefined ? String(body.event_time) : String(prev.event_time).slice(0,5);
      const newSeverity = body.severity !== undefined ? String(body.severity) : prev.severity;
      if (newSeverity && !isSeverity(newSeverity)) return NextResponse.json({ ok:false, code:"BAD_INPUT", message:"severity must be move|shift|cancelled"},{status:400});
      // detect change
      const venueChanged = String(prev.venue) !== String(newVenue);
      const timeChanged = String(prev.event_time).slice(0,5) !== String(newTime).slice(0,5);
      const dateChanged = String(prev.event_date).slice(0,10) !== String(newDate).slice(0,10);
      const severityChanged = String(prev.severity) !== String(newSeverity);
      if (!venueChanged && !timeChanged && !dateChanged && !severityChanged) {
        return NextResponse.json({ ok:true, event: prev, changed:false });
      }
      // log history
      try {
        await sql`INSERT INTO physi_event_history (event_id, prev_venue, prev_event_date, prev_event_time, new_venue, new_event_date, new_event_time, changed_by) VALUES (${id}, ${String(prev.venue)}, ${String(prev.event_date).slice(0,10)}, ${String(prev.event_time).slice(0,5)}, ${String(newVenue)}, ${String(newDate)}, ${String(newTime)}, ${(body.changed_by as string) ?? (body.created_by as string) ?? null})`;
      } catch(e){ console.warn("[timetable] history insert failed", (e as Error).message); }
      // update
      const upd = await sql`UPDATE physi_events SET venue=${String(newVenue)}, event_date=${String(newDate)}, event_time=${String(newTime)}, severity=${String(newSeverity)}, prev_venue=${String(prev.venue)}, prev_event_time=${String(prev.event_time).slice(0,5)}, prev_event_date=${String(prev.event_date).slice(0,10)}, updated_at=NOW() WHERE id=${id} RETURNING *`;
      return NextResponse.json({ ok:true, event: upd[0], prev, history:{ venue: `${String(prev.venue)}→${String(newVenue)}`, time: `${String(prev.event_time).slice(0,5)}→${String(newTime).slice(0,5)}` } });
    }

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
      // severity required — move/shift/cancelled with colors blue/yellow/red
      const sev = String((b.severity as string) ?? "").toLowerCase();
      if (!isSeverity(sev)) {
        return NextResponse.json({ ok:false, code:"BAD_INPUT", message:"severity required: move | shift | cancelled (blue/yellow/red)"},{status:400});
      }
      // optional prev diff fields for timeline history on create (e.g. LT2->LT5)
      const prevVenue = (b.prev_venue as string) ?? (b.from_venue as string) ?? null;
      const prevTime = (b.prev_event_time as string) ?? (b.from_time as string) ?? null;
      const prevDate = (b.prev_event_date as string) ?? null;
      // Satoshi P0-2: KILL auto-canonical — events ALWAYS start as 'pending'.
      // status, authority_points, required_points are server-controlled.
      // No client can create a 'verified' event directly.
      const status = "pending";
      const authority_points = 0;
      const scope = String(b.scope_type || "general").toLowerCase();
      const required_points = (scope === "global" || scope === "university" || scope === "faculty" || scope === "department") ? 5.0 : 3.0;
      const isZkAttested = b.is_zk_attested === true || b.isZkAttested === true || false;
      try {
        const r = await sql`\
        INSERT INTO physi_events (title, venue, event_date, event_time, scope_type, scope_value, status, authority_points, required_points, created_by, severity, prev_venue, prev_event_time, prev_event_date, is_zk_attested)
        VALUES (${String(b.title)}, ${String(b.venue)}, ${String(b.event_date)}, ${String(b.event_time)}, ${String(b.scope_type)}, ${(b.scope_value as string) ?? null}, ${status}, ${authority_points}, ${required_points}, ${(b.created_by as string) ?? null}, ${sev}, ${prevVenue}, ${prevTime}, ${prevDate}, ${isZkAttested})
        RETURNING *`;
        // also log history if prev exists
        if (prevVenue || prevTime) {
          try { await sql`INSERT INTO physi_event_history (event_id, prev_venue, prev_event_date, prev_event_time, new_venue, new_event_date, new_event_time, changed_by) VALUES (${r[0].id}, ${prevVenue}, ${prevDate}, ${prevTime}, ${String(b.venue)}, ${String(b.event_date)}, ${String(b.event_time)}, ${(b.created_by as string) ?? null})`; } catch {}
        }
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
    // history timeline diff fetch: ?history=event_id
    const histId = searchParams.get("history") || searchParams.get("event_id_history");
    if (histId) {
      try {
        const rows = await sql`SELECT * FROM physi_event_history WHERE event_id=${histId} ORDER BY changed_at DESC LIMIT 20`;
        // also return prev fields from event itself for quick diff
        const evRows = await sql`SELECT id, venue, event_date, event_time, prev_venue, prev_event_time, prev_event_date, severity FROM physi_events WHERE id=${histId} LIMIT 1`;
        const ev = evRows[0] as any;
        const diff = ev && ev.prev_venue ? { venue: `${String(ev.prev_venue)}→${String(ev.venue)}`, time: `${String(ev.prev_event_time||"").slice(0,5)}→${String(ev.event_time).slice(0,5)}` } : null;
        return NextResponse.json({ ok:true, history: rows, diff, event: ev });
      } catch(e){ logError("TIMETABLE_FETCH_FAILED", e, {route:"/api/timetable", phase:"history"}); return NextResponse.json({ok:false, code:"TIMETABLE_FETCH_FAILED", message:getErrorMessage("TIMETABLE_FETCH_FAILED")},{status:500}); }
    }
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
      // seed 3 advisory events if DB empty (pilot onboarding — makes timetable feel alive)
      if (!status && (rows as unknown[]).length === 0 && limit >= 10) {
        try {
          const today = new Date();
          const pad = (n: number) => String(n).padStart(2, "0");
          const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
          // find next Friday for BIO 101, next Monday for ANA 201, next Wednesday for CHM 101
          const nextWeekday = (target: number) => {
            const d = new Date(today);
            const cur = d.getDay();
            let diff = target - cur;
            if (diff <= 0) diff += 7;
            d.setDate(d.getDate() + diff);
            return d;
          };
          const fri = nextWeekday(5);
          const mon = nextWeekday(1);
          const wed = nextWeekday(3);
          const seeds = [
            { title: "BIO 101", venue: "LT2", event_date: toISO(fri), event_time: "08:00:00", scope_type: "level", scope_value: "100L", status: "pending", authority_points: 0, required_points: 3.0, severity:"move", prev_venue:"LT2", prev_event_time:"08:00" },
            { title: "ANA 201", venue: "LT1", event_date: toISO(mon), event_time: "10:00:00", scope_type: "level", scope_value: "200L", status: "pending", authority_points: 0, required_points: 3.0, severity:"shift", prev_venue:null, prev_event_time:null },
            { title: "CHM 101", venue: "Cancelled", event_date: toISO(wed), event_time: "14:00:00", scope_type: "general", scope_value: null, status: "pending", authority_points: 0, required_points: 3.0, severity:"cancelled", prev_venue:null, prev_event_time:null },
          ];
          for (const s of seeds) {
            try {
              await sql`INSERT INTO physi_events (title, venue, event_date, event_time, scope_type, scope_value, status, authority_points, required_points, severity, prev_venue, prev_event_time) VALUES (${s.title}, ${s.venue}, ${s.event_date}, ${s.event_time}, ${s.scope_type}, ${s.scope_value}, ${s.status}, ${s.authority_points}, ${s.required_points}, ${s.severity}, ${s.prev_venue}, ${s.prev_event_time}) ON CONFLICT DO NOTHING`;
            } catch {}
          }
          // re-fetch after seed
          if (status) {
            rows = await sql`SELECT * FROM physi_events WHERE status = ${status} ORDER BY event_date DESC, event_time DESC LIMIT ${limit} OFFSET ${offset}`;
          } else {
            rows = await sql`SELECT * FROM physi_events ORDER BY event_date DESC, event_time DESC LIMIT ${limit} OFFSET ${offset}`;
          }
        } catch {}
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
