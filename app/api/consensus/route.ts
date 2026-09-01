/**
 * app/api/consensus/route.ts — Consensus Map unified feed
 * Single visualization of ALL pending truth coordination (hall / prof / scope dedup).
 * Student-native vocabulary: truth coordination, not Bitcoin terms.
 *
 * GET /api/consensus?programme=X&level=Y
 * Returns: { ok:true, items: ConsensusItem[], count, quorum_min, quorum_ratio }
 * Each item: { id, type, alias, canonical, votes_yes, votes_no, total, total_weight,
 *              quorum_progress, yes_pct, programme, level, group_key, created_at, expires_at }
 * Sort: most votes first (close to resolution), then newest. Limit 50.
 * Filter by programme/level when provided (halls filtered, others included).
 */
import { NextRequest, NextResponse } from "next/server";
import { getSql, isDbConfigured, dbNotConfigured, ensureAllTables } from "@/lib/db";
import { logError } from "@/lib/adapters/error";

export const dynamic = "force-dynamic";

const QUORUM_MIN = 8;
const QUORUM_RATIO = 0.70;

type ConsensusItem = {
  id: string;
  type: "hall" | "prof" | "scope";
  alias: string;
  canonical: string;
  votes_yes: number;
  votes_no: number;
  total: number;
  total_weight: number;
  quorum_progress: number; // 0..100, total / QUORUM_MIN
  yes_pct: number; // 0..100
  programme: string | null;
  level: string | null;
  group_key: string | null;
  created_at: string;
  expires_at: string | null;
  status: string;
};

function pctYes(yes: number, no: number): number {
  const t = yes + no;
  if (t === 0) return 0;
  return Math.round((yes / t) * 100);
}

function toItemFromHall(r: any): ConsensusItem {
  const yes = Number(r.votes_yes ?? 0);
  const no = Number(r.votes_no ?? 0);
  const total = Number(r.vote_count ?? yes + no);
  const expires = r.created_at ? new Date(new Date(r.created_at).getTime() + 30 * 24 * 3600 * 1000).toISOString() : null;
  return {
    id: `hall:${String(r.id)}`,
    type: "hall",
    alias: String(r.alias ?? ""),
    canonical: String(r.canonical ?? ""),
    votes_yes: yes,
    votes_no: no,
    total,
    total_weight: total, // raw = weighted for listing; precise weighted computed on vote
    quorum_progress: Math.min(100, Math.round((total / QUORUM_MIN) * 100)),
    yes_pct: pctYes(yes, no),
    programme: r.programme ?? null,
    level: r.level ?? null,
    group_key: r.hall_group_key ?? null,
    created_at: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
    expires_at: expires,
    status: String(r.status ?? "pending"),
  };
}

function toItemFromProf(r: any): ConsensusItem {
  const yes = Number(r.votes_yes ?? 0);
  const no = Number(r.votes_no ?? 0);
  const total = Number(r.vote_count ?? yes + no);
  const expires = r.created_at ? new Date(new Date(r.created_at).getTime() + 30 * 24 * 3600 * 1000).toISOString() : null;
  return {
    id: `prof:${String(r.id)}`,
    type: "prof",
    alias: String(r.alias ?? ""),
    canonical: String(r.canonical ?? ""),
    votes_yes: yes,
    votes_no: no,
    total,
    total_weight: total,
    quorum_progress: Math.min(100, Math.round((total / QUORUM_MIN) * 100)),
    yes_pct: pctYes(yes, no),
    programme: r.programme ?? null,
    level: r.level ?? null,
    group_key: r.prof_group_key ?? null,
    created_at: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
    expires_at: expires,
    status: String(r.status ?? "pending"),
  };
}

function toItemFromScope(r: any): ConsensusItem {
  const yes = Number(r.yes_votes ?? r.yes ?? 0);
  const no = Number(r.no_votes ?? r.no ?? 0);
  const total = yes + no;
  const sa = String(r.scope_a ?? "");
  const sb = String(r.scope_b ?? "");
  // scopes table tracks earliest vote; use min created_at if available
  const createdAt: string = r.created_at ? new Date(r.created_at).toISOString() : r.min_created_at ? new Date(r.min_created_at).toISOString() : new Date().toISOString();
  const expires = new Date(new Date(createdAt).getTime() + 30 * 24 * 3600 * 1000).toISOString();
  return {
    id: `scope:${sa}::${sb}`,
    type: "scope",
    alias: sa,
    canonical: sb,
    votes_yes: yes,
    votes_no: no,
    total,
    total_weight: total,
    quorum_progress: Math.min(100, Math.round((total / QUORUM_MIN) * 100)),
    yes_pct: pctYes(yes, no),
    programme: null,
    level: null,
    group_key: `${sa}::${sb}`,
    created_at: createdAt,
    expires_at: expires,
    status: "pending",
  };
}

export async function GET(req: NextRequest) {
  try {
    const sql = getSql();
    if (!isDbConfigured() || !sql) return NextResponse.json(dbNotConfigured(), { status: 503 });
    try {
      await ensureAllTables();
    } catch {}
    // lazy expiry: pending + expires_at < NOW() -> rejected (mempool RBF time-lock)
    try { const { expireMempool } = await import("@/lib/mempool"); await expireMempool(sql); } catch {}

    const { searchParams } = new URL(req.url);
    const programme = searchParams.get("programme")?.trim() || null;
    const level = searchParams.get("level")?.trim() || null;
    const limitParam = Number(searchParams.get("limit") || 50);
    const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(50, Math.floor(limitParam))) : 50;

    // Fetch in parallel — pending only
    const [hallRows, profRows, scopeRows, mempoolGroups] = await Promise.all([
      (async () => {
        try {
          if (programme && level) {
            return (await sql`SELECT * FROM physi_hall_aliases WHERE status='pending' AND (programme IS NULL OR lower(programme)=lower(${programme})) AND (level IS NULL OR lower(level)=lower(${level})) ORDER BY vote_count DESC, created_at DESC LIMIT 50`) as any[];
          }
          if (programme) {
            return (await sql`SELECT * FROM physi_hall_aliases WHERE status='pending' AND (programme IS NULL OR lower(programme)=lower(${programme})) ORDER BY vote_count DESC, created_at DESC LIMIT 50`) as any[];
          }
          return (await sql`SELECT * FROM physi_hall_aliases WHERE status='pending' ORDER BY vote_count DESC, created_at DESC LIMIT 50`) as any[];
        } catch {
          return [] as any[];
        }
      })(),
      (async () => {
        try {
          // prof aliases have optional programme/level filter via existence; just filter status pending
          // if programme/level supplied, filter where those match or are null
          if (programme || level) {
            // Build conditional: programme null or matches, same for level
            // Use separate queries to avoid null handling complexity
            return (await sql`SELECT * FROM physi_prof_aliases WHERE status='pending' ORDER BY vote_count DESC, created_at DESC LIMIT 50`) as any[];
          }
          return (await sql`SELECT * FROM physi_prof_aliases WHERE status='pending' ORDER BY vote_count DESC, created_at DESC LIMIT 50`) as any[];
        } catch {
          return [] as any[];
        }
      })(),
      (async () => {
        try {
          // Scope pending: those not in resolution table
          const rows = (await sql`
            SELECT
              scope_a,
              scope_b,
              COUNT(*) FILTER (WHERE vote_value = 1) AS yes_votes,
              COUNT(*) FILTER (WHERE vote_value = -1) AS no_votes,
              MIN(created_at) AS min_created_at,
              MAX(created_at) AS max_created_at
            FROM physi_scope_votes v
            WHERE NOT EXISTS (
              SELECT 1 FROM physi_scope_resolution r
              WHERE r.scope_a = v.scope_a AND r.scope_b = v.scope_b
            )
            GROUP BY scope_a, scope_b
            HAVING COUNT(*) >= 1
            ORDER BY COUNT(*) DESC, MAX(created_at) DESC
            LIMIT 50
          `) as any[];
          return rows;
        } catch {
          return [] as any[];
        }
      })(),
      // mempool: pending physi_events + physi_slot_claims grouped by slot (RBF — tip vs contenders with vote tallies)
      (async () => {
        try {
          const { groupBySlot } = await import("@/lib/mempool");
          const rows = (await sql`SELECT id, title, venue, event_date, event_time, scope_value, status, created_at, expires_at, created_by, COALESCE(slot_key,'') as slot_key FROM physi_events WHERE status='pending' ORDER BY created_at DESC LIMIT 100`) as any[];
          if (!rows.length) return [] as any[];
          // also fetch slot_claims to show competing venues that were stored via RBF
          let slotClaims: any[] = [];
          try { slotClaims = await sql`SELECT id, slot_key, event_id, claimer_id, venue, event_time, title, created_at, vote_weight_yes, vote_weight_no FROM physi_slot_claims ORDER BY created_at DESC LIMIT 200` as any; } catch { slotClaims = []; }
          const grouped = groupBySlot(rows);
          // merge slot_claims into grouped map (by slot_key)
          for (const sc of slotClaims) {
            const sk = String(sc.slot_key || "");
            if (!sk) continue;
            if (!grouped.has(sk)) grouped.set(sk, []);
            // avoid duplicate venue already in grouped from events
            const existing = grouped.get(sk)!;
            const dup = existing.some((e:any) => String(e.venue).toLowerCase() === String(sc.venue).toLowerCase() && String(e.title).toLowerCase() === String(sc.title).toLowerCase());
            if (!dup) {
              existing.push({ id: sc.event_id || sc.id, title: sc.title, venue: sc.venue, event_date: sk.split("::")[1] || "", event_time: sc.event_time, scope_value: sk.split("::")[0] || null, created_at: sc.created_at, expires_at: null, slot_key: sk, vote_weight_yes: sc.vote_weight_yes, vote_weight_no: sc.vote_weight_no, _claim: true });
            }
          }
          const mempoolItems: any[] = [];
          for (const [slotKey, claims] of Array.from(grouped.entries())) {
            if (claims.length <= 1) continue;
            // tip = highest vote_weight_yes or earliest if tie
            const sorted = [...claims].sort((a,b)=>{
              const aw = Number(a.vote_weight_yes ?? 0);
              const bw = Number(b.vote_weight_yes ?? 0);
              if (bw !== aw) return bw - aw;
              return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
            });
            const tip = sorted[0];
            const contenders = sorted.slice(1);
            const total = claims.length;
            const tipYes = Number(tip.vote_weight_yes ?? 1);
            const contenderYes = contenders.reduce((s:number,c:any)=> s + Number(c.vote_weight_yes ?? 0), 0);
            mempoolItems.push({
              id: `mempool:${slotKey}`,
              type: "mempool",
              alias: String(tip.title || ""),
              canonical: String(tip.venue || ""),
              votes_yes: tipYes,
              votes_no: contenderYes || contenders.length,
              total,
              total_weight: tipYes + contenderYes,
              quorum_progress: Math.min(100, Math.round((total / QUORUM_MIN) * 100)),
              yes_pct: total ? Math.round((tipYes/(tipYes+ (contenderYes||contenders.length)))*100) : 0,
              programme: tip.scope_value ?? null,
              level: null,
              group_key: slotKey,
              created_at: tip.created_at ? new Date(tip.created_at).toISOString() : new Date().toISOString(),
              expires_at: tip.expires_at ? new Date(tip.expires_at).toISOString() : null,
              status: "pending",
              mempool: {
                slot: slotKey,
                tip: { id: tip.id, venue: tip.venue, event_time: tip.event_time, title: tip.title, vote_weight_yes: tip.vote_weight_yes },
                contenders: contenders.map((c:any)=>({ id:c.id, venue:c.venue, event_time:c.event_time, title:c.title, vote_weight_yes: c.vote_weight_yes })),
                tip_label: `${tip.venue} (leading ${tipYes}/${total} — ${contenders.map((c:any)=>c.venue).join(" vs ")})`,
              },
            });
          }
          return mempoolItems;
        } catch { return [] as any[]; }
      })(),
    ]);

    const hallItems = (hallRows as any[]).map(toItemFromHall);
    const profItems = (profRows as any[]).map(toItemFromProf);
    const scopeItems = (scopeRows as any[]).map(toItemFromScope);
    const mempoolItems = (mempoolGroups as any[]) || [];

    // Student-native: filter programme/level only applies to hall items if supplied; scope/prof always shown
    // (they are campus-wide truth coordination)

    const all: ConsensusItem[] = [...hallItems, ...profItems, ...scopeItems, ...(mempoolItems as any)];

    // Sort: most votes first (close to resolution), then newest
    all.sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    const sliced = all.slice(0, limit);

    // Try to enrich total_weight with weighted totals (best-effort, no extra queries blocking feed)
    // We return raw weight for now; precise weighted computed on vote path.

    return NextResponse.json({
      ok: true,
      items: sliced,
      count: sliced.length,
      total_pending: all.length,
      quorum_min: QUORUM_MIN,
      quorum_ratio: QUORUM_RATIO,
      breakdown: {
        hall: hallItems.length,
        prof: profItems.length,
        scope: scopeItems.length,
        mempool: mempoolItems.length,
      },
    });
  } catch (e) {
    logError("CONSENSUS_FETCH_FAILED", e, {});
    return NextResponse.json({ ok: false, code: "INTERNAL", message: "couldn't load consensus map" }, { status: 500 });
  }
}
