import { NextRequest, NextResponse } from "next/server";
import { getSql, isDbConfigured, dbNotConfigured, ensureAllTables } from "@/lib/db";
import { generateICSForMany } from "@/lib/calendar";

export const dynamic = "force-dynamic";

/**
 * GET /api/calendar/ics — Calendar export for user's programme+level events
 * Query: ?user_id=... OR ?programme=PHYS&level=200L OR none (returns all upcoming)
 * Returns: text/calendar .ics file (VCALENDAR with VEVENT per class)
 */

export async function GET(req: NextRequest) {
  const sql = getSql();
  if (!isDbConfigured() || !sql) return NextResponse.json(dbNotConfigured(), { status: 503 });
  try { await ensureAllTables(); } catch {}

  const { searchParams } = new URL(req.url);
  let programme = String(searchParams.get("programme") || searchParams.get("program") || "").trim();
  let level = String(searchParams.get("level") || "").trim();
  const userId = String(searchParams.get("user_id") || searchParams.get("userId") || "").trim();

  if ((!programme || !level) && userId) {
    try {
      const u = await sql`SELECT programme, level FROM physi_users WHERE id=${userId} LIMIT 1` as any[];
      if (u.length) {
        programme = programme || String(u[0].programme || "");
        level = level || String(u[0].level || "");
      }
    } catch {}
  }

  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fromISO = toISO(today);

  let events: any[] = [];
  try {
    if (level) {
      events = await sql`
        SELECT id, title, venue, event_date, event_time, scope_type, scope_value, status
        FROM physi_events
        WHERE event_date >= ${fromISO}
        AND (scope_type = 'general' OR lower(scope_value)=lower(${level}) OR lower(scope_value)=lower(${programme}) OR lower(scope_value)=lower(${programme + " " + level}))
        ORDER BY event_date ASC, event_time ASC LIMIT 100
      ` as any[];
      if (events.length === 0) {
        events = await sql`SELECT id, title, venue, event_date, event_time, scope_type, scope_value, status FROM physi_events WHERE event_date >= ${fromISO} ORDER BY event_date ASC, event_time ASC LIMIT 100` as any[];
      }
    } else if (programme) {
      events = await sql`
        SELECT id, title, venue, event_date, event_time, scope_type, scope_value, status
        FROM physi_events WHERE event_date >= ${fromISO}
        AND (scope_type='general' OR lower(scope_value)=lower(${programme}))
        ORDER BY event_date ASC, event_time ASC LIMIT 100
      ` as any[];
    } else {
      events = await sql`SELECT id, title, venue, event_date, event_time, scope_type, scope_value, status FROM physi_events WHERE event_date >= ${fromISO} ORDER BY event_date ASC, event_time ASC LIMIT 100` as any[];
    }
  } catch (e) {
    return NextResponse.json({ ok: false, code: "DB_ERROR", message: (e as Error).message }, { status: 500 });
  }

  const origin = req.headers.get("origin") || req.headers.get("x-forwarded-host") ? `https://${req.headers.get("x-forwarded-host")}` : "https://physicoin.vercel.app";
  const calName = programme || level ? `Physicoin · ${[programme, level].filter(Boolean).join(" ")}` : "Physicoin Classes";

  const ics = generateICSForMany(events as any, { calendarName: calName, linkBase: origin });

  const filename = `physicoin-${[programme, level].filter(Boolean).join("-") || "classes"}.ics`;

  return new NextResponse(ics, {
    status: 200,
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
