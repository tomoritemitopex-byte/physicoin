import { NextRequest, NextResponse } from "next/server";
import { getSql, isDbConfigured, dbNotConfigured, ensureAllTables } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * POST /api/events/repeat { user_id, scope_value? }
 * Creates all events from user's last week's pattern (same weekday title/venue/time).
 * For each event created_by = user_id in last 7 days, create same event +7 days forward.
 * Idempotent via ON CONFLICT DO NOTHING on (lower(title), lower(venue), event_date)
 */

export async function POST(req: NextRequest) {
  const sql = getSql();
  if (!isDbConfigured() || !sql) return NextResponse.json(dbNotConfigured(), { status:503 });
  try { await ensureAllTables(); } catch {}
  let b:any;
  try { b = await req.json(); } catch { return NextResponse.json({ok:false, code:"BAD_INPUT", message:"JSON required"}, {status:400}); }
  const userId = String(b?.user_id || b?.userId || "").trim();
  if (!userId) return NextResponse.json({ok:false, code:"BAD_INPUT", message:"user_id required"}, {status:400});
  try {
    const u = await sql`SELECT id FROM physi_users WHERE id=${userId} LIMIT 1`;
    if (!u.length) return NextResponse.json({ok:false, code:"NOT_FOUND", message:"user not found"}, {status:404});

    // fetch events created by this user in last 7 days (by event_date)
    const sevenAgo = new Date(); sevenAgo.setDate(sevenAgo.getDate()-7);
    const pad = (n:number)=>String(n).padStart(2,"0");
    const since = `${sevenAgo.getFullYear()}-${pad(sevenAgo.getMonth()+1)}-${pad(sevenAgo.getDate())}`;
    let rows:any[];
    if (b?.scope_value) {
      const sv = String(b.scope_value).trim();
      rows = await sql`SELECT * FROM physi_events WHERE created_by=${userId} AND event_date >= ${since}::date AND scope_value=${sv} ORDER BY event_date ASC` as any[];
      if (!rows.length) rows = await sql`SELECT * FROM physi_events WHERE created_by=${userId} ORDER BY event_date DESC LIMIT 10` as any[];
    } else {
      rows = await sql`SELECT * FROM physi_events WHERE created_by=${userId} AND event_date >= ${since}::date ORDER BY event_date ASC` as any[];
      if (!rows.length) rows = await sql`SELECT * FROM physi_events WHERE created_by=${userId} ORDER BY event_date DESC LIMIT 10` as any[];
    }
    if (!rows.length) return NextResponse.json({ok:false, code:"NO_HISTORY", message:"No recent events to repeat — post one first"}, {status:404});

    const created: any[] = [];
    const errors: string[] = [];
    for (const ev of rows as any[]) {
      const oldDate = new Date(String(ev.event_date).slice(0,10)+"T00:00:00");
      const nextDate = new Date(oldDate); nextDate.setDate(nextDate.getDate()+7);
      const nd = `${nextDate.getFullYear()}-${pad(nextDate.getMonth()+1)}-${pad(nextDate.getDate())}`;
      const nt = String(ev.event_time).slice(0,5);
      try {
        const ins = await sql`INSERT INTO physi_events (title, venue, event_date, event_time, scope_type, scope_value, status, authority_points, required_points, created_by, severity, prev_venue, prev_event_time, prof_name)
          VALUES (${String(ev.title)}, ${String(ev.venue)}, ${nd}, ${nt}, ${String(ev.scope_type)}, ${ev.scope_value}, 'pending', 0, ${ev.required_points || 3}, ${userId}, ${String(ev.severity||'move')}, ${ev.venue}, ${nt}, ${ev.prof_name})
          ON CONFLICT (lower(title), lower(venue), event_date) DO NOTHING RETURNING *`;
        if (ins.length) created.push(ins[0]);
      } catch (e:any) {
        errors.push(`${ev.title} ${nd}: ${String(e.message).slice(0,80)}`);
      }
    }
    return NextResponse.json({ ok:true, created: created.length, events: created, source_count: rows.length, errors: errors.length?errors:undefined });
  } catch (e:any) {
    return NextResponse.json({ok:false, code:"INTERNAL", message:String(e.message||e)}, {status:500});
  }
}
