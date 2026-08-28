import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

const BASE_REWARD = 10;
const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24h

// ---------- helpers ----------
function bad(msg: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, error: msg, ...extra }, { status });
}
function dbDown() {
  return NextResponse.json({ ok: false, error: 'DATABASE_URL is not configured yet.', code: 'DB_NOT_CONFIGURED' }, { status: 503 });
}
async function ensureMiningTable() {
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
    CREATE TABLE IF NOT EXISTS physi_mining_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES physi_users(id) ON DELETE CASCADE,
      base_reward NUMERIC(14,2) NOT NULL,
      authority_multiplier NUMERIC(3,2) NOT NULL,
      earned_amount NUMERIC(14,2) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS physi_mining_logs_user_created_idx ON physi_mining_logs (user_id, created_at DESC);`;
}

async function resolveUser(nickname?: string, userId?: string) {
  if (!sql) return null;
  if (userId) {
    if (!/^[0-9a-fA-F-]{30,36}$/.test(userId)) return null; // basic UUID shape check — caller returns 400 on invalid elsewhere
    const [u] = await sql`SELECT id, nickname, authority_final, mining_balance FROM physi_users WHERE id = ${userId} LIMIT 1;`;
    if (u) return u;
  }
  if (nickname) {
    const [u] = await sql`SELECT id, nickname, authority_final, mining_balance FROM physi_users WHERE lower(nickname) = lower(${nickname}) LIMIT 1;`;
    if (u) return u;
  }
  return null;
}

// Validate UUID string
function isUUID(v: string): boolean {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(v);
}

// ---------- POST /api/mining ----------
export async function POST(request: Request) {
  try {
    if (!sql) return dbDown();
    await ensureMiningTable();

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return bad('Invalid JSON body.', 400);

    const nickname = String((body as Record<string, unknown>).nickname ?? '').trim() || undefined;
    const userId = String((body as Record<string, unknown>).user_id ?? (body as Record<string, unknown>).userId ?? '').trim() || undefined;

    if (!nickname && !userId) return bad('nickname or user_id is required.', 400);
    if (userId && !isUUID(userId)) return bad('user_id must be a valid UUID.', 400);
    if (nickname && (nickname.length < 2 || nickname.length > 30)) return bad('nickname must be 2–30 chars.', 400);

    const user = await resolveUser(nickname, userId);
    if (!user) return bad('User not found. Create a profile first.', 404);

    const userIdResolved: string = String(user.id);
    const authorityFinal = Number(user.authority_final ?? 1);
    if (Number.isNaN(authorityFinal) || authorityFinal < 0.5 || authorityFinal > 2.0) {
      return bad('User authority_final is invalid — contact support.', 500);
    }
    const currentBalance = Number(user.mining_balance ?? 0);

    // Cooldown check — last physi_mining_logs
    const [lastLog] = await sql`
      SELECT created_at FROM physi_mining_logs
      WHERE user_id = ${userIdResolved}
      ORDER BY created_at DESC LIMIT 1;
    `;

    if (lastLog) {
      const lastTime = new Date(lastLog.created_at).getTime();
      if (!Number.isNaN(lastTime)) {
        const elapsed = Date.now() - lastTime;
        if (elapsed < COOLDOWN_MS) {
          const nextMineAt = new Date(lastTime + COOLDOWN_MS).toISOString();
          const remainingMs = lastTime + COOLDOWN_MS - Date.now();
          return NextResponse.json(
            {
              ok: false,
              error: 'Cooldown active. Try again after 24h.',
              code: 'COOLDOWN',
              nextMineAt,
              remainingMs,
              remainingSeconds: Math.ceil(remainingMs / 1000),
            },
            { status: 429 }
          );
        }
      }
    }

    // Authority-weighted reward: 10 × authority_final (to 2dp)
    const earned = Number((BASE_REWARD * authorityFinal).toFixed(2));
    const newBalance = Number((currentBalance + earned).toFixed(2));
    const nextMineAt = new Date(Date.now() + COOLDOWN_MS).toISOString();

    // Insert log then update balance — transactional order matters
    const [log] = await sql`
      INSERT INTO physi_mining_logs (user_id, base_reward, authority_multiplier, earned_amount)
      VALUES (${userIdResolved}, ${BASE_REWARD}, ${authorityFinal}, ${earned})
      RETURNING id, user_id, base_reward, authority_multiplier, earned_amount, created_at;
    `;

    await sql`
      UPDATE physi_users SET mining_balance = ${newBalance}, updated_at = NOW()
      WHERE id = ${userIdResolved};
    `;

    return NextResponse.json(
      {
        ok: true,
        earned,
        balance: newBalance,
        authority_multiplier: authorityFinal,
        base_reward: BASE_REWARD,
        nextMineAt,
        log,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[mining][POST] failed:', error);
    return NextResponse.json({ ok: false, error: 'Could not mine right now.' }, { status: 500 });
  }
}

// ---------- GET /api/mining?nickname=xxx or ?user_id=xxx ----------
export async function GET(request: Request) {
  try {
    if (!sql) return dbDown();
    await ensureMiningTable();

    const { searchParams } = new URL(request.url);
    const nickname = String(searchParams.get('nickname') ?? '').trim() || undefined;
    const userId = String(searchParams.get('user_id') ?? searchParams.get('userId') ?? '').trim() || undefined;

    if (!nickname && !userId) return bad('nickname or user_id query param is required.', 400);
    if (userId && !isUUID(userId)) return bad('user_id must be a valid UUID.', 400);

    const user = await resolveUser(nickname, userId);
    if (!user) return bad('User not found.', 404);

    const [fresh] = await sql`SELECT mining_balance, authority_final FROM physi_users WHERE id = ${user.id} LIMIT 1;`;

    const history = await sql`
      SELECT id, user_id, base_reward, authority_multiplier, earned_amount, created_at
      FROM physi_mining_logs
      WHERE user_id = ${user.id}
      ORDER BY created_at DESC LIMIT 50;
    `;

    let nextMineAt: string | null = null;
    let canMine = true;
    let remainingMs = 0;
    if (history.length > 0) {
      const lastTime = new Date(history[0].created_at).getTime();
      if (!Number.isNaN(lastTime)) {
        const elapsed = Date.now() - lastTime;
        if (elapsed < COOLDOWN_MS) {
          canMine = false;
          remainingMs = lastTime + COOLDOWN_MS - Date.now();
          nextMineAt = new Date(lastTime + COOLDOWN_MS).toISOString();
        }
      }
    }

    return NextResponse.json({
      ok: true,
      user: { id: user.id, nickname: user.nickname },
      balance: Number(fresh?.mining_balance ?? 0),
      authority_final: Number(fresh?.authority_final ?? 1),
      canMine,
      nextMineAt,
      remainingMs,
      remainingSeconds: Math.ceil(remainingMs / 1000),
      history,
    });
  } catch (error) {
    console.error('[mining][GET] failed:', error);
    return NextResponse.json({ ok: false, error: 'Could not fetch mining data.' }, { status: 500 });
  }
}
