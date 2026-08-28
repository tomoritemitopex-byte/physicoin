import { NextResponse } from 'next/server';
import { sql, dbUnavailableResponse } from '@/lib/db';
import { ensureAllTables } from '@/lib/ensure';

// ---------- helpers ----------
function bad(msg: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, error: msg, ...extra }, { status });
}
function dbDown() {
  return NextResponse.json(dbUnavailableResponse(), { status: 503 });
}
function isUUID(v: string): boolean {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(v);
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
    await ensureAllTables();
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get('event_id')?.trim() || searchParams.get('eventId')?.trim() || '';

    if (!eventId) return bad('event_id query param is required.', 400, { code: 'MISSING_PARAM' });
    if (!isUUID(eventId)) return bad('event_id must be a valid UUID.', 400, { code: 'INVALID_ID' });

    const [ev] = await sql`SELECT id, title, venue, event_date, status FROM physi_events WHERE id = ${eventId} LIMIT 1;`;
    if (!ev) return bad('Event not found in physi_events.', 404, { code: 'EVENT_NOT_FOUND' });

    const rows = await sql`
      SELECT v.id, v.vote, v.authority_weight, v.created_at, u.nickname as verifier_nickname
      FROM physi_verifications v
      JOIN physi_users u ON u.id = v.verifier_id
      WHERE v.event_id = ${eventId}
      ORDER BY v.created_at DESC;
    `;

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
    return NextResponse.json({ ok: false, error: 'Could not fetch verifications.', code: 'VERIFY_FETCH_ERROR' }, { status: 500 });
  }
}

// ---------- POST /api/verify { nickname|verifier_id, event_id, vote: YES|NO|CANCEL } ----------
export async function POST(request: Request) {
  try {
    if (!sql) return dbDown();
    await ensureAllTables();

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return bad('Invalid JSON body.', 400, { code: 'INVALID_JSON' });
    const b = body as Record<string, unknown>;

    const nickname = String(b.nickname ?? '').trim() || undefined;
    const verifierIdRaw = String(b.verifier_id ?? b.verifierId ?? b.user_id ?? b.userId ?? '').trim() || undefined;
    const eventId = String(b.event_id ?? b.eventId ?? '').trim();
    const voteRaw = String(b.vote ?? '').trim().toUpperCase();

    if (!eventId || !voteRaw) return bad('event_id and vote are required.', 400, { code: 'MISSING_FIELDS' });
    if (!['YES', 'NO', 'CANCEL'].includes(voteRaw)) return bad('vote must be YES, NO, or CANCEL.', 400, { code: 'INVALID_VOTE' });
    if (eventId && !isUUID(eventId)) return bad('event_id must be a valid UUID.', 400, { code: 'INVALID_ID' });
    if (verifierIdRaw && !isUUID(verifierIdRaw)) return bad('verifier_id must be a valid UUID.', 400, { code: 'INVALID_ID' });
    if (!nickname && !verifierIdRaw) return bad('nickname or verifier_id is required.', 400, { code: 'MISSING_PARAM' });
    const vote = voteRaw as 'YES' | 'NO' | 'CANCEL';

    const user = await resolveUser(nickname, verifierIdRaw);
    if (!user) {
      return bad('Verifier not found in physi_users. Create a profile first.', 404, { code: 'VERIFIER_NOT_FOUND' });
    }
    const verifierId = String(user.id);
    const authorityWeight = Number(user.authority_final ?? 1);
    if (Number.isNaN(authorityWeight)) return bad('Verifier authority_final is invalid.', 500, { code: 'INVALID_AUTHORITY' });

    const [ev] = await sql`SELECT id, status FROM physi_events WHERE id = ${eventId} LIMIT 1;`;
    if (!ev) return bad('Event not found in physi_events.', 404, { code: 'EVENT_NOT_FOUND' });

    const [dup] = await sql`SELECT id, vote FROM physi_verifications WHERE verifier_id = ${verifierId} AND event_id = ${eventId} LIMIT 1;`;
    if (dup) {
      return NextResponse.json(
        { ok: false, error: 'Already voted on this event.', code: 'DUPLICATE_VOTE', existing: dup },
        { status: 409 }
      );
    }

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
        return bad('Foreign key violation — verifier or event does not exist.', 400, { code: 'FK_VIOLATION' });
      }
      throw e;
    }

    let delta = 0;
    if (vote === 'YES') delta = 0.02;
    else if (vote === 'NO') delta = -0.01;

    let nextAuthority = authorityWeight;
    if (delta !== 0) {
      nextAuthority = Math.round((authorityWeight + delta) * 100) / 100;
      nextAuthority = Math.min(2.0, Math.max(0.5, nextAuthority));
      await sql`UPDATE physi_users SET authority_final = ${nextAuthority}, updated_at = NOW() WHERE id = ${verifierId};`;
    }

    let eventDelta = 0;
    if (vote === 'YES') eventDelta = authorityWeight;
    else if (vote === 'NO') eventDelta = -authorityWeight * 0.5;
    if (eventDelta !== 0) {
      await sql`UPDATE physi_events SET authority_points = authority_points + ${eventDelta}, updated_at = NOW() WHERE id = ${eventId};`;
    }

    let promoted = false;
    let canonicalLogId: string | null = null;
    try {
      const weightedRows = await sql`SELECT vote, authority_weight FROM physi_verifications WHERE event_id = ${eventId};`;
      let yesW = 0, totalW = 0;
      for (const r of weightedRows as Array<{ vote: string; authority_weight: string | number }>) {
        const w = Number(r.authority_weight ?? 1);
        totalW += w;
        if (r.vote === 'YES') yesW += w;
      }
      const yesRatio = totalW ? yesW / totalW : 0;
      const shouldPromote = yesW >= 5 && yesRatio >= 0.66;

      if (shouldPromote && ev.status !== 'canonical') {
        const doPromote = async (tx: any) => {
          const [freshEv] = await (tx as any)`SELECT status FROM physi_events WHERE id = ${eventId} FOR UPDATE;`;
          if (!freshEv || freshEv.status === 'canonical') return null;
          await (tx as any)`UPDATE physi_events SET status = 'canonical', updated_at = NOW() WHERE id = ${eventId};`;
          const [log] = await (tx as any)`
            INSERT INTO physi_canonical_log (event_id, yes_weight, total_weight, yes_ratio, promoted_by)
            VALUES (${eventId}, ${Number(yesW.toFixed(2))}, ${Number(totalW.toFixed(2))}, ${Number(yesRatio.toFixed(3))}, ${verifierId})
            RETURNING id;
          `;
          return log?.id ?? null;
        };
        const maybeBegin = (sql as unknown as { begin?: (fn: (tx: typeof sql) => Promise<unknown>) => Promise<unknown> }).begin;
        if (typeof maybeBegin === 'function') {
          const res = await maybeBegin(async (tx: typeof sql) => doPromote(tx as typeof sql));
          if (res) { promoted = true; canonicalLogId = String(res); }
        } else {
          const [freshEv2] = await sql`SELECT status FROM physi_events WHERE id = ${eventId} LIMIT 1;`;
          if (freshEv2 && freshEv2.status !== 'canonical') {
            await sql`UPDATE physi_events SET status = 'canonical', updated_at = NOW() WHERE id = ${eventId};`;
            const [log2] = await sql`
              INSERT INTO physi_canonical_log (event_id, yes_weight, total_weight, yes_ratio, promoted_by)
              VALUES (${eventId}, ${Number(yesW.toFixed(2))}, ${Number(totalW.toFixed(2))}, ${Number(yesRatio.toFixed(3))}, ${verifierId})
              RETURNING id;
            `;
            promoted = true; canonicalLogId = String(log2?.id ?? '');
          }
        }
      }
    } catch (e) {
      console.warn('[verify] quorum promotion failed (non-fatal):', e);
    }

    return NextResponse.json(
      {
        ok: true,
        verification: row,
        authority_weight: authorityWeight,
        authority_final_before: authorityWeight,
        authority_final_after: nextAuthority,
        delta,
        quorum: promoted ? { promoted: true, canonical_log_id: canonicalLogId } : { promoted: false },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[verify][POST] failed:', error);
    return NextResponse.json({ ok: false, error: 'Could not record verification right now.', code: 'VERIFY_ERROR' }, { status: 500 });
  }
}
