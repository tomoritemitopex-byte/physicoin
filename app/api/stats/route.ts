import { NextResponse } from 'next/server';
import { sql, dbUnavailableResponse } from '@/lib/db';
import { ensureAllTables } from '@/lib/ensure';

export const dynamic = 'force-dynamic';

/**
 * GET /api/stats
 * Returns real counts/sums from physi_* tables for dashboard metrics.
 * Gracefully handles DATABASE_URL missing (503 with structured code) and empty tables.
 * Neon cold-start hardened: ensureAllTables is guarded + stats never 500 on STATS_ERROR.
 */
export async function GET() {
  if (!sql) {
    return NextResponse.json(dbUnavailableResponse(), { status: 503 });
  }

  // Guard ensure — never let DDL cold-start failure bubble to 500
  try {
    await ensureAllTables();
  } catch (e) {
    console.warn('[stats] ensureAllTables failed (cold start, will serve degraded stats):', (e as Error)?.message ?? e);
    // continue — queries below use Promise.allSettled and return defaults per table
  }

  try {
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
    const eventsByStatus = getRow(2);
    const eventsByScope = getRow(3);
    const verificationsCount = getCount(4);
    const verificationsByVote = getRow(5);
    const miningAgg = getSingle(6) ?? { c: 0, total: 0, avg: 0 };
    const usersAgg = getSingle(7) ?? { total_bal: 0, avg_auth: 0, max_auth: 0 };
    const upcomingEvents = getCount(8);
    const mines24h = getCount(9);

    const miningTotal = Number(miningAgg.total ?? 0);
    const miningAvg = Number(Number(miningAgg.avg ?? 0).toFixed(2));
    const miningCount = Number(miningAgg.c ?? 0);
    const totalBalance = Number(usersAgg.total_bal ?? 0);
    const avgAuthority = Number(Number(usersAgg.avg_auth ?? 0).toFixed(3));
    const maxAuthority = Number(usersAgg.max_auth ?? 0);

    const statusMap: Record<string, number> = {};
    for (const r of eventsByStatus) statusMap[String(r.status)] = Number(r.c);
    const voteMap: Record<string, { count: number; weight: number }> = {};
    for (const r of verificationsByVote) {
      voteMap[String(r.vote)] = { count: Number(r.c), weight: Number(Number(r.w ?? 0).toFixed(2)) };
    }

    // If all queries failed, return degraded 200 with STATS_ERROR instead of 500
    const allFailed = results.every((r) => r.status === 'rejected');
    if (allFailed) {
      console.warn('[stats][GET] all queries failed — returning degraded STATS_ERROR 200');
      return NextResponse.json(
        {
          ok: false,
          error: 'Could not load stats right now.',
          code: 'STATS_ERROR',
          metrics: {
            users: 0,
            events: 0,
            events_by_status: {},
            events_by_scope: [],
            upcoming_events: 0,
            verifications: 0,
            verifications_by_vote: {},
            mining_logs: 0,
            mining_total_earned: 0,
            mining_avg_earned: 0,
            mines_last_24h: 0,
            total_mining_balance: 0,
            avg_authority_final: 0,
            max_authority_final: 0,
          },
          counts: { physi_users: 0, physi_events: 0, physi_verifications: 0, physi_mining_logs: 0 },
        },
        { status: 200 }
      );
    }

    return NextResponse.json({
      ok: true,
      generated_at: new Date().toISOString(),
      metrics: {
        users: usersCount,
        events: eventsCount,
        events_by_status: statusMap,
        events_by_scope: eventsByScope,
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
      counts: {
        physi_users: usersCount,
        physi_events: eventsCount,
        physi_verifications: verificationsCount,
        physi_mining_logs: miningCount,
      },
    });
  } catch (error) {
    console.error('[stats][GET] failed:', error);
    // Never 500 — return 200 with STATS_ERROR so frontend can show degraded UI without error boundary
    return NextResponse.json(
      { ok: false, error: 'Could not load stats right now.', code: 'STATS_ERROR', metrics: null },
      { status: 200 }
    );
  }
}
