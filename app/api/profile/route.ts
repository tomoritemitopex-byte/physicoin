import { NextResponse } from 'next/server';
import { sql, dbUnavailableResponse } from '@/lib/db';
import { ensureUsersTable } from '@/lib/ensure';

// ---------- helpers ----------

const VALID_LEVELS = ['100L', '200L', '300L', '400L', '500L', '600L'] as const;
const LEVEL_BASE: Record<string, number> = {
  '100L': 1.0,
  '200L': 1.05,
  '300L': 1.1,
  '400L': 1.15,
  '500L': 1.2,
  '600L': 1.25,
};

function isFuhsiAuthorityUnlocked(): boolean {
  const k = process.env.FUHSI_AUTHORITY_KEY ?? process.env.FUHSI_SIGNING_KEY ?? '';
  return typeof k === 'string' && k.trim().length >= 16;
}

function calcAuthority(level: string, statuses: string[]): { base: number; final: number } {
  const lb = LEVEL_BASE[level] ?? 1.0;
  let bonus = 0;
  const joined = statuses.map((s) => s.toLowerCase());
  for (const s of joined) {
    if (s.includes('president') && !s.includes('vice')) bonus += 0.05;
    else if (s.includes('vice president') || s === 'vp' || s.includes('vice-president')) bonus += 0.04;
    else if (s.includes('governor')) bonus += 0.04;
    else if (s.includes('course rep') || s.includes('course representative') || s.includes('class rep')) bonus += 0.04;
    else if (s.includes('secretary')) bonus += 0.02;
    else if (s.includes('treasurer') || s.includes('financial')) bonus += 0.02;
    else if (s.includes('p.r.o') || s.includes('pro ') || s.includes('public relation')) bonus += 0.02;
    else if (s.includes('lecturer') || s.includes('staff') || s.includes('admin') || s.includes('hod')) bonus += 0.05;
  }
  bonus = Math.min(bonus, 0.15);
  const rawBase = Number((lb + bonus).toFixed(2));
  let final = Math.min(2.0, Math.max(0.5, rawBase));
  let base = rawBase;
  if (!isFuhsiAuthorityUnlocked()) {
    final = Math.min(1.1, final);
    base = Math.min(1.1, rawBase);
  }
  return { base: Number(base.toFixed(2)), final: Number(final.toFixed(2)) };
}

function bad(msg: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, error: msg, ...extra }, { status });
}
function dbDown() {
  return NextResponse.json(dbUnavailableResponse(), { status: 503 });
}

// ---------- GET /api/profile?nickname=xxx  or ?id=xxx ----------

export async function GET(request: Request) {
  try {
    if (!sql) return dbDown();
    await ensureUsersTable();

    const { searchParams } = new URL(request.url);
    const nickname = searchParams.get('nickname')?.trim() || null;
    const id = searchParams.get('id')?.trim() || searchParams.get('user_id')?.trim() || null;

    if (!nickname && !id) {
      return bad('Provide ?nickname= or ?id= query param.', 400, { code: 'MISSING_PARAM' });
    }

    if (id) {
      if (!/^[0-9a-fA-F-]{36}$/.test(id) && !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-/.test(id)) {
        return bad('Invalid id format (expected UUID).', 400, { code: 'INVALID_ID' });
      }
      const [u] = await sql`
        SELECT id, full_name, nickname, programme, level, statuses, authority_base, authority_final, mining_balance, created_at, updated_at
        FROM physi_users WHERE id = ${id} LIMIT 1;
      `;
      if (!u) return bad('Profile not found.', 404, { code: 'NOT_FOUND' });
      return NextResponse.json({ ok: true, user: u });
    }

    const [u2] = await sql`
      SELECT id, full_name, nickname, programme, level, statuses, authority_base, authority_final, mining_balance, created_at, updated_at
      FROM physi_users WHERE lower(nickname) = lower(${nickname}) LIMIT 1;
    `;
    if (!u2) return bad('Profile not found.', 404, { code: 'NOT_FOUND' });
    return NextResponse.json({ ok: true, user: u2 });
  } catch (error) {
    console.error('[profile][GET] failed:', error);
    return NextResponse.json({ ok: false, error: 'Could not fetch profile.', code: 'PROFILE_FETCH_ERROR' }, { status: 500 });
  }
}

// ---------- POST /api/profile ----------

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return bad('Invalid JSON body.', 400, { code: 'INVALID_JSON' });
    }

    const fullName = String((body as Record<string, unknown>).full_name ?? '').trim();
    const nickname = String((body as Record<string, unknown>).nickname ?? '').trim();
    const programme = String((body as Record<string, unknown>).programme ?? '').trim();
    const level = String((body as Record<string, unknown>).level ?? '').trim();
    const statusesRaw = (body as Record<string, unknown>).statuses;

    if (!fullName || !nickname || !programme || !level) {
      return bad('full_name, nickname, programme, and level are required.', 400, { code: 'MISSING_FIELDS' });
    }
    if (fullName.length < 2 || fullName.length > 100) {
      return bad('full_name must be 2–100 characters.', 400, { code: 'INVALID_FIELD' });
    }
    if (nickname.length < 2 || nickname.length > 30) {
      return bad('nickname must be 2–30 characters.', 400, { code: 'INVALID_FIELD' });
    }
    if (!/^[a-zA-Z0-9_.\-]+$/.test(nickname)) {
      return bad('nickname may only contain letters, numbers, _, ., -', 400, { code: 'INVALID_FIELD' });
    }
    if (programme.length < 2 || programme.length > 120) {
      return bad('programme must be 2–120 characters.', 400, { code: 'INVALID_FIELD' });
    }
    if (!VALID_LEVELS.includes(level as (typeof VALID_LEVELS)[number])) {
      return bad(`level must be one of ${VALID_LEVELS.join(', ')}.`, 400, { code: 'INVALID_LEVEL' });
    }

    let statuses: string[] = [];
    if (Array.isArray(statusesRaw)) {
      statuses = statusesRaw.map((s) => String(s).trim()).filter(Boolean);
    } else if (typeof statusesRaw === 'string') {
      statuses = statusesRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (statusesRaw != null) {
      return bad('statuses must be an array of strings or comma-separated string.', 400, { code: 'INVALID_FIELD' });
    }
    if (statuses.length > 10) return bad('Too many statuses (max 10).', 400, { code: 'INVALID_FIELD' });
    for (const s of statuses) {
      if (s.length > 50) return bad(`status "${s.slice(0, 20)}..." exceeds 50 chars.`, 400, { code: 'INVALID_FIELD' });
    }

    if (!sql) return dbDown();
    await ensureUsersTable();

    const dup = await sql`SELECT id, nickname FROM physi_users WHERE lower(nickname) = lower(${nickname}) LIMIT 1;`;
    if (dup.length > 0) {
      return NextResponse.json(
        { ok: false, error: `Nickname "${nickname}" is already taken.`, code: 'DUPLICATE_NICKNAME', duplicate: dup[0] },
        { status: 409 }
      );
    }

    const { base, final } = calcAuthority(level, statuses);

    const [user] = await sql`
      INSERT INTO physi_users (full_name, nickname, programme, level, statuses, authority_base, authority_final)
      VALUES (${fullName}, ${nickname}, ${programme}, ${level}, ${JSON.stringify(statuses)}::jsonb, ${base}, ${final})
      RETURNING id, full_name, nickname, programme, level, statuses, authority_base, authority_final, mining_balance, created_at, updated_at;
    `;

    return NextResponse.json({ ok: true, user, authority: { base, final } }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('duplicate') || msg.includes('unique') || msg.includes('physi_users_nickname')) {
      return NextResponse.json({ ok: false, error: 'Nickname already taken (race). Try another.', code: 'DUPLICATE_NICKNAME' }, { status: 409 });
    }
    console.error('[profile][POST] failed:', error);
    return NextResponse.json({ ok: false, error: 'Could not create profile right now.', code: 'PROFILE_CREATE_ERROR' }, { status: 500 });
  }
}
