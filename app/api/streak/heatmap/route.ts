import { NextRequest, NextResponse } from "next/server";
import { getSql, isDbConfigured, dbNotConfigured, ensureAllTables } from "@/lib/db";
import { logError, getErrorMessage } from "@/lib/adapters/error";
import { getStreakHeatmap, weeklySummary, daysLeftToKeepFire } from "@/lib/streakHeatmap";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sql = getSql();
    if (!isDbConfigured() || !sql) return NextResponse.json(dbNotConfigured(), { status: 503 });
    try { await ensureAllTables(); } catch {}
    const sp = new URL(req.url).searchParams;
    const userId = sp.get("user_id") || sp.get("userId") || sp.get("id");
    if (!userId) return NextResponse.json({ ok: false, code: "BAD_INPUT", message: "user_id required" }, { status: 400 });
    const days = Math.min(Math.max(parseInt(sp.get("days")||"30",10)||30, 7), 90);
    const heatmap = await getStreakHeatmap(sql, userId, days);
    const summary = weeklySummary(heatmap);
    const daysLeft = daysLeftToKeepFire(heatmap);
    // also compute streak days count (consecutive from today)
    let streakLen = 0;
    for (let i = heatmap.length-1; i>=0; i--) {
      if (heatmap[i].is_streak_day) streakLen++;
      else break;
    }
    return NextResponse.json({ ok: true, heatmap, summary, daysLeft, streakLen, days });
  } catch (e) {
    logError("HEATMAP_FAILED", e, {});
    return NextResponse.json({ ok: false, code: "INTERNAL", message: getErrorMessage("INTERNAL") }, { status: 500 });
  }
}
