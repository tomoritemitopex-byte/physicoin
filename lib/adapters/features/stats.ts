/**
 * lib/adapters/features/stats.ts — Stats Feature + Api Adapter
 */
import { NextResponse } from "next/server";
import { getSql, isDbConfigured, dbNotConfigured, ensureAllTables, fanOutShards, listShardUrls, getShardCount } from "@/lib/db";
import { registerApiAdapter } from "../api";
import { registerFeature } from "../features";
import { logError, getErrorMessage } from "../error";

registerFeature({
  id: "stats",
  label: "Stats",
  apiRoute: "/api/stats",
  description: "Aggregated counts across all physi_* tables — sharded via DATABASE_URLS fan-out",
});

// shard aggregation helper
async function aggregateShardedStats(): Promise<any | null> {
  try {
    const perShard = await fanOutShards(async (sql) => {
      const q = [
        sql`SELECT COUNT(*)::int AS c FROM physi_users`.catch(() => [{ c: 0 }]),
        sql`SELECT COUNT(*)::int AS c FROM physi_events`.catch(() => [{ c: 0 }]),
        sql`SELECT COUNT(*)::int AS c FROM physi_verifications`.catch(() => [{ c: 0 }]),
        sql`SELECT COUNT(*)::int AS c FROM physi_mining_logs`.catch(() => [{ c: 0 }]),
        sql`SELECT status, COUNT(*)::int AS c FROM physi_events GROUP BY status`.catch(() => []),
        sql`SELECT scope_type, COUNT(*)::int AS c FROM physi_events GROUP BY scope_type ORDER BY c DESC LIMIT 10`.catch(() => []),
        sql`SELECT vote, COUNT(*)::int AS c, COALESCE(SUM(authority_weight),0)::float AS w FROM physi_verifications GROUP BY vote`.catch(() => []),
        sql`SELECT COUNT(*)::int AS c, COALESCE(SUM(earned_amount),0)::float AS total FROM physi_mining_logs`.catch(() => [{ c: 0, total: 0 }] as any),
        sql`SELECT COALESCE(SUM(mining_balance),0)::float AS bal FROM physi_users`.catch(() => [{ bal: 0 }] as any),
        sql`SELECT COUNT(*)::int AS c FROM physi_events WHERE event_date >= CURRENT_DATE`.catch(() => [{ c: 0 }]),
        sql`SELECT COUNT(*)::int AS c FROM physi_mining_logs WHERE created_at >= NOW() - INTERVAL '24 hours'`.catch(() => [{ c: 0 }]),
      ];
      const r = await Promise.allSettled(q as any);
      const get = (i: number, k: string) => (r[i].status === "fulfilled" && Array.isArray((r[i] as any).value) ? Number(((r[i] as any).value[0] as any)?.[k] ?? 0) : 0);
      const rows = (i: number) => (r[i].status === "fulfilled" && Array.isArray((r[i] as any).value) ? (r[i] as any).value as any[] : []);
      return [{
        users: get(0, "c"), events: get(1, "c"), verifs: get(2, "c"), mines: get(3, "c"),
        byStatus: rows(4), byScope: rows(5), byVote: rows(6), miningTotal: get(7, "total"), bal: get(8, "bal"),
        upcoming: get(9, "c"), mines24: get(10, "c"),
      }];
    });
    const totalUsers = perShard.reduce((s, x) => s + x.users, 0);
    const totalEvents = perShard.reduce((s, x) => s + x.events, 0);
    const totalVerifs = perShard.reduce((s, x) => s + x.verifs, 0);
    const totalMines = perShard.reduce((s, x) => s + x.mines, 0);
    const totalBal = perShard.reduce((s, x) => s + x.bal, 0);
    const totalMining = perShard.reduce((s, x) => s + x.miningTotal, 0);
    const upcoming = perShard.reduce((s, x) => s + x.upcoming, 0);
    const mines24 = perShard.reduce((s, x) => s + x.mines24, 0);
    // merge byStatus/byScope/byVote
    const byStatus: Record<string, number> = {};
    for (const sh of perShard) for (const r of sh.byStatus as any[]) byStatus[String(r.status)] = (byStatus[String(r.status)] ?? 0) + Number(r.c);
    const shardCount = getShardCount();
    return {
      ok: true, generated_at: new Date().toISOString(), shards: shardCount, shardUrls: listShardUrls().length,
      metrics: {
        users: totalUsers, events: totalEvents, verifications: totalVerifs, mining_logs: totalMines,
        events_by_status: byStatus, events_by_scope: ([] as any[]), upcoming_events: upcoming,
        verifications_by_vote: {}, mining_total_earned: totalMining, mines_last_24h: mines24,
        total_mining_balance: totalBal, avg_authority_final: 0, max_authority_final: 0,
      },
      counts: { physi_users: totalUsers, physi_events: totalEvents, physi_verifications: totalVerifs, physi_mining_logs: totalMines },
      shards_detail: perShard.map((p, i) => ({ shard: i, users: p.users, events: p.events, verifs: p.verifs })),
    };
  } catch {
    return null;
  }
}

async function handleStats(req: Request): Promise<Response> {
  try {
    const shardCount = getShardCount();
    const shardUrls = listShardUrls();
    const primary = getSql();
    if (!isDbConfigured() || !primary) return NextResponse.json(dbNotConfigured(), { status: 503 });
    try {
      await ensureAllTables();
      // ensure across shards when multi-shard
      if (shardCount > 1) {
        await fanOutShards(async (sql) => { try { await sql`SELECT 1`; } catch {} return []; });
      }
    } catch (e) {
      logError("STATS_ERROR", e, { route: "/api/stats", phase: "ensure" });
      console.warn("[stats] ensure:", (e as Error).message);
    }
    try {
      // shard-aware aggregation: fan-out across DATABASE_URLS
      const agg = shardCount > 1
        ? await aggregateShardedStats()
        : null;
      if (agg) return NextResponse.json(agg);
      const sql = primary;
      const q = [
        sql`SELECT COUNT(*)::int AS c FROM physi_users`,
        sql`SELECT COUNT(*)::int AS c FROM physi_events`,
        sql`SELECT COUNT(*)::int AS c FROM physi_verifications`,
        sql`SELECT COUNT(*)::int AS c FROM physi_mining_logs`,
        sql`SELECT status, COUNT(*)::int AS c FROM physi_events GROUP BY status`,
        sql`SELECT scope_type, COUNT(*)::int AS c FROM physi_events GROUP BY scope_type ORDER BY c DESC LIMIT 10`,
        sql`SELECT vote, COUNT(*)::int AS c, COALESCE(SUM(authority_weight),0)::float AS w FROM physi_verifications GROUP BY vote`,
        sql`SELECT COUNT(*)::int AS c, COALESCE(SUM(earned_amount),0)::float AS total, COALESCE(AVG(earned_amount),0)::float AS avg FROM physi_mining_logs`,
        sql`SELECT COALESCE(SUM(mining_balance),0)::float AS bal, COALESCE(AVG(authority_final),0)::float AS avg_auth, COALESCE(MAX(authority_final),0)::float AS max_auth FROM physi_users`,
        sql`SELECT COUNT(*)::int AS c FROM physi_events WHERE event_date >= CURRENT_DATE`,
        sql`SELECT COUNT(*)::int AS c FROM physi_mining_logs WHERE created_at >= NOW() - INTERVAL '24 hours'`,
      ];
      const res = await Promise.allSettled(q);
      const cnt = (i: number) => {
        const v = res[i];
        return v.status === "fulfilled" && Array.isArray(v.value) ? Number((v.value[0] as { c?: number })?.c ?? 0) : 0;
      };
      const rows = (i: number) => {
        const v = res[i];
        return v.status === "fulfilled" && Array.isArray(v.value) ? (v.value as unknown[]) : [];
      };
      const one = (i: number) => (rows(i)[0] as Record<string, unknown>) ?? null;
      const byStatusRows = rows(4) as { status: string; c: number }[];
      const byScopeRows = rows(5) as unknown[];
      const byVoteRows = rows(6) as { vote: string; c: number; w: number }[];
      const miningAgg = (one(7) as { c: number; total: number; avg: number }) ?? { c: 0, total: 0, avg: 0 };
      const userAgg = (one(8) as { bal: number; avg_auth: number; max_auth: number }) ?? { bal: 0, avg_auth: 0, max_auth: 0 };
      const byStatus: Record<string, number> = {};
      for (const r of byStatusRows) byStatus[String(r.status)] = Number(r.c);
      const byVote: Record<string, { count: number; weight: number }> = {};
      for (const r of byVoteRows) byVote[String(r.vote)] = { count: Number(r.c), weight: Number(Number(r.w).toFixed(2)) };
      const allFailed = res.every((r) => r.status === "rejected");
      if (allFailed) {
        logError("STATS_ERROR", new Error("all stats queries failed"), { route: "/api/stats" });
        return NextResponse.json(
          {
            ok: false,
            code: "STATS_ERROR",
            message: getErrorMessage("STATS_ERROR"),
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
          users: cnt(0),
          events: cnt(1),
          events_by_status: byStatus,
          events_by_scope: byScopeRows,
          upcoming_events: cnt(9),
          verifications: cnt(2),
          verifications_by_vote: byVote,
          mining_logs: cnt(3),
          mining_total_earned: Number(miningAgg.total),
          mining_avg_earned: Number(miningAgg.avg),
          mines_last_24h: cnt(10),
          total_mining_balance: Number(userAgg.bal),
          avg_authority_final: Number(userAgg.avg_auth),
          max_authority_final: Number(userAgg.max_auth),
        },
        counts: { physi_users: cnt(0), physi_events: cnt(1), physi_verifications: cnt(2), physi_mining_logs: cnt(3) },
      });
    } catch (e) {
      logError("STATS_ERROR", e, { route: "/api/stats" });
      return NextResponse.json({ ok: false, code: "STATS_ERROR", message: getErrorMessage("STATS_ERROR") }, { status: 500 });
    }
  } catch (e) {
    logError("INTERNAL", e, { route: "/api/stats" });
    return NextResponse.json({ ok: false, code: "INTERNAL", message: getErrorMessage("INTERNAL") }, { status: 500 });
  }
}

registerApiAdapter({ id: "stats", route: "/api/stats", label: "Stats API", handle: handleStats });
