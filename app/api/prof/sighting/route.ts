import { NextRequest, NextResponse } from "next/server";
import { getSql, isDbConfigured, dbNotConfigured, ensureAllTables, ensureProfSightings } from "@/lib/db";
import { profGroupKey, displayProfName } from "@/lib/profMatch";

export const dynamic = "force-dynamic";

/**
 * POST /api/prof/sighting { prof_name, building|venue, event_id?, sighted_by, sighted_at? }
 * Records prof sighting when student verifies class held.
 * GET /api/prof/sighting?prof=Adams or ?event_id=... or ?building=LT2
 * Returns "Prof X: LT2 (verified N min ago)"
 */

export async function POST(req: NextRequest) {
  const sql = getSql();
  if (!isDbConfigured() || !sql) return NextResponse.json(dbNotConfigured(), { status: 503 });
  try { await ensureAllTables(); await ensureProfSightings(); } catch {}
  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ ok:false, code:"BAD_INPUT", message:"JSON required"}, {status:400}); }
  const prof_name = String(b?.prof_name || b?.prof || "").trim().slice(0,80);
  const building = String(b?.building || b?.venue || "").trim().slice(0,80);
  const venue = String(b?.venue || b?.building || "").trim().slice(0,80);
  const event_id = b?.event_id ? String(b.event_id).trim() : null;
  const sighted_by = b?.sighted_by ? String(b.sighted_by).trim() : (b?.user_id ? String(b.user_id).trim() : null);
  if (!prof_name || !building) return NextResponse.json({ ok:false, code:"BAD_INPUT", message:"prof_name and building/venue required"}, {status:400});
  const gk = profGroupKey(prof_name);
  const display = displayProfName(prof_name) || prof_name;
  try {
    if (sighted_by) {
      const u=await sql`SELECT id FROM physi_users WHERE id=${sighted_by} LIMIT 1`;
      if (!u.length) return NextResponse.json({ok:false, code:"NOT_FOUND", message:"sighted_by not found"}, {status:404});
    }
    if (event_id) {
      const ev=await sql`SELECT id FROM physi_events WHERE id=${event_id} LIMIT 1`;
      if (!ev.length) return NextResponse.json({ok:false, code:"NOT_FOUND", message:"event not found"}, {status:404});
    }
    const rows = await sql`INSERT INTO physi_prof_sightings (prof_name, prof_group_key, building, venue, event_id, sighted_by) VALUES (${display}, ${gk}, ${building}, ${venue}, ${event_id}, ${sighted_by}) RETURNING *`;
    return NextResponse.json({ ok:true, sighting: rows[0] }, { status:201 });
  } catch (e:any) {
    return NextResponse.json({ ok:false, code:"INTERNAL", message: String(e.message||e)}, {status:500});
  }
}

export async function GET(req: NextRequest) {
  const sql = getSql();
  if (!isDbConfigured() || !sql) return NextResponse.json(dbNotConfigured(), { status:503 });
  try { await ensureAllTables(); await ensureProfSightings(); } catch {}
  const { searchParams } = new URL(req.url);
  const prof = searchParams.get("prof") || searchParams.get("prof_name") || searchParams.get("name") || "";
  const building = searchParams.get("building") || "";
  const eventId = searchParams.get("event_id") || "";
  try {
    if (eventId) {
      const rows = await sql`SELECT * FROM physi_prof_sightings WHERE event_id=${eventId} ORDER BY sighted_at DESC LIMIT 10`;
      const enriched = rows.map((r:any)=>({...r, ago_min: Math.max(0, Math.round((Date.now()-new Date(String(r.sighted_at)).getTime())/60000))}));
      return NextResponse.json({ ok:true, sightings: enriched, count: enriched.length });
    }
    if (prof) {
      const gk = profGroupKey(prof);
      const rows = await sql`SELECT * FROM physi_prof_sightings WHERE prof_group_key=${gk} ORDER BY sighted_at DESC LIMIT 10`;
      const enriched = rows.map((r:any)=>({...r, ago_min: Math.max(0, Math.round((Date.now()-new Date(String(r.sighted_at)).getTime())/60000)), label: `${r.prof_name}: ${r.building || r.venue} (verified ${Math.max(0, Math.round((Date.now()-new Date(String(r.sighted_at)).getTime())/60000))} min ago)`}));
      return NextResponse.json({ ok:true, sightings: enriched, count: enriched.length });
    }
    if (building) {
      const rows = await sql`SELECT * FROM physi_prof_sightings WHERE lower(building)=lower(${building}) ORDER BY sighted_at DESC LIMIT 20`;
      return NextResponse.json({ ok:true, sightings: rows, count: rows.length });
    }
    const rows = await sql`SELECT * FROM physi_prof_sightings ORDER BY sighted_at DESC LIMIT 20`;
    return NextResponse.json({ ok:true, sightings: rows, count: rows.length });
  } catch (e:any) {
    return NextResponse.json({ ok:false, code:"INTERNAL", message: String(e.message||e)}, {status:500});
  }
}
