import { NextResponse } from "next/server";
import { sql, isDbConfigured, dbNotConfigured, ensureAllTables } from "@/lib/db";
export const dynamic = "force-dynamic";
// Thin alias — canonical is /api/timetable
export async function GET(req: Request) {
  if (!isDbConfigured() || !sql) return NextResponse.json(dbNotConfigured(), { status: 503 });
  try { await ensureAllTables(); } catch {}
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 200);
  const rows = await sql`SELECT * FROM physi_events ORDER BY event_date DESC, event_time DESC LIMIT ${limit}`;
  return NextResponse.json({ ok: true, events: rows });
}
export async function POST(req: Request) {
  const { POST: create } = await import("../timetable/route");
  return (create as any)(req);
}
