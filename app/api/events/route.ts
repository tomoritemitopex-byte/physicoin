import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

async function ensureEventsTable() {
  if (!sql) return;
  await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto;`;
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
}

function deriveStatus(scope_type: string): 'personal' | 'canonical' {
  const s = scope_type.trim().toLowerCase();
  // Broad scopes promote to canonical; narrow/personal remains personal
  const canonicalScopes = ['global', 'university', 'faculty', 'all', 'canonical'];
  if (canonicalScopes.includes(s)) return 'canonical';
  return 'personal';
}

// GET /api/events -> list physi_events ordered by event_date desc
export async function GET() {
  try {
    if (!sql) {
      return NextResponse.json({ ok: false, error: 'DATABASE_URL is not configured yet.' }, { status: 503 });
    }
    await ensureEventsTable();
    const events = await sql`
      SELECT e.id, e.title, e.venue, e.event_date, e.event_time, e.scope_type, e.scope_value, e.status, e.authority_points, e.required_points, e.created_by, e.created_at, e.updated_at,
             u.nickname as created_by_nickname
      FROM physi_events e
      LEFT JOIN physi_users u ON u.id = e.created_by
      ORDER BY e.event_date DESC, e.event_time DESC, e.created_at DESC
      LIMIT 200;
    `;
    return NextResponse.json({ ok: true, events });
  } catch (error) {
    console.error('Events GET failed:', error);
    return NextResponse.json({ ok: false, error: 'Could not fetch events.' }, { status: 500 });
  }
}

// POST /api/events { title, venue, event_date, event_time, scope_type, scope_value, created_by_nickname }
export async function POST(request: Request) {
  try {
    if (!sql) {
      return NextResponse.json({ ok: false, error: 'DATABASE_URL is not configured yet.' }, { status: 503 });
    }
    await ensureEventsTable();

    const body = await request.json();
    const title = String(body.title ?? '').trim();
    const venue = String(body.venue ?? '').trim();
    const event_date = String(body.event_date ?? '').trim();
    const event_time = String(body.event_time ?? '').trim();
    const scope_type = String(body.scope_type ?? 'personal').trim() || 'personal';
    const scope_value = body.scope_value != null ? String(body.scope_value).trim() : null;
    const created_by_nickname = String(body.created_by_nickname ?? body.created_by ?? '').trim() || null;

    if (!title || !venue || !event_date || !event_time) {
      return NextResponse.json(
        { ok: false, error: 'title, venue, event_date, and event_time are required.' },
        { status: 400 }
      );
    }

    // Validate date/time format loosely
    if (!/^\d{4}-\d{2}-\d{2}$/.test(event_date)) {
      return NextResponse.json({ ok: false, error: 'event_date must be YYYY-MM-DD.' }, { status: 400 });
    }
    if (!/^\d{2}:\d{2}(:\d{2})?$/.test(event_time)) {
      return NextResponse.json({ ok: false, error: 'event_time must be HH:MM or HH:MM:SS.' }, { status: 400 });
    }

    // Duplicate prevention: check existing title + event_date + venue
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
          error: 'Duplicate event detected: same title, date, and venue already exists.',
          duplicate: existing[0],
          duplicate_warning: true,
        },
        { status: 409 }
      );
    }

    // Resolve created_by via nickname if provided
    let created_by: string | null = null;
    if (created_by_nickname) {
      const [user] = await sql`SELECT id FROM physi_users WHERE lower(nickname) = lower(${created_by_nickname}) LIMIT 1;`;
      if (user) created_by = user.id;
    }

    // Scoped promotion logic
    const status = deriveStatus(scope_type);
    // Authority points logic: canonical requires higher threshold; personal 0
    const authority_points = status === 'canonical' ? 0 : 0;
    const required_points = status === 'canonical' ? 5 : 0;

    const [inserted] = await sql`
      INSERT INTO physi_events (title, venue, event_date, event_time, scope_type, scope_value, status, authority_points, required_points, created_by)
      VALUES (${title}, ${venue}, ${event_date}::date, ${event_time}::time, ${scope_type}, ${scope_value}, ${status}, ${authority_points}, ${required_points}, ${created_by}::uuid)
      RETURNING id, title, venue, event_date, event_time, scope_type, scope_value, status, authority_points, required_points, created_by, created_at;
    `;

    return NextResponse.json({ ok: true, event: inserted, promoted: status === 'canonical' }, { status: 201 });
  } catch (error) {
    console.error('Events POST failed:', error);
    return NextResponse.json({ ok: false, error: 'Could not create event right now.' }, { status: 500 });
  }
}
