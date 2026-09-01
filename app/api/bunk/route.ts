import { NextRequest, NextResponse } from "next/server";
import { getSql, isDbConfigured, dbNotConfigured, ensureAllTables, ensureBunkTables } from "@/lib/db";
import { liveStatus } from "@/lib/bunkRadar";
import { weightFromTotal } from "@/lib/voteWeight";

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
      const reports = await sql`SELECT id, reporter_id::text as reporter_id, vote, created_at FROM physi_bunk_reports WHERE event_id=${eventId} ORDER BY created_at DESC LIMIT 50` as any[];
      const noShow = (reports as any[]).filter(r => r.vote === "no_show").length;
      const happening = (reports as any[]).filter(r => r.vote === "happening").length;
      const status = liveStatus(String((ev[0] as any).event_date).slice(0, 10), String((ev[0] as any).event_time).slice(0, 5), nowMs, noShow);
      const alert = noShow >= 3;
      // trust enrichment for single event
      let avgTrust: number | null = null;
      let reporterWeights: number[] = [];
      let verifiedWitnesses = 0;
      try {
        const ids = Array.from(new Set((reports as any[]).map(r=> String(r.reporter_id||"")).filter(Boolean)));
        if (ids.length) {
          const wmap = new Map<string, number>();
          await Promise.all(ids.map(async (uid) => {
            try {
              const [c1,c2,c3,c4] = await Promise.all([
                sql`SELECT COUNT(*)::int AS c FROM physi_verifications WHERE verifier_id=${uid}`.then((r:any)=>Number(r[0]?.c||0)).catch(()=>0),
                sql`SELECT COUNT(*)::int AS c FROM physi_scope_votes WHERE voter_id=${uid}`.then((r:any)=>Number(r[0]?.c||0)).catch(()=>0),
                sql`SELECT COUNT(*)::int AS c FROM physi_hall_alias_votes WHERE voter_id=${uid}`.then((r:any)=>Number(r[0]?.c||0)).catch(()=>0),
                sql`SELECT COUNT(*)::int AS c FROM physi_prof_alias_votes WHERE voter_id=${uid}`.then((r:any)=>Number(r[0]?.c||0)).catch(()=>0),
              ]);
              wmap.set(uid, weightFromTotal(c1+c2+c3+c4));
            } catch { wmap.set(uid, 1); }
          }));
          reporterWeights = (reports as any[]).filter(r=>r.reporter_id).map(r=> wmap.get(String(r.reporter_id)) ?? 1);
          if (reporterWeights.length) avgTrust = Number((reporterWeights.reduce((a,b)=>a+b,0)/reporterWeights.length).toFixed(2));
          verifiedWitnesses = reporterWeights.filter(w=>w>=1.25).length;
        }
      } catch {}
      return NextResponse.json({ ok: true, event: ev[0], reports, no_show_count: noShow, happening_count: happening, live_status: status, alert, threshold: 3, avg_trust: avgTrust, reporter_weights: reporterWeights, verified_witness_count: verifiedWitnesses });
    }
    // list today + tomorrow + ongoing window: fetch recent events and compute status + trust
    const rows = await sql`SELECT id, title, venue, event_date, event_time, status FROM physi_events ORDER BY event_date DESC, event_time DESC LIMIT 40`;
    const enriched: any[] = [];
    // batch collect reporter_ids for weight lookup
    const allReporterIds: string[] = [];
    const reportsByEvent = new Map<string, any[]>();
    for (const r of rows as any[]) {
      try {
        const reports = await sql`SELECT vote, reporter_id::text as reporter_id FROM physi_bunk_reports WHERE event_id=${r.id} LIMIT 20` as any[];
        reportsByEvent.set(String(r.id), reports);
        for (const rep of reports) if (rep.reporter_id) allReporterIds.push(String(rep.reporter_id));
      } catch {
        reportsByEvent.set(String(r.id), []);
      }
    }
    // compute weights map
    const weightMap = new Map<string, number>();
    if (allReporterIds.length) {
      const uniq = Array.from(new Set(allReporterIds));
      await Promise.all(uniq.map(async (uid) => {
        try {
          const [c1,c2,c3,c4] = await Promise.all([
            sql`SELECT COUNT(*)::int AS c FROM physi_verifications WHERE verifier_id=${uid}`.then((r:any)=>Number(r[0]?.c||0)).catch(()=>0),
            sql`SELECT COUNT(*)::int AS c FROM physi_scope_votes WHERE voter_id=${uid}`.then((r:any)=>Number(r[0]?.c||0)).catch(()=>0),
            sql`SELECT COUNT(*)::int AS c FROM physi_hall_alias_votes WHERE voter_id=${uid}`.then((r:any)=>Number(r[0]?.c||0)).catch(()=>0),
            sql`SELECT COUNT(*)::int AS c FROM physi_prof_alias_votes WHERE voter_id=${uid}`.then((r:any)=>Number(r[0]?.c||0)).catch(()=>0),
          ]);
          weightMap.set(uid, weightFromTotal(c1+c2+c3+c4));
        } catch { weightMap.set(uid, 1); }
      }));
    }
    for (const r of rows as any[]) {
      try {
        const reports = reportsByEvent.get(String(r.id)) || [];
        const noShow = (reports as any[]).filter(x => x.vote === "no_show").length;
        const s = liveStatus(String(r.event_date).slice(0, 10), String(r.event_time).slice(0, 5), nowMs, noShow);
        const reporterWeights = (reports as any[]).filter(x=>x.reporter_id).map(x=> weightMap.get(String(x.reporter_id)) ?? 1);
        const avgTrust = reporterWeights.length ? Number((reporterWeights.reduce((a,b)=>a+b,0)/reporterWeights.length).toFixed(2)) : null;
        const verifiedWitnesses = reporterWeights.filter(w=>w>=1.25).length;
        enriched.push({ ...r, no_show_count: noShow, live_status: s, alert: noShow >= 3, avg_trust: avgTrust, reporter_weights: reporterWeights, verified_witness_count: verifiedWitnesses });
      } catch {
        enriched.push({ ...r, no_show_count: 0, live_status: liveStatus(String(r.event_date).slice(0, 10), String(r.event_time).slice(0, 5), nowMs, 0), alert: false, avg_trust: null, reporter_weights: [], verified_witness_count: 0 });
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
