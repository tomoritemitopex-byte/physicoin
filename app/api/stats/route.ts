import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/stats
 * Returns real counts/sums from physi_* tables for Microsoft bar / dashboard metrics.
 * Gracefully handles DATABASE_URL missing (503) and empty/missing tables (0s).
 */
export async function GET() {
  if (!sql) {
    return NextResponse.json(
      { ok: false, error: 'DATABASE_URL is not configured yet.', code: 'DB_NOT_CONFIGURED' },
      { status: 503 }
    );
  }

  try {
    // Ensure tables exist so COUNT doesn't throw relation-does-not-exist in fresh DB
    await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto;`;
    await sql`
      CREATE TABLE IF NOT EXISTS physi_users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        full_name TEXT NOT NULL, nickname TEXT NOT NULL, programme TEXT NOT NULL, level TEXT NOT NULL,
        statuses JSONB NOT NULL DEFAULT '[]'::jsonb,
        authority_base NUMERIC(3,2) NOT NULL DEFAULT 1.00,
        authority_final NUMERIC(3,2) NOT NULL DEFAULT 1.00,
        mining_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS physi_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(), title TEXT NOT NULL, venue TEXT NOT NULL,
        event_date DATE NOT NULL, event_time TIME NOT NULL, scope_type TEXT NOT NULL, scope_value TEXT,
        status TEXT NOT NULL DEFAULT 'personal', authority_points NUMERIC(10,2) NOT NULL DEFAULT 0,
        required_points NUMERIC(10,2) NOT NULL DEFAULT 0,
        created_by UUID REFERENCES physi_users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS physi_verifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        verifier_id UUID NOT NULL REFERENCES physi_users(id) ON DELETE CASCADE,
        event_id UUID NOT NULL REFERENCES physi_events(id) ON DELETE CASCADE,
        vote TEXT NOT NULL CHECK (vote IN ('YES','NO','CANCEL')),
        authority_weight NUMERIC(3,2) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS physi_mining_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES physi_users(id) ON DELETE CASCADE,
        base_reward NUMERIC(14,2) NOT NULL, authority_multiplier NUMERIC(3,2) NOT NULL,
        earned_amount NUMERIC(14,2) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;

    // Run counts in parallel — each guarded so one failing doesn't take down others
    const results = await Promise.allSettled([
      sql`SELECT COUNT(*)::int as c FROM physi_users;`,
      sql`SELECT COUNT(*)::int as c FROM physi_events;`,
      sql`SELECT status, COUNT(*)::int as c FROM physi_events GROUP BY status;`,
      sql`SELECT scope_type, COUNT(*)::int as c FROM physi_events GROUP BY scope_type ORDER BY c DESC LIMIT 10;`,
      sql`SELECT COUNT(*)::int as c FROM physi_verifications;`,
      sql`SELECT vote, COUNT(*)::int as c, COALESCE(SUM(authority_weight),0)::float as w FROM physi_verifications GROUP BY vote;`,
      sql`SELECT COUNT(*)::int as c, COALESCE(SUM(earned_amount),0)::float as total, COALESCE(AVG(earned_amount),0)::float as avg FROM physi_mining_logs;`,
      sql`SELECT COALESCE(SUM(mining_balance),0)::float as total_bal, COALESCE(AVG(authority_final),0)::float as avg_auth, COALESCE(MAX(authority_final),0)::float as max_auth FROM physi_users;`,
      sql`SELECT COUNT(*)::int as c FROM physi_events WHERE event_date >= CURRENT_DATE;`,
      sql`SELECT COUNT(*)::int as c FROM physi_mining_logs WHERE created_at >= NOW() - INTERVAL '24 hours';`,
    ]);

    const getCount = (i: number, fallback = 0): number => {
      const r = results[i];
      if (r.status === 'fulfilled' && Array.isArray(r.value) && r.value[0]?.c != null) return Number(r.value[0].c);
      return fallback;
    };
    const getRow = (i: number): Record<string, unknown>[] => {
      const r = results[i];
      if (r.status === 'fulfilled' && Array.isArray(r.value)) return r.value as Record<string, unknown>[];
      return [];
    };
    const getSingle = (i: number): Record<string, unknown> | null => {
      const rows = getRow(i);
      return rows[0] ?? null;
    };

    const usersCount = getCount(0);
    const eventsCount = getCount(1);
    const eventsByStatus = getRow(2); // [{status, c}]
    const eventsByScope = getRow(3);
    const verificationsCount = getCount(4);
    const verificationsByVote = getRow(5);
    const miningAgg = getSingle(6) ?? { c: 0, total: 0, avg: 0 };
    const usersAgg = getSingle(7) ?? { total_bal: 0, avg_auth: 0, max_auth: 0 };
    const upcomingEvents = getCount(8);
    const mines24h = getCount(9);

    // Normalize aggregates to numbers
    const miningTotal = Number(miningAgg.total ?? 0);
    const miningAvg = Number(Number(miningAgg.avg ?? 0).toFixed(2));
    const miningCount = Number(miningAgg.c ?? 0);
    const totalBalance = Number(usersAgg.total_bal ?? 0);
    const avgAuthority = Number(Number(usersAgg.avg_auth ?? 0).toFixed(3));
    const maxAuthority = Number(usersAgg.max_auth ?? 0);

    // Build handy maps
    const statusMap: Record<string, number> = {};
    for (const r of eventsByStatus) statusMap[String(r.status)] = Number(r.c);
    const voteMap: Record<string, { count: number; weight: number }> = {};
    for (const r of verificationsByVote) {
      voteMap[String(r.vote)] = { count: Number(r.c), weight: Number(Number(r.w ?? 0).toFixed(2)) };
    }

    return NextResponse.json({
      ok: true,
      generated_at: new Date().toISOString(),
      metrics: {
        users: usersCount,
        events: eventsCount,
        events_by_status: statusMap, // e.g. {personal: 10, canonical: 3}
        events_by_scope: eventsByScope, // [{scope_type, c}]
        upcoming_events: upcomingEvents,
        verifications: verificationsCount,
        verifications_by_vote: voteMap,
        mining_logs: miningCount,
        mining_total_earned: Number(miningTotal.toFixed(2)),
        mining_avg_earned: miningAvg,
        mines_last_24h: mines24h,
        total_mining_balance: Number(totalBalance.toFixed(2)),
        avg_authority_final: avgAuthority,
        max_authority_final: Number(maxAuthority.toFixed(2)),
      },
      // Back-compat flat keys for dashboard cards expecting simple numbers
      counts: {
        physi_users: usersCount,
        physi_events: eventsCount,
        physi_verifications: verificationsCount,
        physi_mining_logs: miningCount,
      },
    });
  } catch (error) {
    console.error('[stats][GET] failed:', error);
    return NextResponse.json({ ok: false, error: 'Could not load stats right now.' }, { status: 500 });
  }
}
