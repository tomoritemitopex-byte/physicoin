import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

// ---------- helpers ----------
function bad(msg: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, error: msg, ...extra }, { status });
}
function dbDown() {
  return NextResponse.json({ ok: false, error: 'DATABASE_URL is not configured yet.', code: 'DB_NOT_CONFIGURED' }, { status: 503 });
}
function isUUID(v: string): boolean {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(v);
}

async function ensureTables() {
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
  await sql`
    CREATE TABLE IF NOT EXISTS physi_verifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      verifier_id UUID NOT NULL REFERENCES physi_users(id) ON DELETE CASCADE,
      event_id UUID NOT NULL REFERENCES physi_events(id) ON DELETE CASCADE,
      vote TEXT NOT NULL CHECK (vote IN ('YES', 'NO', 'CANCEL')),
      authority_weight NUMERIC(3,2) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
  // Duplicate guard: one verifier can vote once per event (production truth)
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS physi_verifications_verifier_event_uidx ON physi_verifications (verifier_id, event_id);`;
  await sql`CREATE INDEX IF NOT EXISTS physi_verifications_event_idx ON physi_verifications (event_id);`;
  await sql`CREATE INDEX IF NOT EXISTS physi_verifications_verifier_idx ON physi_verifications (verifier_id);`;
}

async function resolveUser(nickname?: string, verifierId?: string) {
  if (!sql) return null;
  if (verifierId) {
    const [u] = await sql`SELECT id, nickname, authority_final FROM physi_users WHERE id = ${verifierId} LIMIT 1;`;
    if (u) return u;
  }
  if (nickname) {
    const [u] = await sql`SELECT id, nickname, authority_final FROM physi_users WHERE lower(nickname) = lower(${nickname}) LIMIT 1;`;
    if (u) return u;
  }
  return null;
}

// ---------- GET /api/verify?event_id=xxx  (authority-weighted tally) ----------
export async function GET(request: Request) {
  try {
    if (!sql) return dbDown();
    await ensureTables();
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get('event_id')?.trim() || searchParams.get('eventId')?.trim() || '';

    if (!eventId) return bad('event_id query param is required.', 400);
    if (!isUUID(eventId)) return bad('event_id must be a valid UUID.', 400);

    const [ev] = await sql`SELECT id, title, venue, event_date, status FROM physi_events WHERE id = ${eventId} LIMIT 1;`;
    if (!ev) return bad('Event not found in physi_events.', 404);

    const rows = await sql`
      SELECT v.id, v.vote, v.authority_weight, v.created_at, u.nickname as verifier_nickname
      FROM physi_verifications v
      JOIN physi_users u ON u.id = v.verifier_id
      WHERE v.event_id = ${eventId}
      ORDER BY v.created_at DESC;
    `;

    // Authority-weighted totals
    let yesW = 0,
      noW = 0,
      cancelW = 0;
    for (const r of rows) {
      const w = Number(r.authority_weight ?? 1);
      if (r.vote === 'YES') yesW += w;
      else if (r.vote === 'NO') noW += w;
      else if (r.vote === 'CANCEL') cancelW += w;
    }
    const totalW = Number((yesW + noW + cancelW).toFixed(2));
    const yesRatio = totalW ? Number((yesW / totalW).toFixed(3)) : 0;

    return NextResponse.json({
      ok: true,
      event: ev,
      counts: { total: rows.length, yes: rows.filter((r) => r.vote === 'YES').length, no: rows.filter((r) => r.vote === 'NO').length, cancel: rows.filter((r) => r.vote === 'CANCEL').length },
      weighted: { yes: Number(yesW.toFixed(2)), no: Number(noW.toFixed(2)), cancel: Number(cancelW.toFixed(2)), total: totalW, yes_ratio: yesRatio },
      verifications: rows,
    });
  } catch (error) {
    console.error('[verify][GET] failed:', error);
    return NextResponse.json({ ok: false, error: 'Could not fetch verifications.' }, { status: 500 });
  }
}

// ---------- POST /api/verify { nickname|verifier_id, event_id, vote: YES|NO|CANCEL } ----------
export async function POST(request: Request) {
  try {
    if (!sql) return dbDown();
    await ensureTables();

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return bad('Invalid JSON body.', 400);
    const b = body as Record<string, unknown>;

    const nickname = String(b.nickname ?? '').trim() || undefined;
    const verifierIdRaw = String(b.verifier_id ?? b.verifierId ?? b.user_id ?? b.userId ?? '').trim() || undefined;
    const eventId = String(b.event_id ?? b.eventId ?? '').trim();
    const voteRaw = String(b.vote ?? '').trim().toUpperCase();

    if (!eventId || !voteRaw) return bad('event_id and vote are required.', 400);
    if (!['YES', 'NO', 'CANCEL'].includes(voteRaw)) return bad('vote must be YES, NO, or CANCEL.', 400);
    if (eventId && !isUUID(eventId)) return bad('event_id must be a valid UUID.', 400);
    if (verifierIdRaw && !isUUID(verifierIdRaw)) return bad('verifier_id must be a valid UUID.', 400);
    if (!nickname && !verifierIdRaw) return bad('nickname or verifier_id is required.', 400);
    const vote = voteRaw as 'YES' | 'NO' | 'CANCEL';

    // Resolve verifier — strict 404 (no mock)
    const user = await resolveUser(nickname, verifierIdRaw);
    if (!user) {
      return bad('Verifier not found in physi_users. Create a profile first.', 404, { code: 'VERIFIER_NOT_FOUND' });
    }
    const verifierId = String(user.id);
    const authorityWeight = Number(user.authority_final ?? 1);
    if (Number.isNaN(authorityWeight)) return bad('Verifier authority_final is invalid.', 500);

    // Verify event exists — strict 404
    const [ev] = await sql`SELECT id, status FROM physi_events WHERE id = ${eventId} LIMIT 1;`;
    if (!ev) return bad('Event not found in physi_events.', 404, { code: 'EVENT_NOT_FOUND' });

    // Duplicate guard: same verifier voting twice on same event => 409
    const [dup] = await sql`SELECT id, vote FROM physi_verifications WHERE verifier_id = ${verifierId} AND event_id = ${eventId} LIMIT 1;`;
    if (dup) {
      return NextResponse.json(
        { ok: false, error: 'Already voted on this event.', code: 'DUPLICATE_VOTE', existing: dup },
        { status: 409 }
      );
    }

    // Insert with authority_weight snapshot
    let row;
    try {
      const inserted = await sql`
        INSERT INTO physi_verifications (verifier_id, event_id, vote, authority_weight)
        VALUES (${verifierId}, ${eventId}, ${vote}, ${authorityWeight})
        RETURNING id, verifier_id, event_id, vote, authority_weight, created_at;
      `;
      row = inserted[0];
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('duplicate') || msg.includes('physi_verifications_verifier_event_uidx') || msg.includes('unique')) {
        return NextResponse.json({ ok: false, error: 'Already voted on this event (race).', code: 'DUPLICATE_VOTE' }, { status: 409 });
      }
      if (msg.includes('foreign key') || msg.includes('violates foreign key')) {
        return bad('Foreign key violation — verifier or event does not exist.', 400);
      }
      throw e;
    }

    // Authority calculation: YES +0.02, NO -0.01, CANCEL 0, clamp 0.50..2.00
    let delta = 0;
    if (vote === 'YES') delta = 0.02;
    else if (vote === 'NO') delta = -0.01;

    let nextAuthority = authorityWeight;
    if (delta !== 0) {
      nextAuthority = Math.round((authorityWeight + delta) * 100) / 100;
      nextAuthority = Math.min(2.0, Math.max(0.5, nextAuthority));
      await sql`UPDATE physi_users SET authority_final = ${nextAuthority}, updated_at = NOW() WHERE id = ${verifierId};`;
    }

    // Also bump event authority_points (optional weighted signal accumulation)
    // YES adds authority_weight to event; NO subtracts half; CANCEL 0
    let eventDelta = 0;
    if (vote === 'YES') eventDelta = authorityWeight;
    else if (vote === 'NO') eventDelta = -authorityWeight * 0.5;
    if (eventDelta !== 0) {
      await sql`UPDATE physi_events SET authority_points = authority_points + ${eventDelta}, updated_at = NOW() WHERE id = ${eventId};`;
    }

    return NextResponse.json(
      {
        ok: true,
        verification: row,
        authority_weight: authorityWeight,
        authority_final_before: authorityWeight,
        authority_final_after: nextAuthority,
        delta,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[verify][POST] failed:', error);
    return NextResponse.json({ ok: false, error: 'Could not record verification right now.' }, { status: 500 });
  }
}
