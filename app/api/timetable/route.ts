import { NextResponse } from "next/server";
import { sql, isDbConfigured, dbNotConfigured, ensureAllTables } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isDbConfigured() || !sql) return NextResponse.json(dbNotConfigured(), { status: 503 });
  try { await ensureAllTables(); } catch {}
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 200);
  const offset = Math.max(parseInt(searchParams.get("offset") ?? "0", 10) || 0, 0);

  let rows: any[];
  if (status) {
    rows = await sql`SELECT * FROM physi_events WHERE status = ${status} ORDER BY event_date DESC, event_time DESC LIMIT ${limit} OFFSET ${offset}`;
  } else {
    rows = await sql`SELECT * FROM physi_events ORDER BY event_date DESC, event_time DESC LIMIT ${limit} OFFSET ${offset}`;
  }
  return NextResponse.json({ ok: true, events: rows, count: rows.length });
}

export async function POST(req: Request) {
  if (!isDbConfigured() || !sql) return NextResponse.json(dbNotConfigured(), { status: 503 });
  await ensureAllTables();
  const body = await req.json().catch(() => null);
  if (!body?.title || !body?.venue || !body?.event_date || !body?.event_time || !body?.scope_type) {
    return NextResponse.json({ ok: false, code: "BAD_INPUT", error: "title, venue, event_date, event_time, scope_type required" }, { status: 400 });
  }
  const r = await sql`
    INSERT INTO physi_events (title, venue, event_date, event_time, scope_type, scope_value, status, authority_points, required_points, created_by)
    VALUES (${body.title}, ${body.venue}, ${body.event_date}, ${body.event_time}, ${body.scope_type}, ${body.scope_value ?? null}, ${body.status ?? "pending"}, ${body.authority_points ?? 0}, ${body.required_points ?? 0}, ${body.created_by ?? null})
    RETURNING *`;
  return NextResponse.json({ ok: true, event: r[0] }, { status: 201 });
}
