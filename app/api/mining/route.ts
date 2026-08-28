import { NextResponse } from 'next/server';
import { sql, dbUnavailableResponse } from '@/lib/db';
import { ensureMiningLogsTable } from '@/lib/ensure';

const BASE_REWARD = 10;
const COOLDOWN_MS = 24 * 60 * 60 * 1000;

// ---------- helpers ----------
function bad(msg: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, error: msg, ...extra }, { status });
}
function dbDown() {
  return NextResponse.json(dbUnavailableResponse(), { status: 503 });
}

async function resolveUser(nickname?: string, userId?: string) {
  if (!sql) return null;
  if (userId) {
    if (!/^[0-9a-fA-F-]{30,36}$/.test(userId)) return null;
    const [u] = await sql`SELECT id, nickname, authority_final, mining_balance FROM physi_users WHERE id = ${userId} LIMIT 1;`;
    if (u) return u;
  }
  if (nickname) {
    const [u] = await sql`SELECT id, nickname, authority_final, mining_balance FROM physi_users WHERE lower(nickname) = lower(${nickname}) LIMIT 1;`;
    if (u) return u;
  }
  return null;
}

function isUUID(v: string): boolean {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(v);
}

// ---------- POST /api/mining (Check-In) ----------
export async function POST(request: Request) {
  try {
    if (!sql) return dbDown();
    await ensureMiningLogsTable();

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return bad('Invalid JSON body.', 400, { code: 'INVALID_JSON' });

    const nickname = String((body as Record<string, unknown>).nickname ?? '').trim() || undefined;
    const userId = String((body as Record<string, unknown>).user_id ?? (body as Record<string, unknown>).userId ?? '').trim() || undefined;

    if (!nickname && !userId) return bad('nickname or user_id is required.', 400, { code: 'MISSING_PARAM' });
    if (userId && !isUUID(userId)) return bad('user_id must be a valid UUID.', 400, { code: 'INVALID_ID' });
    if (nickname && (nickname.length < 2 || nickname.length > 30)) return bad('nickname must be 2–30 chars.', 400, { code: 'INVALID_FIELD' });

    const user = await resolveUser(nickname, userId);
    if (!user) return bad('User not found. Create a profile first.', 404, { code: 'NOT_FOUND' });

    const userIdResolved: string = String(user.id);
    const authorityFinal = Number(user.authority_final ?? 1);
    if (Number.isNaN(authorityFinal) || authorityFinal < 0.5 || authorityFinal > 2.0) {
      return bad('User authority_final is invalid — contact support.', 500, { code: 'INVALID_AUTHORITY' });
    }

    const earned = Number((BASE_REWARD * authorityFinal).toFixed(2));
    const nextMineAt = new Date(Date.now() + COOLDOWN_MS).toISOString();

    const doTx = async (tx: any) => {
      const [lockedUser] = await (tx as any)`SELECT id, mining_balance FROM physi_users WHERE id = ${userIdResolved} FOR UPDATE;`;
      if (!lockedUser) throw new Error('User not found inside tx');

      const [lastLog] = await (tx as any)`
        SELECT created_at FROM physi_mining_logs
        WHERE user_id = ${userIdResolved}
        ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
      `;
      if (lastLog) {
        const lastTime = new Date(lastLog.created_at).getTime();
        if (!Number.isNaN(lastTime)) {
          const elapsed = Date.now() - lastTime;
          if (elapsed < COOLDOWN_MS) {
            const remainingMs = lastTime + COOLDOWN_MS - Date.now();
            const nextAt = new Date(lastTime + COOLDOWN_MS).toISOString();
            const err: Error & { code?: string; nextMineAt?: string; remainingMs?: number } = new Error('Cooldown active');
            err.code = 'COOLDOWN';
            err.nextMineAt = nextAt;
            err.remainingMs = remainingMs;
            throw err;
          }
        }
      }

      const currentBal = Number(lockedUser.mining_balance ?? 0);
      const newBalance = Number((currentBal + earned).toFixed(2));

      const [log] = await (tx as any)`
        INSERT INTO physi_mining_logs (user_id, base_reward, authority_multiplier, earned_amount)
        VALUES (${userIdResolved}, ${BASE_REWARD}, ${authorityFinal}, ${earned})
        RETURNING id, user_id, base_reward, authority_multiplier, earned_amount, created_at;
      `;

      await (tx as any)`
        UPDATE physi_users SET mining_balance = ${newBalance}, updated_at = NOW()
        WHERE id = ${userIdResolved};
      `;

      return { log, newBalance };
    };

    let txResult: { log: unknown; newBalance: number };
    try {
      const maybeBegin = (sql as unknown as { begin?: (fn: (tx: typeof sql) => Promise<unknown>) => Promise<unknown> }).begin;
      if (typeof maybeBegin === 'function') {
        txResult = (await maybeBegin(async (tx: typeof sql) => doTx(tx as typeof sql))) as typeof txResult;
      } else {
        const [lockedUser2] = await sql`SELECT mining_balance FROM physi_users WHERE id = ${userIdResolved} LIMIT 1;`;
        const currentBal2 = Number(lockedUser2?.mining_balance ?? 0);
        const newBalance2 = Number((currentBal2 + earned).toFixed(2));
        const [lastLogFallback] = await sql`
          SELECT created_at FROM physi_mining_logs WHERE user_id = ${userIdResolved} ORDER BY created_at DESC LIMIT 1;
        `;
        if (lastLogFallback) {
          const lastTime = new Date(lastLogFallback.created_at).getTime();
          if (Date.now() - lastTime < COOLDOWN_MS) {
            const remainingMs = lastTime + COOLDOWN_MS - Date.now();
            return NextResponse.json({ ok: false, error: 'Cooldown active. Try again after 24h.', code: 'COOLDOWN', nextMineAt: new Date(lastTime + COOLDOWN_MS).toISOString(), remainingMs, remainingSeconds: Math.ceil(remainingMs/1000) }, { status: 429 });
          }
        }
        const [log] = await sql`
          INSERT INTO physi_mining_logs (user_id, base_reward, authority_multiplier, earned_amount)
          VALUES (${userIdResolved}, ${BASE_REWARD}, ${authorityFinal}, ${earned})
          RETURNING id, user_id, base_reward, authority_multiplier, earned_amount, created_at;
        `;
        await sql`UPDATE physi_users SET mining_balance = ${newBalance2}, updated_at = NOW() WHERE id = ${userIdResolved};`;
        txResult = { log, newBalance: newBalance2 };
      }
    } catch (txErr: unknown) {
      const e = txErr as Error & { code?: string; nextMineAt?: string; remainingMs?: number };
      if (e.code === 'COOLDOWN') {
        return NextResponse.json({ ok: false, error: 'Cooldown active. Try again after 24h.', code: 'COOLDOWN', nextMineAt: e.nextMineAt, remainingMs: e.remainingMs, remainingSeconds: Math.ceil((e.remainingMs ?? 0)/1000) }, { status: 429 });
      }
      const msg = e.message ?? String(e);
      if (msg.includes('duplicate') || msg.includes('unique')) {
        return NextResponse.json({ ok: false, error: 'Already checked in (race). Try again after cooldown.', code: 'COOLDOWN' }, { status: 429 });
      }
      throw e;
    }

    return NextResponse.json(
      {
        ok: true,
        earned,
        balance: txResult.newBalance,
        authority_multiplier: authorityFinal,
        base_reward: BASE_REWARD,
        nextMineAt,
        log: txResult.log,
        type: 'checkin',
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[checkin][POST] failed:', error);
    return NextResponse.json({ ok: false, error: 'Could not check in right now.', code: 'MINING_ERROR' }, { status: 500 });
  }
}

// ---------- GET /api/mining?nickname=xxx or ?user_id=xxx ----------
export async function GET(request: Request) {
  try {
    if (!sql) return dbDown();
    await ensureMiningLogsTable();

    const { searchParams } = new URL(request.url);
    const nickname = String(searchParams.get('nickname') ?? '').trim() || undefined;
    const userId = String(searchParams.get('user_id') ?? searchParams.get('userId') ?? '').trim() || undefined;

    if (!nickname && !userId) return bad('nickname or user_id query param is required.', 400, { code: 'MISSING_PARAM' });
    if (userId && !isUUID(userId)) return bad('user_id must be a valid UUID.', 400, { code: 'INVALID_ID' });

    const user = await resolveUser(nickname, userId);
    if (!user) return bad('User not found.', 404, { code: 'NOT_FOUND' });

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
      type: 'checkin',
    });
  } catch (error) {
    console.error('[checkin][GET] failed:', error);
    return NextResponse.json({ ok: false, error: 'Could not fetch check-in data.', code: 'MINING_FETCH_ERROR' }, { status: 500 });
  }
}
