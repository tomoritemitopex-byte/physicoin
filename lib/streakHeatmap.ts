/**
 * lib/streakHeatmap.ts — 30-day activity grid + weekly summary
 * Counts daily verifications/mining/logs as activity_count; is_streak_day if any.
 */

export type HeatmapDay = { date: string; activity_count: number; is_streak_day: boolean; intensity: 0|1|2|3|4 };

export function intensityFromCount(n: number): 0|1|2|3|4 {
  if (n <= 0) return 0;
  if (n === 1) return 1;
  if (n <= 3) return 2;
  if (n <= 6) return 3;
  return 4;
}

export function toISO(date: Date): string {
  const y = date.getFullYear(), m = String(date.getMonth()+1).padStart(2,"0"), d = String(date.getDate()).padStart(2,"0");
  return `${y}-${m}-${d}`;
}

export function daysAgo(n: number): string {
  const d = new Date(); d.setDate(d.getDate()-n); return toISO(d);
}

/**
 * Server helper: build 30-day heatmap for user from DB.
 * Queries physi_verifications + physi_mining_logs + physi_events (created_by) grouped by date.
 */
export async function getStreakHeatmap(sql: any, userId: string, days = 30): Promise<HeatmapDay[]> {
  const out: HeatmapDay[] = [];
  const today = new Date(); today.setHours(0,0,0,0);
  const dateList: string[] = [];
  for (let i = days-1; i >= 0; i--) {
    const d = new Date(today); d.setDate(today.getDate()-i);
    dateList.push(toISO(d));
  }
  const counts = new Map<string, number>();
  for (const d of dateList) counts.set(d, 0);
  if (!sql || !userId) {
    return dateList.map(d => ({ date: d, activity_count: 0, is_streak_day: false, intensity: 0 }));
  }
  try {
    const start = dateList[0];
    // verifications
    try {
      const rows: any[] = await sql`SELECT to_char(created_at::date,'YYYY-MM-DD') as d, COUNT(*)::int as c FROM physi_verifications WHERE verifier_id=${userId} AND created_at::date >= ${start}::date GROUP BY d`;
      for (const r of rows) counts.set(String(r.d), (counts.get(String(r.d))||0)+Number(r.c||0));
    } catch {}
    // mining logs
    try {
      const rows: any[] = await sql`SELECT to_char(created_at::date,'YYYY-MM-DD') as d, COUNT(*)::int as c FROM physi_mining_logs WHERE user_id=${userId} AND created_at::date >= ${start}::date GROUP BY d`;
      for (const r of rows) counts.set(String(r.d), (counts.get(String(r.d))||0)+Number(r.c||0));
    } catch {}
    // events created
    try {
      const rows: any[] = await sql`SELECT to_char(created_at::date,'YYYY-MM-DD') as d, COUNT(*)::int as c FROM physi_events WHERE created_by=${userId} AND created_at::date >= ${start}::date GROUP BY d`;
      for (const r of rows) counts.set(String(r.d), (counts.get(String(r.d))||0)+Number(r.c||0));
    } catch {}
    // scope votes
    try {
      const rows: any[] = await sql`SELECT to_char(created_at::date,'YYYY-MM-DD') as d, COUNT(*)::int as c FROM physi_scope_votes WHERE voter_id=${userId} AND created_at::date >= ${start}::date GROUP BY d`;
      for (const r of rows) counts.set(String(r.d), (counts.get(String(r.d))||0)+Number(r.c||0));
    } catch {}
  } catch {}
  return dateList.map(d => {
    const c = counts.get(d) || 0;
    return { date: d, activity_count: c, is_streak_day: c>0, intensity: intensityFromCount(c) };
  });
}

export function weeklySummary(days: HeatmapDay[]): string {
  const last7 = days.slice(-7);
  const n = last7.reduce((s,d)=> s + d.activity_count, 0);
  const streakDays = last7.filter(d=> d.is_streak_day).length;
  if (n===0) return "No activity this week — verify a class to start your streak 🔥";
  return `You verified ${n} ${n===1?"class":"classes"} this week · ${streakDays}/7 days active`;
}

export function daysLeftToKeepFire(days: HeatmapDay[]): number {
  // if last day was streak day, 1 day left? Actually streak decays with 1 day grace
  const last = days[days.length-1];
  if (!last?.is_streak_day) {
    // find last streak day
    let gap=0;
    for (let i=days.length-1; i>=0; i--) {
      if (days[i].is_streak_day) break;
      gap++;
    }
    if (gap>=2) return 0; // already broken
    return 1;
  }
  return 1; // 1 day grace
}
