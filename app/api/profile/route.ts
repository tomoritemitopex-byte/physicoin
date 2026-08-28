import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

async function ensureUsersTable() {
  if (!sql) return;

  await sql`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS users (
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
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const fullName = String(body.full_name ?? '').trim();
    const nickname = String(body.nickname ?? '').trim();
    const programme = String(body.programme ?? '').trim();
    const level = String(body.level ?? '').trim();
    const statuses = Array.isArray(body.statuses) ? body.statuses : [];

    if (!fullName || !nickname || !programme || !level) {
      return NextResponse.json(
        { ok: false, error: 'full_name, nickname, programme, and level are required.' },
        { status: 400 },
      );
    }

    if (!sql) {
      return NextResponse.json(
        { ok: false, error: 'DATABASE_URL is not configured yet.' },
        { status: 503 },
      );
    }

    await ensureUsersTable();

    const [user] = await sql`
      INSERT INTO users (full_name, nickname, programme, level, statuses)
      VALUES (${fullName}, ${nickname}, ${programme}, ${level}, ${JSON.stringify(statuses)}::jsonb)
      RETURNING id, full_name, nickname, programme, level, statuses, authority_base, authority_final, mining_balance, created_at;
    `;

    return NextResponse.json({ ok: true, user }, { status: 201 });
  } catch (error) {
    console.error('Create profile failed:', error);
    return NextResponse.json(
      { ok: false, error: 'Could not create profile right now.' },
      { status: 500 },
    );
  }
}
