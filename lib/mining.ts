/**
 * lib/mining.ts — daily cap helper used by /api/mining
 */
export async function canMineToday(sql: any, userId: string): Promise<{ allowed: boolean; nextAt?: string }> {
  if (!sql || !userId) return { allowed: false };
  try {
    const rows: any[] = await sql`SELECT created_at FROM physi_mining_logs WHERE user_id=${userId} AND created_at > NOW() - INTERVAL '24 hours' LIMIT 1` as any;
    if (rows.length) {
      const nextAt = new Date(new Date(rows[0].created_at).getTime() + 24*3600*1000).toISOString();
      return { allowed: false, nextAt };
    }
    return { allowed: true };
  } catch {
    return { allowed: true };
  }
}
