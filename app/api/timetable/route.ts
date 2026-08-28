import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { ensureEventsTable } from "@/lib/ensure";

type Confidence = "green" | "yellow" | "red";

function confidenceFor(status: string, eventDate: string): Confidence {
  const d = new Date(eventDate);
  const diff = d.getTime() - Date.now();
  const days = diff / (1000 * 60 * 60 * 24);
  if (status === "canonical") return "green";
  if (days < 0) return "red";
  if (days < 2) return "yellow";
  return "yellow";
}

export const dynamic = 'force-dynamic';

// GET /api/timetable -> derives timetable slots from physi_events + fallback mock
export async function GET() {
  try {
    if (!sql) {
      return NextResponse.json({
        ok: true,
        source: "mock-no-db",
        slots: mockSlots(),
        syncedAt: new Date().toISOString(),
        banner: 'Timetable in mock mode — DATABASE_URL not configured.',
      });
    }

    await ensureEventsTable();

    const events = await sql`
      SELECT id, title, venue, event_date, event_time, scope_type, scope_value, status, created_at
      FROM physi_events
      ORDER BY event_date ASC, event_time ASC
      LIMIT 80;
    `;

    if (events.length === 0) {
      return NextResponse.json({
        ok: true,
        source: "mock-empty-db",
        slots: mockSlots(),
        syncedAt: new Date().toISOString(),
      });
    }

    const dayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    const slots = events.map((e: Record<string, unknown>) => {
      const dateStr = String(e.event_date).slice(0,10);
      const timeStr = String(e.event_time).slice(0,5);
      const d = new Date(String(e.event_date));
      const day = dayNames[d.getDay()] ?? "Monday";
      const confidence = confidenceFor(String(e.status), String(e.event_date));
      const syncNote =
        confidence === "green" ? "Synced live · verified canonical" :
        confidence === "yellow" ? "Sync pending · awaiting verification" :
        "Stale · needs resync / duplicate guard";
      return {
        id: e.id,
        code: String(e.scope_value ?? e.scope_type ?? "EVT").toUpperCase().slice(0,10),
        title: e.title,
        venue: e.venue,
        time: timeStr,
        day,
        date: dateStr,
        lecturer: e.status === "canonical" ? "Canonical · FUHSI" : "Personal bubble",
        confidence,
        syncNote,
        scope_type: e.scope_type,
        status: e.status,
      };
    });

    return NextResponse.json({ ok: true, source: "physi_events", slots, syncedAt: new Date().toISOString() });
  } catch (err) {
    console.error("timetable GET failed", err);
    return NextResponse.json({ ok: true, source: "mock-fallback", slots: mockSlots(), syncedAt: new Date().toISOString(), error: 'timetable fallback due to DB error' });
  }
}

function mockSlots() {
  return [
    { id: "1", code: "ANA 202", title: "Gross Anatomy II", venue: "LT 1 · FUHSI", time: "08:00 – 10:00", day: "Monday", date: "2026-09-02", lecturer: "Dr. A. Cole", confidence: "green" as Confidence, syncNote: "Synced 2m ago · verified room", scope_type: "faculty", status: "canonical" },
    { id: "2", code: "PHS 211", title: "Physiology: Cardiovascular", venue: "PHS Lab", time: "10:15 – 12:15", day: "Monday", lecturer: "Prof. B. Musa", confidence: "green" as Confidence, syncNote: "Synced live · timetable match", scope_type: "faculty", status: "canonical" },
    { id: "3", code: "BCH 203", title: "Metabolism & Enzymes", venue: "LT 2", time: "13:00 – 15:00", day: "Tuesday", lecturer: "Dr. K. Okon", confidence: "yellow" as Confidence, syncNote: "Sync delayed 18m · room tentative", scope_type: "programme", status: "personal" },
    { id: "4", code: "ANA 205", title: "Histology Practical", venue: "Anatomy Lab B", time: "09:00 – 11:00", day: "Wednesday", lecturer: "Dr. S. Balogun", confidence: "yellow" as Confidence, syncNote: "Manual entry · awaiting verification", scope_type: "personal", status: "personal" },
    { id: "5", code: "GNS 201", title: "Use of English II", venue: "Hall B", time: "15:30 – 17:00", day: "Thursday", lecturer: "Mr. J. Peters", confidence: "red" as Confidence, syncNote: "Conflict detected · overlaps MBBS 301", scope_type: "level", status: "personal" },
    { id: "6", code: "PHA 204", title: "Pharmacology Principles", venue: "LT 3", time: "08:30 – 10:30", day: "Friday", lecturer: "Prof. L. Adeyemi", confidence: "red" as Confidence, syncNote: "Source stale 2h · needs resync", scope_type: "level", status: "personal" },
  ];
}
