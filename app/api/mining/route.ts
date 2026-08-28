import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

const BASE_REWARD = 10;
const COOLDOWN_MS = 24 * 60 * 60 * 1000;

async function ensureMiningTable() {
  if (!sql) return;
  await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto;`;
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
}

async function resolveUser(nickname?: string, userId?: string) {
  if (!sql) return null;
  if (userId) {
    const [u] = await sql`SELECT id, nickname, authority_final, mining_balance FROM physi_users WHERE id = ${userId} LIMIT 1;`;
    if (u) return u;
  }
  if (nickname) {
    const [u] = await sql`SELECT id, nickname, authority_final, mining_balance FROM physi_users WHERE nickname = ${nickname} LIMIT 1;`;
    if (u) return u;
  }
  return null;
}

// POST /api/mining { nickname?, user_id? }
export async function POST(request: Request) {
  try {
    if (!sql) {
      return NextResponse.json({ ok: false, error: 'DATABASE_URL is not configured yet.' }, { status: 503 });
    }
    await ensureMiningTable();

    const body = await request.json().catch(() => ({}));
    const nickname = String(body.nickname ?? '').trim() || undefined;
    const userId = String(body.user_id ?? body.userId ?? '').trim() || undefined;

    if (!nickname && !userId) {
      return NextResponse.json({ ok: false, error: 'nickname or user_id is required.' }, { status: 400 });
    }

    const user = await resolveUser(nickname, userId);
    if (!user) {
      return NextResponse.json({ ok: false, error: 'User not found.' }, { status: 404 });
    }

    const userIdResolved: string = user.id;
    const authorityFinal = Number(user.authority_final ?? 1);
    const currentBalance = Number(user.mining_balance ?? 0);

    // Check 24h cooldown - last physi_mining_logs
    const [lastLog] = await sql`
      SELECT created_at FROM physi_mining_logs
      WHERE user_id = ${userIdResolved}
      ORDER BY created_at DESC LIMIT 1;
    `;

    if (lastLog) {
      const lastTime = new Date(lastLog.created_at).getTime();
      const elapsed = Date.now() - lastTime;
      if (elapsed < COOLDOWN_MS) {
        const nextMineAt = new Date(lastTime + COOLDOWN_MS).toISOString();
        const remainingMs = lastTime + COOLDOWN_MS - Date.now();
        return NextResponse.json(
          {
            ok: false,
            error: 'Cooldown active. Try again after 24h.',
            nextMineAt,
            remainingMs,
            remainingSeconds: Math.ceil(remainingMs / 1000),
          },
          { status: 429 },
        );
      }
    }

    // Calc reward: 10 * authority_final
    const earned = Number((BASE_REWARD * authorityFinal).toFixed(2));
    const newBalance = Number((currentBalance + earned).toFixed(2));
    const nextMineAt = new Date(Date.now() + COOLDOWN_MS).toISOString();

    // Insert log
    const [log] = await sql`
      INSERT INTO physi_mining_logs (user_id, base_reward, authority_multiplier, earned_amount)
      VALUES (${userIdResolved}, ${BASE_REWARD}, ${authorityFinal}, ${earned})
      RETURNING id, user_id, base_reward, authority_multiplier, earned_amount, created_at;
    `;

    // Update mining_balance
    await sql`
      UPDATE physi_users SET mining_balance = ${newBalance}, updated_at = NOW()
      WHERE id = ${userIdResolved};
    `;

    return NextResponse.json({
      ok: true,
      earned,
      balance: newBalance,
      authority_multiplier: authorityFinal,
      base_reward: BASE_REWARD,
      nextMineAt,
      log,
    });
  } catch (error) {
    console.error('Mining POST failed:', error);
    return NextResponse.json({ ok: false, error: 'Could not mine right now.' }, { status: 500 });
  }
}

// GET /api/mining?nickname=xxx
export async function GET(request: Request) {
  try {
    if (!sql) {
      return NextResponse.json({ ok: false, error: 'DATABASE_URL is not configured yet.' }, { status: 503 });
    }
    await ensureMiningTable();

    const { searchParams } = new URL(request.url);
    const nickname = String(searchParams.get('nickname') ?? '').trim();
    const userId = String(searchParams.get('user_id') ?? searchParams.get('userId') ?? '').trim();

    if (!nickname && !userId) {
      return NextResponse.json({ ok: false, error: 'nickname or user_id query param is required.' }, { status: 400 });
    }

    const user = await resolveUser(nickname || undefined, userId || undefined);
    if (!user) {
      return NextResponse.json({ ok: false, error: 'User not found.' }, { status: 404 });
    }

    const [fresh] = await sql`SELECT mining_balance, authority_final FROM physi_users WHERE id = ${user.id} LIMIT 1;`;

    const history = await sql`
      SELECT id, user_id, base_reward, authority_multiplier, earned_amount, created_at
      FROM physi_mining_logs
      WHERE user_id = ${user.id}
      ORDER BY created_at DESC LIMIT 50;
    `;

    // Determine nextMineAt from last log
    let nextMineAt: string | null = null;
    let canMine = true;
    let remainingMs = 0;
    if (history.length > 0) {
      const lastTime = new Date(history[0].created_at).getTime();
      const elapsed = Date.now() - lastTime;
      if (elapsed < COOLDOWN_MS) {
        canMine = false;
        remainingMs = lastTime + COOLDOWN_MS - Date.now();
        nextMineAt = new Date(lastTime + COOLDOWN_MS).toISOString();
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
    console.error('Mining GET failed:', error);
    return NextResponse.json({ ok: false, error: 'Could not fetch mining data.' }, { status: 500 });
  }
}
