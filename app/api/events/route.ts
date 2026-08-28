import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

// ---------- helpers ----------
function bad(msg: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, error: msg, ...extra }, { status });
}
function dbDown() {
  return NextResponse.json({ ok: false, error: 'DATABASE_URL is not configured yet.', code: 'DB_NOT_CONFIGURED' }, { status: 503 });
}
async function ensureEventsTable() {
  if (!sql) return;
  await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto;`;
  await sql`
    CREATE TABLE IF NOT EXISTS physi_users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      full_name TEXT NOT NULL,
      nickname TEXT NOT NULL,
      programme TEXT NOT NULL,
      level TEXT NOT NULL,
      statuses JSONB NOT NULL DEFAULT '[]'::jsonb,
      authority_base NUMERIC(3,2) NOT NULL DEFAULT 1.00,
      authority_final NUMERIC(3,2) NOT NULL DEFAULT 1.00,
      mining_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS physi_users_nickname_lower_uidx ON physi_users (lower(nickname));`;
  await sql`
    CREATE TABLE IF NOT EXISTS physi_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title TEXT NOT NULL,
      venue TEXT NOT NULL,
      event_date DATE NOT NULL,
      event_time TIME NOT NULL,
      scope_type TEXT NOT NULL,
      scope_value TEXT,
      status TEXT NOT NULL DEFAULT 'personal',
      authority_points NUMERIC(10,2) NOT NULL DEFAULT 0,
      required_points NUMERIC(10,2) NOT NULL DEFAULT 0,
      created_by UUID REFERENCES physi_users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS physi_events_date_time_idx ON physi_events (event_date DESC, event_time DESC);`;
  await sql`CREATE INDEX IF NOT EXISTS physi_events_status_idx ON physi_events (status);`;
  // Duplicate guard at DB level — prevents race
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS physi_events_title_venue_date_uidx ON physi_events (lower(title), lower(venue), event_date);`;
}

function deriveStatus(scopeType: string): 'personal' | 'canonical' {
  const s = scopeType.trim().toLowerCase();
  const canonicalScopes = ['global', 'university', 'faculty', 'all', 'canonical', 'department'];
  if (canonicalScopes.includes(s)) return 'canonical';
  return 'personal';
}

const VALID_SCOPE_TYPES = ['personal', 'department', 'faculty', 'university', 'global', 'all', 'canonical', 'programme', 'level'] as const;

// ---------- GET /api/events ----------
export async function GET(request: Request) {
  try {
    if (!sql) return dbDown();
    await ensureEventsTable();

    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status')?.trim().toLowerCase() || null; // personal|canonical
    const scopeFilter = searchParams.get('scope_type')?.trim().toLowerCase() || null;
    const limitRaw = searchParams.get('limit')?.trim() || '200';
    const limit = Math.min(200, Math.max(1, parseInt(limitRaw, 10) || 200));

    let events;
    if (statusFilter && ['personal', 'canonical'].includes(statusFilter)) {
      events = await sql`
        SELECT e.id, e.title, e.venue, e.event_date, e.event_time, e.scope_type, e.scope_value, e.status, e.authority_points, e.required_points, e.created_by, e.created_at, e.updated_at,
               u.nickname as created_by_nickname
        FROM physi_events e
        LEFT JOIN physi_users u ON u.id = e.created_by
        WHERE e.status = ${statusFilter}
        ORDER BY e.event_date DESC, e.event_time DESC, e.created_at DESC
        LIMIT ${limit};
      `;
    } else if (scopeFilter) {
      events = await sql`
        SELECT e.id, e.title, e.venue, e.event_date, e.event_time, e.scope_type, e.scope_value, e.status, e.authority_points, e.required_points, e.created_by, e.created_at, e.updated_at,
               u.nickname as created_by_nickname
        FROM physi_events e
        LEFT JOIN physi_users u ON u.id = e.created_by
        WHERE lower(e.scope_type) = lower(${scopeFilter})
        ORDER BY e.event_date DESC, e.event_time DESC, e.created_at DESC
        LIMIT ${limit};
      `;
    } else {
      events = await sql`
        SELECT e.id, e.title, e.venue, e.event_date, e.event_time, e.scope_type, e.scope_value, e.status, e.authority_points, e.required_points, e.created_by, e.created_at, e.updated_at,
               u.nickname as created_by_nickname
        FROM physi_events e
        LEFT JOIN physi_users u ON u.id = e.created_by
        ORDER BY e.event_date DESC, e.event_time DESC, e.created_at DESC
        LIMIT ${limit};
      `;
    }

    return NextResponse.json({ ok: true, count: events.length, events });
  } catch (error) {
    console.error('[events][GET] failed:', error);
    return NextResponse.json({ ok: false, error: 'Could not fetch events.' }, { status: 500 });
  }
}

// ---------- POST /api/events ----------
export async function POST(request: Request) {
  try {
    if (!sql) return dbDown();
    await ensureEventsTable();

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return bad('Invalid JSON body.', 400);

    const b = body as Record<string, unknown>;
    const title = String(b.title ?? '').trim();
    const venue = String(b.venue ?? '').trim();
    const event_date = String(b.event_date ?? b.eventDate ?? '').trim();
    const event_time = String(b.event_time ?? b.eventTime ?? '').trim();
    const scope_type = String(b.scope_type ?? b.scopeType ?? 'personal').trim() || 'personal';
    const scope_value = b.scope_value != null && String(b.scope_value).trim() !== '' ? String(b.scope_value).trim() : null;
    const created_by_nickname = String(b.created_by_nickname ?? b.created_by ?? b.createdBy ?? '').trim() || null;

    // Validation
    if (!title || !venue || !event_date || !event_time) {
      return bad('title, venue, event_date, and event_time are required.', 400);
    }
    if (title.length < 2 || title.length > 200) return bad('title must be 2–200 chars.', 400);
    if (venue.length < 2 || venue.length > 200) return bad('venue must be 2–200 chars.', 400);
    if (scope_type.length > 40) return bad('scope_type too long (max 40).', 400);
    if (scope_value && scope_value.length > 120) return bad('scope_value too long (max 120).', 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(event_date)) return bad('event_date must be YYYY-MM-DD.', 400);
    const d = new Date(event_date);
    if (Number.isNaN(d.getTime())) return bad('event_date is not a valid date.', 400);
    if (!/^\d{2}:\d{2}(:\d{2})?$/.test(event_time)) return bad('event_time must be HH:MM or HH:MM:SS.', 400);
    const [hh, mm, ss] = event_time.split(':').map(Number);
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59 || (ss != null && (ss < 0 || ss > 59))) {
      return bad('event_time has invalid hour/minute/second range.', 400);
    }

    // Duplicate guard (case-insensitive title+venue+date) — friendly 409 before DB unique error
    const existing = await sql`
      SELECT id, title, venue, event_date, scope_type, status
      FROM physi_events
      WHERE lower(title) = lower(${title})
        AND event_date = ${event_date}::date
        AND lower(venue) = lower(${venue})
      LIMIT 1;
    `;
    if (existing.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Duplicate event: same title, date, and venue already exists.',
          code: 'DUPLICATE_EVENT',
          duplicate: existing[0],
        },
        { status: 409 }
      );
    }

    // Resolve created_by via nickname (FK guard)
    let created_by: string | null = null;
    if (created_by_nickname) {
      if (created_by_nickname.length > 30) return bad('created_by_nickname too long.', 400);
      const [user] = await sql`SELECT id FROM physi_users WHERE lower(nickname) = lower(${created_by_nickname}) LIMIT 1;`;
      if (user) created_by = String(user.id);
      // If nickname not found we still allow creation with NULL created_by (open submission) — still production-valid
    }

    const status = deriveStatus(scope_type);
    const authority_points = status === 'canonical' ? 0 : 0;
    const required_points = status === 'canonical' ? 5 : 0;

    let inserted;
    try {
      const rows = await sql`
        INSERT INTO physi_events (title, venue, event_date, event_time, scope_type, scope_value, status, authority_points, required_points, created_by)
        VALUES (${title}, ${venue}, ${event_date}::date, ${event_time}::time, ${scope_type}, ${scope_value}, ${status}, ${authority_points}, ${required_points}, ${created_by}::uuid)
        RETURNING id, title, venue, event_date, event_time, scope_type, scope_value, status, authority_points, required_points, created_by, created_at;
      `;
      inserted = rows[0];
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('duplicate') || msg.includes('physi_events_title_venue_date_uidx') || msg.includes('unique')) {
        return NextResponse.json(
          { ok: false, error: 'Duplicate event (race). Same title/venue/date already inserted.', code: 'DUPLICATE_EVENT' },
          { status: 409 }
        );
      }
      throw e;
    }

    return NextResponse.json({ ok: true, event: inserted, promoted: status === 'canonical' }, { status: 201 });
  } catch (error) {
    console.error('[events][POST] failed:', error);
    return NextResponse.json({ ok: false, error: 'Could not create event right now.' }, { status: 500 });
  }
}
