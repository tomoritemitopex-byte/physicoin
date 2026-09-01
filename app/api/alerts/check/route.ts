import { NextRequest, NextResponse } from "next/server";
import { getSql, isDbConfigured, dbNotConfigured, ensureAllTables } from "@/lib/db";
import { extractProfName, computeProfStats, riskFromReliability, minutesUntil } from "@/lib/profReliability";
import { liveStatus } from "@/lib/bunkRadar";
import { notifyCanonical } from "@/lib/adapters/notify";

export const dynamic = "force-dynamic";

/**
 * POST /api/alerts/check — Pre-class no-show alert
 * Body: { user_id, programme, level } — any combo; if user_id given, programme/level resolved from physi_users
 * Returns upcoming classes (next 7 days) for user's programme+level with prof_reliability + risk (HIGH/MEDIUM/LOW)
 * Auto-notifies via Telegram/WhatsApp for HIGH risk classes within 10 minutes of start.
 */

export async function POST(req: NextRequest) {
  const sql = getSql();
  if (!isDbConfigured() || !sql) return NextResponse.json(dbNotConfigured(), { status: 503 });
  try { await ensureAllTables(); } catch {}

  let body: any = {};
  try { body = await req.json().catch(() => ({})); } catch {}
  // also support query params for GET-like POST
  const url = new URL(req.url);
  let programme = String(body?.programme || body?.program || url.searchParams.get("programme") || url.searchParams.get("program") || "").trim();
  let level = String(body?.level || url.searchParams.get("level") || "").trim();
  const userId = String(body?.user_id || body?.userId || url.searchParams.get("user_id") || "").trim();

  // resolve from user if missing
  if ((!programme || !level) && userId) {
    try {
      const u = await sql`SELECT programme, level FROM physi_users WHERE id=${userId} LIMIT 1` as any[];
      if (u.length) {
        programme = programme || String(u[0].programme || "");
        level = level || String(u[0].level || "");
      }
    } catch {}
  }
  // fallback: try body scope_value contains both e.g. "200L" -> level
  if (!programme) programme = String(body?.scope_value || "").trim();

  // fetch upcoming events: next 7 days (including today)
  const today = new Date();
  const in7 = new Date(today); in7.setDate(in7.getDate() + 7);
  const pad = (n: number) => String(n).padStart(2, "0");
  const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fromISO = toISO(today);
  const toISO7 = toISO(in7);

  let events: any[] = [];
  try {
    // filter by scope: general (all) OR scope_value matches level/programme
    if (level) {
      events = await sql`
        SELECT id, title, venue, event_date, event_time, scope_type, scope_value, status, prof_name
        FROM physi_events
        WHERE event_date >= ${fromISO} AND event_date <= ${toISO7}
        AND (scope_type = 'general' OR lower(scope_value)=lower(${level}) OR lower(scope_value)=lower(${programme}) OR lower(scope_value)=lower(${programme + " " + level}) )
        ORDER BY event_date ASC, event_time ASC LIMIT 50
      ` as any[];
      // if still empty, broaden to all upcoming
      if (events.length === 0) {
        events = await sql`SELECT id, title, venue, event_date, event_time, scope_type, scope_value, status, prof_name FROM physi_events WHERE event_date >= ${fromISO} ORDER BY event_date ASC, event_time ASC LIMIT 50` as any[];
      }
    } else {
      events = await sql`SELECT id, title, venue, event_date, event_time, scope_type, scope_value, status, prof_name FROM physi_events WHERE event_date >= ${fromISO} ORDER BY event_date ASC, event_time ASC LIMIT 50` as any[];
    }
  } catch (e) {
    return NextResponse.json({ ok: false, code: "DB_ERROR", message: (e as Error).message }, { status: 500 });
  }

  const nowMs = Date.now();
  const enriched: any[] = [];

  for (const ev of events) {
    const profKey = String(ev.prof_name || "").trim() || extractProfName(String(ev.title || "")) || "";
    let stats: any = null;
    let risk: "HIGH" | "MEDIUM" | "LOW" = "LOW";
    let reliability: number | null = null;
    let total = 0;

    if (profKey) {
      try {
        // historical votes for this prof: join verifications through events with same prof_name OR extracted title match
        // prefer prof_name column if populated; fallback to title heuristic
        const profLower = profKey.toLowerCase();
        // votes for events whose prof_name matches OR title ilike prof
        let votes: any[] = [];
        try {
          votes = await sql`
            SELECT v.vote FROM physi_verifications v
            JOIN physi_events e ON e.id = v.event_id
            WHERE lower(e.prof_name)=lower(${profKey})
            LIMIT 500
          ` as any[];
        } catch {}
        // fallback: if no prof_name votes, try title contains prof last name
        if (votes.length === 0) {
          const last = profKey.split(" ").pop() || profKey;
          if (last.length >= 3) {
            try {
              votes = await sql`
                SELECT v.vote FROM physi_verifications v
                JOIN physi_events e ON e.id = v.event_id
                WHERE lower(e.title) LIKE ${`%${last.toLowerCase()}%`}
                LIMIT 500
              ` as any[];
            } catch {}
          }
        }
        if (votes.length > 0) {
          const s = computeProfStats(profKey, votes as any);
          stats = s;
          risk = s.risk;
          reliability = s.reliability;
          total = s.total;
        } else {
          // no history -> LOW but report prof
          stats = { prof_name: profKey, total: 0, yes: 0, no: 0, cancel: 0, reliability: null, no_show_rate: null, risk: "LOW" as const };
        }
      } catch {}
    }

    const mins = minutesUntil(String(ev.event_date).slice(0, 10), String(ev.event_time).slice(0, 5), nowMs);
    const isDueSoon = mins >= -5 && mins <= 10; // 10 min before until 5 min after start
    const sLive = liveStatus(String(ev.event_date).slice(0, 10), String(ev.event_time).slice(0, 5), nowMs, 0);
    enriched.push({
      ...ev,
      prof_name: profKey || null,
      prof_reliability: reliability,
      prof_reliability_pct: reliability != null ? Math.round(reliability * 100) : null,
      no_show_rate: reliability != null ? Math.round((1 - reliability) * 100) : null,
      votes_total: total,
      risk,
      minutes_until: Math.round(mins),
      is_due_soon: isDueSoon,
      live_status: sLive,
      notify_due: risk === "HIGH" && isDueSoon,
    });
  }

  // Auto-notify HIGH risk due-soon classes (fire-and-forget, env-light)
  const toNotify = enriched.filter((e) => e.notify_due);
  if (toNotify.length > 0) {
    for (const ev of toNotify) {
      try {
        await notifyCanonical({
          id: ev.id,
          title: `⚠️ No-show risk HIGH — ${ev.title}`,
          venue: ev.venue,
          event_date: String(ev.event_date).slice(0, 10),
          event_time: String(ev.event_time).slice(0, 5),
          yes_ratio: ev.prof_reliability,
          // custom text handled by notify fallback
        } as any);
      } catch {}
    }
  }

  const highCount = enriched.filter((e) => e.risk === "HIGH").length;
  return NextResponse.json({
    ok: true,
    programme: programme || null,
    level: level || null,
    now: new Date().toISOString(),
    window: { from: fromISO, to: toISO7 },
    events: enriched,
    count: enriched.length,
    high_risk: highCount,
    notified: toNotify.map((e) => e.id),
  });
}

export async function GET(req: NextRequest) {
  // Allow GET with query params for convenience; delegate to POST logic
  const url = new URL(req.url);
  const fakeReq = { json: async () => ({}), url: req.url } as any;
  // Build a synthetic POST body from query
  const body = {
    user_id: url.searchParams.get("user_id") || "",
    programme: url.searchParams.get("programme") || "",
    level: url.searchParams.get("level") || "",
  };
  // monkey patch req.json for internal call
  (req as any)._body = body;
  // Instead just run same logic via inline fetch-like POST call
  return POST(new NextRequest(req.url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
}
