/**
 * lib/adapters/features/stats.ts — Stats Feature + Api Adapter
 */
import { NextResponse } from "next/server";
import { getSql, isDbConfigured, dbNotConfigured, ensureAllTables } from "@/lib/db";
import { registerApiAdapter } from "../api";
import { registerFeature } from "../features";
import { logError, getErrorMessage } from "../error";

registerFeature({
  id: "stats",
  label: "Stats",
  apiRoute: "/api/stats",
  description: "Aggregated counts across all physi_* tables",
});

async function handleStats(req: Request): Promise<Response> {
  try {
    const sql = getSql();
    if (!isDbConfigured() || !sql) return NextResponse.json(dbNotConfigured(), { status: 503 });
    try {
      await ensureAllTables();
    } catch (e) {
      logError("STATS_ERROR", e, { route: "/api/stats", phase: "ensure" });
      console.warn("[stats] ensure:", (e as Error).message);
    }
    try {
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
