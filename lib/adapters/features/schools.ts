/**
 * lib/adapters/features/schools.ts — Schools + Departments Feature + API Adapter
 *
 * Vine that grows Nigeria → Ghana on autopilot:
 * Student free-text (school/dept names) → lower() grouping → aggregated choices → vote → winners become dropdown.
 * If department goes extinct (0 events for 90 days) auto-archive + update historical map.
 *
 * Additive only: uses existing physi_schools + physi_school_departments, just adds aggregation logic.
 * No DROP, no manual seeding. DDL additive via ensureSchoolVotes / ensureSchoolArchiveColumns.
 * Mirrors hall-alias voting pattern but for schools.
 */
import { NextResponse } from "next/server";
import { getSql, isDbConfigured, dbNotConfigured, } from "@/lib/db";
import { registerApiAdapter } from "../api";
import { registerFeature } from "../features";
import { logError, getErrorMessage } from "../error";

export const schoolsFeature = {
  id: "schools",
  label: "Schools",
  apiRoute: "/api/schools",
  description: "Student-created schools + departments, creator-verified — vine autopilot: free-text → aggregate lower() → vote → dropdown + 90d auto-archive",
};

registerFeature(schoolsFeature);

// ── Helpers ──

async function requireCreator(sql: any, req: Request): Promise<string | null> {
  const { getAuthUserId } = await import("@/lib/auth");
  const uid = getAuthUserId(req as Request);
  if (!uid) return null;
  const row = await sql`SELECT id, full_name, nickname, programme FROM physi_users WHERE id = ${uid} LIMIT 1`;
  if (!row.length) return null;
  const u = row[0] as any;
  const isCreator = u.programme === "Creator" || u.nickname === "creator_01" || u.full_name === "Creator";
  return isCreator ? uid : null;
}

function normalize(v: string): string {
  return String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ").slice(0, 200);
}

function displayFromNormalized(norm: string, fallback: string): string {
  // Title-case-ish display for fallback: keep original fallback's casing if available
  if (fallback && fallback.trim()) return fallback.trim().slice(0, 200);
  return norm;
}

// Vine maintenance — archive only, NO DDL.
// Inverted-audit P0 (K-A3): runtime DDL is forbidden on hot paths; vine
// tables/columns are created by build-time migrate (database/schema.physi.sql).
// This keeps only the DML maintenance write (90d extinct-dept archive).
async function runVineMaintenance(sql: any): Promise<void> {
  try { const { archiveExtinctDepartments } = await import("@/lib/db"); await archiveExtinctDepartments(); } catch {}
}

// Build aggregated choices for schools: case-insensitive lower() grouping
async function getAggregatedSchoolChoices(sql: any): Promise<any[]> {
  try {
    // proposals grouped by lower(name) where not archived — fallback if column missing pre-migration
    let proposals: any[];
    try {
      proposals = await sql`
        SELECT lower(name) AS normalized,
               MIN(name) AS display_name,
               COUNT(*)::int AS proposal_count,
               MIN(created_at) AS first_seen,
               MAX(created_at) AS last_seen,
               COUNT(DISTINCT created_by)::int AS proposer_count
        FROM physi_schools
        WHERE archived_at IS NULL
        GROUP BY lower(name)
        ORDER BY COUNT(*) DESC` as any;
    } catch {
      proposals = await sql`
        SELECT lower(name) AS normalized,
               MIN(name) AS display_name,
               COUNT(*)::int AS proposal_count,
               MIN(created_at) AS first_seen,
               MAX(created_at) AS last_seen,
               COUNT(DISTINCT created_by)::int AS proposer_count
        FROM physi_schools
        GROUP BY lower(name)
        ORDER BY COUNT(*) DESC` as any;
    }
    // votes grouped by lower(normalized)
    let voteMap = new Map<string, { votes_yes: number; votes_no: number; vote_total: number }>();
    try {
      const votes: any[] = await sql`
        SELECT lower(normalized) AS norm,
               SUM(CASE WHEN vote_value=1 THEN 1 ELSE 0 END)::int AS votes_yes,
               SUM(CASE WHEN vote_value=-1 THEN 1 ELSE 0 END)::int AS votes_no,
               COUNT(*)::int AS vote_total
        FROM physi_school_votes
        GROUP BY lower(normalized)`;
      for (const v of votes) voteMap.set(String(v.norm), { votes_yes: Number(v.votes_yes||0), votes_no: Number(v.votes_no||0), vote_total: Number(v.vote_total||0) });
    } catch {}
    const merged = proposals.map((p: any) => {
      const norm = String(p.normalized ?? "");
      const vm = voteMap.get(norm) || { votes_yes: 0, votes_no: 0, vote_total: 0 };
      const total = Number(p.proposal_count||0) + Number(vm.vote_total||0);
      const winner = total >= 3; // autopilot threshold: 3 signals → permanent dropdown
      return {
        normalized: norm,
        display_name: displayFromNormalized(norm, String(p.display_name||norm)),
        proposal_count: Number(p.proposal_count||0),
        proposer_count: Number(p.proposer_count||0),
        votes_yes: Number(vm.votes_yes||0),
        votes_no: Number(vm.votes_no||0),
        vote_total: Number(vm.vote_total||0),
        total_votes: total,
        first_seen: p.first_seen,
        last_seen: p.last_seen,
        is_winner: winner,
        status: winner ? "verified" : "pending",
      };
    });
    // also include vote-only normals that have no proposal yet (pure votes before proposal)
    for (const [norm, vm] of Array.from(voteMap.entries())) {
      if (!merged.find((m:any)=> m.normalized===norm)) {
        const total = Number((vm as any).vote_total||0);
        merged.push({
          normalized: norm,
          display_name: displayFromNormalized(norm, norm),
          proposal_count: 0,
          proposer_count: 0,
          votes_yes: Number((vm as any).votes_yes||0),
          votes_no: Number((vm as any).votes_no||0),
          vote_total: Number((vm as any).vote_total||0),
          total_votes: total,
          first_seen: null,
          last_seen: null,
          is_winner: total >= 3,
          status: total >= 3 ? "verified" : "pending",
        });
      }
    }
    merged.sort((a:any,b:any)=> Number(b.total_votes)-Number(a.total_votes) || String(a.display_name).localeCompare(String(b.display_name)));
    return merged;
  } catch {
    return [];
  }
}

async function getAggregatedDeptChoices(sql: any, schoolId?: string | null): Promise<any[]> {
  try {
    let proposals: any[];
    if (schoolId) {
      try {
        proposals = await sql`
          SELECT lower(name) AS normalized,
                 MIN(name) AS display_name,
                 COUNT(*)::int AS proposal_count,
                 MIN(created_at) AS first_seen,
                 MAX(created_at) AS last_seen,
                 COUNT(DISTINCT created_by)::int AS proposer_count
          FROM physi_school_departments
          WHERE school_id = ${schoolId} AND archived_at IS NULL
          GROUP BY lower(name)
          ORDER BY COUNT(*) DESC` as any;
      } catch {
        proposals = await sql`
          SELECT lower(name) AS normalized,
                 MIN(name) AS display_name,
                 COUNT(*)::int AS proposal_count,
                 MIN(created_at) AS first_seen,
                 MAX(created_at) AS last_seen,
                 COUNT(DISTINCT created_by)::int AS proposer_count
          FROM physi_school_departments
          WHERE school_id = ${schoolId}
          GROUP BY lower(name)
          ORDER BY COUNT(*) DESC` as any;
      }
    } else {
      try {
        proposals = await sql`
          SELECT lower(name) AS normalized,
                 MIN(name) AS display_name,
                 COUNT(*)::int AS proposal_count,
                 MIN(created_at) AS first_seen,
                 MAX(created_at) AS last_seen,
                 COUNT(DISTINCT created_by)::int AS proposer_count,
                 MIN(school_id)::text AS sample_school_id
          FROM physi_school_departments
          WHERE archived_at IS NULL
          GROUP BY lower(name)
          ORDER BY COUNT(*) DESC` as any;
      } catch {
        proposals = await sql`
          SELECT lower(name) AS normalized,
                 MIN(name) AS display_name,
                 COUNT(*)::int AS proposal_count,
                 MIN(created_at) AS first_seen,
                 MAX(created_at) AS last_seen,
                 COUNT(DISTINCT created_by)::int AS proposer_count,
                 MIN(school_id)::text AS sample_school_id
          FROM physi_school_departments
          GROUP BY lower(name)
          ORDER BY COUNT(*) DESC` as any;
      }
    }
    let voteMap = new Map<string, { votes_yes: number; votes_no: number; vote_total: number }>();
    try {
      let votes: any[];
      if (schoolId) {
        votes = await sql`
          SELECT lower(normalized) AS norm,
                 SUM(CASE WHEN vote_value=1 THEN 1 ELSE 0 END)::int AS votes_yes,
                 SUM(CASE WHEN vote_value=-1 THEN 1 ELSE 0 END)::int AS votes_no,
                 COUNT(*)::int AS vote_total
          FROM physi_dept_votes
          WHERE school_id = ${schoolId}
          GROUP BY lower(normalized)`;
      } else {
        votes = await sql`
          SELECT lower(normalized) AS norm,
                 SUM(CASE WHEN vote_value=1 THEN 1 ELSE 0 END)::int AS votes_yes,
                 SUM(CASE WHEN vote_value=-1 THEN 1 ELSE 0 END)::int AS votes_no,
                 COUNT(*)::int AS vote_total
          FROM physi_dept_votes
          GROUP BY lower(normalized)`;
      }
      for (const v of votes) voteMap.set(String(v.norm), { votes_yes: Number(v.votes_yes||0), votes_no: Number(v.votes_no||0), vote_total: Number(v.vote_total||0) });
    } catch {}
    const merged = proposals.map((p: any) => {
      const norm = String(p.normalized ?? "");
      const vm = voteMap.get(norm) || { votes_yes: 0, votes_no: 0, vote_total: 0 };
      const total = Number(p.proposal_count||0) + Number(vm.vote_total||0);
      return {
        normalized: norm,
        display_name: displayFromNormalized(norm, String(p.display_name||norm)),
        proposal_count: Number(p.proposal_count||0),
        proposer_count: Number(p.proposer_count||0),
        votes_yes: Number(vm.votes_yes||0),
        votes_no: Number(vm.votes_no||0),
        vote_total: Number(vm.vote_total||0),
        total_votes: total,
        first_seen: p.first_seen,
        last_seen: p.last_seen,
        is_winner: total >= 3,
        status: total >= 3 ? "verified" : "pending",
        sample_school_id: (p as any).sample_school_id ?? schoolId ?? null,
      };
    });
    for (const [norm, vm] of Array.from(voteMap.entries())) {
      if (!merged.find((m:any)=> m.normalized===norm)) {
        merged.push({
          normalized: norm,
          display_name: displayFromNormalized(norm, norm),
          proposal_count: 0,
          proposer_count: 0,
          votes_yes: Number((vm as any).votes_yes||0),
          votes_no: Number((vm as any).votes_no||0),
          vote_total: Number((vm as any).vote_total||0),
          total_votes: Number((vm as any).vote_total||0),
          first_seen: null,
          last_seen: null,
          is_winner: Number((vm as any).vote_total||0) >=3,
          status: Number((vm as any).vote_total||0) >=3 ? "verified" : "pending",
          sample_school_id: schoolId ?? null,
        });
      }
    }
    merged.sort((a:any,b:any)=> Number(b.total_votes)-Number(a.total_votes));
    return merged;
  } catch {
    return [];
  }
}

async function promoteWinnersIfNeeded(sql: any): Promise<void> {
  try {
    const choices = await getAggregatedSchoolChoices(sql);
    const winners = choices.filter((c:any)=> c.is_winner);
    for (const w of winners) {
      try {
        // autopilot Nigeria→Ghana: when threshold reached, flip pending rows with that normalized to verified
        await sql`UPDATE physi_schools SET status='verified', canonical_name=${w.display_name} WHERE lower(name)=lower(${w.normalized}) AND status='pending'`;
        // also set canonical on verified rows
        await sql`UPDATE physi_schools SET canonical_name=${w.display_name} WHERE lower(name)=lower(${w.normalized}) AND canonical_name IS NULL`;
      } catch {}
    }
    // departments autopromote per school grouping
    const deptChoices = await getAggregatedDeptChoices(sql, null);
    for (const w of deptChoices.filter((c:any)=> c.is_winner)) {
      try { await sql`UPDATE physi_school_departments SET status='verified', canonical_name=${w.display_name} WHERE lower(name)=lower(${w.normalized}) AND status='pending'`; } catch {}
    }
  } catch {}
}

// ── Schools CRUD ──

async function handleSchools(req: Request): Promise<Response> {
  try {
    const sql = getSql();
    if (!isDbConfigured() || !sql) return NextResponse.json(dbNotConfigured(), { status: 503 });

    if (req.method === "POST") {
      try { await runVineMaintenance(sql); } catch (e) { logError("SCHOOLS_CREATE_FAILED", e, { route: "/api/schools", phase: "ensure" }); }
      const b = await req.json().catch(() => null);
      // Vine vote path: { action:"vote", normalized, vote:1|-1, voter_id } — increments vote table without duplicate school row
      if (b?.action === "vote" || b?.vote_for || b?.normalized) {
        const norm = normalize(String(b.normalized ?? b.vote_for ?? b.name ?? ""));
        if (!norm) return NextResponse.json({ ok: false, code: "BAD_INPUT", message: "normalized required" }, { status: 400 });
        const voterId = String(b.voter_id ?? b.verifier_id ?? "").trim() || null;
        const voteVal = Number(b.vote_value ?? b.vote ?? 1) >=0 ? 1 : -1;
        // allow anonymous vote if no voterId (counts as proposal signal), but store with null
        try {
          if (voterId) {
            await sql`
              INSERT INTO physi_school_votes (voter_id, normalized, vote_value)
              VALUES (${voterId}, ${norm}, ${voteVal})
              ON CONFLICT (voter_id, lower(normalized)) DO UPDATE SET vote_value=${voteVal}, created_at=NOW()`;
          } else {
            await sql`INSERT INTO physi_school_votes (normalized, vote_value) VALUES (${norm}, ${voteVal})`;
          }
        } catch (e) {
          // fallback without voter unique index
          try { await sql`INSERT INTO physi_school_votes (normalized, vote_value) VALUES (${norm}, ${voteVal})`; } catch {}
        }
        await promoteWinnersIfNeeded(sql);
        const choices = await getAggregatedSchoolChoices(sql);
        const hit = choices.find((c:any)=> c.normalized===norm) ?? null;
        return NextResponse.json({ ok: true, voted: true, normalized: norm, choice: hit, choices }, { status: 200 });
      }

      if (!b?.name) return NextResponse.json({ ok: false, code: "BAD_INPUT", message: getErrorMessage("BAD_INPUT") }, { status: 400 });

      const createdBy = (await requireCreator(sql, req)) ?? (b.created_by ?? null);
      const rawName = String(b.name).slice(0, 200).trim();
      if (!rawName) return NextResponse.json({ ok: false, code: "BAD_INPUT" }, { status: 400 });

      try {
        const r = await sql`
          INSERT INTO physi_schools (name, created_by, status)
          VALUES (${rawName}, ${createdBy}, 'pending')
          RETURNING *`;
        try {
          await sql`
            INSERT INTO physi_school_event_counts (school_id, event_count)
            VALUES (${r[0].id}, 0)
            ON CONFLICT (school_id) DO NOTHING`;
        } catch {}
        // auto crank vote aggregation & promotion
        await promoteWinnersIfNeeded(sql);
        const choices = await getAggregatedSchoolChoices(sql);
        return NextResponse.json({ ok: true, school: r[0], choices, normalized: normalize(rawName) }, { status: 201 });
      } catch (e: unknown) {
        logError("SCHOOLS_CREATE_FAILED", e, { route: "/api/schools", method: "POST" });
        return NextResponse.json({ ok: false, code: "SCHOOLS_CREATE_FAILED", message: getErrorMessage("SCHOOLS_CREATE_FAILED") }, { status: 500 });
      }
    }

    if (req.method === "GET") {
      try { await runVineMaintenance(sql); } catch (e) { logError("SCHOOLS_FETCH_FAILED", e, { route: "/api/schools", phase: "ensure" }); }
      const url = new URL(req.url);
      const id = url.searchParams.get("id");
      const name = url.searchParams.get("name");
      const status = url.searchParams.get("status");
      const aggregate = url.searchParams.get("aggregate") ?? url.searchParams.get("choices");
      const includeArchived = url.searchParams.get("include_archived");
      const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 200);
      const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10) || 0, 0);

      try {
        if (id) {
          const rows = await sql`SELECT * FROM physi_schools WHERE id = ${id} LIMIT 1`;
          if (!rows.length) return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
          return NextResponse.json({ ok: true, school: rows[0] });
        }
        if (name) {
          const rows = await sql`SELECT * FROM physi_schools WHERE lower(name) LIKE lower(${name}) LIMIT 1`;
          if (!rows.length) return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
          return NextResponse.json({ ok: true, school: rows[0] });
        }
        let rows: any[];
        if (status) {
          if (includeArchived) {
            rows = await sql`SELECT * FROM physi_schools WHERE status = ${status} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
          } else {
            try {
              rows = await sql`SELECT * FROM physi_schools WHERE status = ${status} AND archived_at IS NULL ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
            } catch {
              rows = await sql`SELECT * FROM physi_schools WHERE status = ${status} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
            }
          }
        } else {
          // default exclude archived unless asked
          try {
            rows = await sql`SELECT * FROM physi_schools WHERE archived_at IS NULL ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
          } catch {
            rows = await sql`SELECT * FROM physi_schools ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
          }
        }
        const schoolsWithDepts = await Promise.all(rows.map(async (s: any) => {
          try {
            const deptCount = await sql`SELECT COUNT(*)::int AS c FROM physi_school_departments WHERE school_id = ${s.id} AND archived_at IS NULL`;
            return { ...s, department_count: Number((deptCount[0] as any)?.c ?? 0) };
          } catch {
            try {
              const deptCount2 = await sql`SELECT COUNT(*)::int AS c FROM physi_school_departments WHERE school_id = ${s.id}`;
              return { ...s, department_count: Number((deptCount2[0] as any)?.c ?? 0) };
            } catch { return { ...s, department_count: 0 }; }
          }
        }));

        // ── Vine aggregation: always include choices + dropdown + archived map
        const choices = await getAggregatedSchoolChoices(sql);
        const dropdown_options = choices.filter((c:any)=> c.is_winner).map((c:any)=> ({ value: c.normalized, label: c.display_name, votes: c.total_votes }));
        // historical map: archived + recent extinct
        let archived: any[] = [];
        let historical_map: any[] = [];
        try { archived = await sql`SELECT id, name, archived_at, canonical_name FROM physi_schools WHERE archived_at IS NOT NULL ORDER BY archived_at DESC LIMIT 50` as any; } catch {}
        try { historical_map = await sql`SELECT * FROM physi_school_historical_map ORDER BY archived_at DESC LIMIT 50` as any; } catch {}
        // If aggregate param set, primary payload is choices; else include both for live dropdown
        const wantsAggregateOnly = aggregate === "1" || aggregate === "true";
        if (wantsAggregateOnly) {
          return NextResponse.json({ ok: true, choices, dropdown_options, archived, historical_map, count: choices.length });
        }
        return NextResponse.json({ ok: true, schools: schoolsWithDepts, count: schoolsWithDepts.length, choices, dropdown_options, archived, historical_map });
      } catch (e) {
        logError("SCHOOLS_FETCH_FAILED", e, { route: "/api/schools", method: "GET" });
        // graceful degraded: still return empty choices so frontend doesn't break
        return NextResponse.json({ ok: true, schools: [], choices: [], dropdown_options: [], archived: [], historical_map: [], count: 0 });
      }
    }

    if (req.method === "PATCH") {
      try { await runVineMaintenance(sql); } catch (e) { logError("SCHOOLS_UPDATE_FAILED", e, { route: "/api/schools", phase: "ensure" }); }
      const b = await req.json().catch(() => null);
      const schoolId = String(b?.id ?? b?.school_id ?? "").trim();
      if (!schoolId) return NextResponse.json({ ok: false, code: "BAD_INPUT" }, { status: 400 });

      const creatorUid = await requireCreator(sql, req);
      if (!creatorUid) return NextResponse.json({ ok: false, code: "UNAUTHORIZED", message: "Creator access required" }, { status: 401 });

      const school = await sql`SELECT * FROM physi_schools WHERE id = ${schoolId} LIMIT 1`;
      if (!school.length) return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
      const existing = school[0] as any;

      const newStatus = b?.status;
      if (newStatus && !["pending", "verified", "rejected"].includes(newStatus)) {
        return NextResponse.json({ ok: false, code: "BAD_INPUT", message: "status must be pending|verified|rejected" }, { status: 400 });
      }

      try {
        if (!newStatus) {
          return NextResponse.json({ ok: true, school: existing });
        }
        // Inverted-audit P0 (K-A6-ish): the old code built a dynamic
        // SET clause and interpolated it as sql[setClause] — a string the
        // driver never substitutes (vals[] was never even used), so every
        // PATCH threw. Explicit whitelisted UPDATEs per case instead.
        let r: any[];
        if (newStatus === "verified") {
          r = await sql`UPDATE physi_schools SET status=${newStatus}, verified_by=${creatorUid}, verified_at=NOW(), updated_at=NOW() WHERE id=${schoolId} RETURNING *` as any;
        } else if (newStatus === "rejected" && b?.rejection_reason) {
          r = await sql`UPDATE physi_schools SET status=${newStatus}, verified_by=${creatorUid}, verified_at=NOW(), rejection_reason=${String(b.rejection_reason).slice(0, 500)}, updated_at=NOW() WHERE id=${schoolId} RETURNING *` as any;
        } else if (newStatus === "rejected") {
          r = await sql`UPDATE physi_schools SET status=${newStatus}, verified_by=${creatorUid}, verified_at=NOW(), updated_at=NOW() WHERE id=${schoolId} RETURNING *` as any;
        } else {
          r = await sql`UPDATE physi_schools SET status=${newStatus}, updated_at=NOW() WHERE id=${schoolId} RETURNING *` as any;
        }

        const evtCount = await sql`SELECT COUNT(*)::int AS c FROM physi_events WHERE scope_value = ${existing.name} OR title ILIKE ${'%' + existing.name + '%'}`;
        const newCount = Number(evtCount[0]?.c ?? 0);
        if (newCount !== existing.event_count) {
          await sql`UPDATE physi_schools SET event_count = ${newCount}, last_event_at = NOW() WHERE id = ${schoolId}`;
          await sql`
            INSERT INTO physi_school_event_counts (school_id, event_count, last_updated)
            VALUES (${schoolId}, ${newCount}, NOW())
            ON CONFLICT (school_id) DO UPDATE SET event_count = ${newCount}, last_updated = NOW()`;
        }

        await promoteWinnersIfNeeded(sql);
        return NextResponse.json({ ok: true, school: r[0] });
      } catch (e) {
        logError("SCHOOLS_UPDATE_FAILED", e, { route: "/api/schools", method: "PATCH" });
        return NextResponse.json({ ok: false, code: "SCHOOLS_UPDATE_FAILED" }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: false, code: "METHOD_NOT_ALLOWED" }, { status: 405 });
  } catch (e) {
    logError("INTERNAL", e, { route: "/api/schools", method: req.method });
    return NextResponse.json({ ok: false, code: "INTERNAL" }, { status: 500 });
  }
}

// ── Departments CRUD ──

async function handleDepartments(req: Request): Promise<Response> {
  try {
    const sql = getSql();
    if (!isDbConfigured() || !sql) return NextResponse.json(dbNotConfigured(), { status: 503 });

    if (req.method === "POST") {
      try { await runVineMaintenance(sql); } catch (e) { logError("DEPTS_CREATE_FAILED", e, { route: "/api/schools/departments", phase: "ensure" }); }
      const b = await req.json().catch(() => null);
      // Dept vote path: free-text → vote on normalized dept name
      if (b?.action === "vote" || b?.vote_for || (b?.normalized && b?.vote_value !== undefined)) {
        const norm = normalize(String(b.normalized ?? b.vote_for ?? b.name ?? ""));
        const schoolId = String(b.school_id ?? b.schoolId ?? "").trim() || null;
        if (!norm) return NextResponse.json({ ok: false, code: "BAD_INPUT", message: "normalized required" }, { status: 400 });
        const voterId = String(b.voter_id ?? b.verifier_id ?? "").trim() || null;
        const voteVal = Number(b.vote_value ?? b.vote ?? 1) >=0 ? 1 : -1;
        try {
          if (voterId) {
            await sql`
              INSERT INTO physi_dept_votes (voter_id, normalized, school_id, vote_value)
              VALUES (${voterId}, ${norm}, ${schoolId}, ${voteVal})
              ON CONFLICT (voter_id, lower(normalized), COALESCE(school_id::text,'')) DO UPDATE SET vote_value=${voteVal}, created_at=NOW()`;
          } else {
            await sql`INSERT INTO physi_dept_votes (normalized, school_id, vote_value) VALUES (${norm}, ${schoolId}, ${voteVal})`;
          }
        } catch {
          try { await sql`INSERT INTO physi_dept_votes (normalized, school_id, vote_value) VALUES (${norm}, ${schoolId}, ${voteVal})`; } catch {}
        }
        await promoteWinnersIfNeeded(sql);
        const choices = await getAggregatedDeptChoices(sql, schoolId);
        const hit = choices.find((c:any)=> c.normalized===norm) ?? null;
        return NextResponse.json({ ok: true, voted: true, normalized: norm, choice: hit, choices }, { status: 200 });
      }

      const schoolId = String(b?.school_id ?? b?.schoolId ?? "").trim();
      if (!schoolId) return NextResponse.json({ ok: false, code: "BAD_INPUT", message: "school_id required" }, { status: 400 });
      if (!b?.name) return NextResponse.json({ ok: false, code: "BAD_INPUT", message: "name required" }, { status: 400 });

      const school = await sql`SELECT id, status FROM physi_schools WHERE id = ${schoolId} LIMIT 1`;
      if (!school.length) return NextResponse.json({ ok: false, code: "NOT_FOUND", message: "School not found" }, { status: 404 });

      const createdBy = (await requireCreator(sql, req)) ?? (b.created_by ?? null);
      const years = Math.max(1, Math.min(10, parseInt(b?.years ?? "4", 10) || 4));

      try {
        const rawDept = String(b.name).slice(0, 200).trim();
        const r = await sql`
          INSERT INTO physi_school_departments (school_id, name, years, created_by, status)
          VALUES (${schoolId}, ${rawDept}, ${years}, ${createdBy}, 'pending')
          RETURNING *`;

        // School-level bootstrap row (PK is school_id — per-dept breakdown is
        // NOT tracked here; counts roll up per school in the PATCH upsert).
        // Inverted-audit P0 (K-A7): the arbiter matches the PK, so this is a
        // true no-op when the row exists — never a silent drop.
        try {
          await sql`
            INSERT INTO physi_school_event_counts (school_id, dept_id, event_count)
            VALUES (${schoolId}, ${r[0].id}, 0)
            ON CONFLICT (school_id) DO NOTHING`;
        } catch {}

        await promoteWinnersIfNeeded(sql);
        const choices = await getAggregatedDeptChoices(sql, schoolId);
        return NextResponse.json({ ok: true, department: r[0], choices, normalized: normalize(rawDept) }, { status: 201 });
      } catch (e: unknown) {
        logError("DEPTS_CREATE_FAILED", e, { route: "/api/schools/departments", method: "POST" });
        return NextResponse.json({ ok: false, code: "DEPTS_CREATE_FAILED", message: getErrorMessage("DEPTS_CREATE_FAILED") }, { status: 500 });
      }
    }

    if (req.method === "GET") {
      try { await runVineMaintenance(sql); } catch (e) { logError("DEPTS_FETCH_FAILED", e, { route: "/api/schools/departments", phase: "ensure" }); }
      const url = new URL(req.url);
      const schoolId = url.searchParams.get("school_id");
      const id = url.searchParams.get("id");
      const aggregate = url.searchParams.get("aggregate") ?? url.searchParams.get("choices");

      try {
        if (id) {
          const rows = await sql`SELECT * FROM physi_school_departments WHERE id = ${id} LIMIT 1`;
          if (!rows.length) return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
          return NextResponse.json({ ok: true, department: rows[0] });
        }
        if (schoolId) {
          const rows = await sql`SELECT * FROM physi_school_departments WHERE school_id = ${schoolId} AND archived_at IS NULL ORDER BY created_at DESC`;
          const choices = await getAggregatedDeptChoices(sql, schoolId);
          const dropdown_options = choices.filter((c:any)=> c.is_winner).map((c:any)=> ({ value: c.normalized, label: c.display_name, votes: c.total_votes }));
          let archived: any[] = []; try { archived = await sql`SELECT id, name, archived_at FROM physi_school_departments WHERE school_id=${schoolId} AND archived_at IS NOT NULL ORDER BY archived_at DESC LIMIT 50` as any; } catch {}
          if (aggregate === "1" || aggregate==="true") return NextResponse.json({ ok: true, choices, dropdown_options, archived, count: choices.length });
          return NextResponse.json({ ok: true, departments: rows, count: rows.length, choices, dropdown_options, archived });
        }
        const rows = await sql`SELECT * FROM physi_school_departments WHERE archived_at IS NULL ORDER BY created_at DESC LIMIT 100`;
        const choices = await getAggregatedDeptChoices(sql, null);
        const dropdown_options = choices.filter((c:any)=> c.is_winner).map((c:any)=> ({ value: c.normalized, label: c.display_name, votes: c.total_votes }));
        let archived: any[] = []; try { archived = await sql`SELECT id, name, school_id, archived_at FROM physi_school_departments WHERE archived_at IS NOT NULL ORDER BY archived_at DESC LIMIT 50` as any; } catch {}
        let historical_map: any[] = []; try { historical_map = await sql`SELECT * FROM physi_school_historical_map WHERE kind='department' ORDER BY archived_at DESC LIMIT 50` as any; } catch {}
        if (aggregate === "1" || aggregate==="true") return NextResponse.json({ ok: true, choices, dropdown_options, archived, historical_map, count: choices.length });
        return NextResponse.json({ ok: true, departments: rows, count: rows.length, choices, dropdown_options, archived, historical_map });
      } catch (e) {
        logError("DEPTS_FETCH_FAILED", e, { route: "/api/schools/departments", method: "GET" });
        return NextResponse.json({ ok: true, departments: [], choices: [], dropdown_options: [], count: 0 });
      }
    }

    if (req.method === "PATCH") {
      try { await runVineMaintenance(sql); } catch (e) { logError("DEPTS_UPDATE_FAILED", e, { route: "/api/schools/departments", phase: "ensure" }); }
      const b = await req.json().catch(() => null);
      const deptId = String(b?.id ?? b?.department_id ?? "").trim();
      if (!deptId) return NextResponse.json({ ok: false, code: "BAD_INPUT" }, { status: 400 });

      const creatorUid = await requireCreator(sql, req);
      if (!creatorUid) return NextResponse.json({ ok: false, code: "UNAUTHORIZED", message: "Creator access required" }, { status: 401 });

      const dept = await sql`SELECT * FROM physi_school_departments WHERE id = ${deptId} LIMIT 1`;
      if (!dept.length) return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
      const existing = dept[0] as any;

      const newStatus = b?.status;
      if (newStatus && !["pending", "verified", "rejected"].includes(newStatus)) {
        return NextResponse.json({ ok: false, code: "BAD_INPUT", message: "status must be pending|verified|rejected" }, { status: 400 });
      }

      try {
        const years = b?.years && !isNaN(Number(b.years)) ? Math.max(1, Math.min(10, Number(b.years))) : null;
        if (!newStatus && years === null) {
          return NextResponse.json({ ok: true, department: existing });
        }
        // Inverted-audit P0: explicit whitelisted UPDATEs (see schools PATCH).
        let r: any[];
        if (newStatus === "verified") {
          r = years === null
            ? await sql`UPDATE physi_school_departments SET status=${newStatus}, verified_by=${creatorUid}, verified_at=NOW(), updated_at=NOW() WHERE id=${deptId} RETURNING *` as any
            : await sql`UPDATE physi_school_departments SET status=${newStatus}, verified_by=${creatorUid}, verified_at=NOW(), years=${years}, updated_at=NOW() WHERE id=${deptId} RETURNING *` as any;
        } else if (newStatus === "rejected" && b?.rejection_reason) {
          r = years === null
            ? await sql`UPDATE physi_school_departments SET status=${newStatus}, verified_by=${creatorUid}, verified_at=NOW(), rejection_reason=${String(b.rejection_reason).slice(0, 500)}, updated_at=NOW() WHERE id=${deptId} RETURNING *` as any
            : await sql`UPDATE physi_school_departments SET status=${newStatus}, verified_by=${creatorUid}, verified_at=NOW(), rejection_reason=${String(b.rejection_reason).slice(0, 500)}, years=${years}, updated_at=NOW() WHERE id=${deptId} RETURNING *` as any;
        } else if (newStatus === "rejected") {
          r = years === null
            ? await sql`UPDATE physi_school_departments SET status=${newStatus}, verified_by=${creatorUid}, verified_at=NOW(), updated_at=NOW() WHERE id=${deptId} RETURNING *` as any
            : await sql`UPDATE physi_school_departments SET status=${newStatus}, verified_by=${creatorUid}, verified_at=NOW(), years=${years}, updated_at=NOW() WHERE id=${deptId} RETURNING *` as any;
        } else if (newStatus) {
          r = years === null
            ? await sql`UPDATE physi_school_departments SET status=${newStatus}, updated_at=NOW() WHERE id=${deptId} RETURNING *` as any
            : await sql`UPDATE physi_school_departments SET status=${newStatus}, years=${years}, updated_at=NOW() WHERE id=${deptId} RETURNING *` as any;
        } else {
          r = await sql`UPDATE physi_school_departments SET years=${years}, updated_at=NOW() WHERE id=${deptId} RETURNING *` as any;
        }

        return NextResponse.json({ ok: true, department: r[0] });
      } catch (e) {
        logError("DEPTS_UPDATE_FAILED", e, { route: "/api/schools/departments", method: "PATCH" });
        return NextResponse.json({ ok: false, code: "DEPTS_UPDATE_FAILED" }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: false, code: "METHOD_NOT_ALLOWED" }, { status: 405 });
  } catch (e) {
    logError("INTERNAL", e, { route: "/api/schools/departments", method: req.method });
    return NextResponse.json({ ok: false, code: "INTERNAL" }, { status: 500 });
  }
}

// ── Disputes ──

async function handleDisputes(req: Request): Promise<Response> {
  try {
    const sql = getSql();
    if (!isDbConfigured() || !sql) return NextResponse.json(dbNotConfigured(), { status: 503 });

    if (req.method === "POST") {
      try { await runVineMaintenance(sql); } catch (e) { logError("DISPUTES_CREATE_FAILED", e, { route: "/api/schools/disputes", phase: "ensure" }); }
      const b = await req.json().catch(() => null);
      const schoolA = String(b?.school_id_a ?? b?.schoolA ?? "").trim();
      const schoolB = String(b?.school_id_b ?? b?.schoolB ?? "").trim();

      if (!schoolA || !schoolB) {
        return NextResponse.json({ ok: false, code: "BAD_INPUT", message: "school_id_a and school_id_b required" }, { status: 400 });
      }

      const [sA, sB] = await Promise.all([
        sql`SELECT id, name FROM physi_schools WHERE id = ${schoolA} LIMIT 1`,
        sql`SELECT id, name FROM physi_schools WHERE id = ${schoolB} LIMIT 1`,
      ]);
      if (!sA.length || !sB.length) {
        return NextResponse.json({ ok: false, code: "NOT_FOUND", message: "One or both schools not found" }, { status: 404 });
      }

      let disputeType: string = "same_school";
      const deptA = String(b?.dept_id_a ?? "").trim();
      const deptB = String(b?.dept_id_b ?? "").trim();
      if (deptA && deptB) {
        disputeType = "department_name";
      } else if (sA[0].name.toLowerCase() === sB[0].name.toLowerCase()) {
        disputeType = "school_name";
      }

      const existing = await sql`
        SELECT id FROM physi_school_disputes
        WHERE (school_id_a = ${schoolA} AND school_id_b = ${schoolB})
           OR (school_id_a = ${schoolB} AND school_id_b = ${schoolA})
        LIMIT 1`;
      if (existing.length) {
        return NextResponse.json({ ok: true, dispute_id: existing[0].id, note: "Dispute already exists" });
      }

      try {
        const r = await sql`
          INSERT INTO physi_school_disputes (school_id_a, school_id_b, dept_id_a, dept_id_b, dispute_type, status)
          VALUES (${schoolA}, ${schoolB}, ${deptA || null}, ${deptB || null}, ${disputeType}, 'active')
          RETURNING *`;

        return NextResponse.json({ ok: true, dispute: r[0] }, { status: 201 });
      } catch (e) {
        logError("DISPUTES_CREATE_FAILED", e, { route: "/api/schools/disputes", method: "POST" });
        return NextResponse.json({ ok: false, code: "DISPUTES_CREATE_FAILED" }, { status: 500 });
      }
    }

    if (req.method === "GET") {
      try { await runVineMaintenance(sql); } catch (e) { logError("DISPUTES_FETCH_FAILED", e, { route: "/api/schools/disputes", phase: "ensure" }); }
      const url = new URL(req.url);
      const status = url.searchParams.get("status");
      const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 200);

      try {
        if (status) {
          const rows = await sql`SELECT * FROM physi_school_disputes WHERE status = ${status} ORDER BY created_at DESC LIMIT ${limit}`;
          return NextResponse.json({ ok: true, disputes: rows, count: rows.length });
        }
        const rows = await sql`SELECT * FROM physi_school_disputes ORDER BY created_at DESC LIMIT ${limit}`;
        const enriched = await Promise.all(rows.map(async (d: any) => {
          const [sA, sB] = await Promise.all([
            sql`SELECT id, name, status FROM physi_schools WHERE id = ${d.school_id_a} LIMIT 1`,
            sql`SELECT id, name, status FROM physi_schools WHERE id = ${d.school_id_b} LIMIT 1`,
          ]);
          return {
            ...d,
            school_a: sA[0] ? { id: sA[0].id, name: sA[0].name, status: sA[0].status } : null,
            school_b: sB[0] ? { id: sB[0].id, name: sB[0].name, status: sB[0].status } : null,
          };
        }));
        return NextResponse.json({ ok: true, disputes: enriched, count: enriched.length });
      } catch (e) {
        logError("DISPUTES_FETCH_FAILED", e, { route: "/api/schools/disputes", method: "GET" });
        return NextResponse.json({ ok: false, code: "DISPUTES_FETCH_FAILED" }, { status: 500 });
      }
    }

    if (req.method === "PATCH") {
      try { await runVineMaintenance(sql); } catch (e) { logError("DISPUTES_RESOLVE_FAILED", e, { route: "/api/schools/disputes", phase: "ensure" }); }
      const b = await req.json().catch(() => null);
      const disputeId = String(b?.id ?? b?.dispute_id ?? "").trim();
      if (!disputeId) return NextResponse.json({ ok: false, code: "BAD_INPUT" }, { status: 400 });

      const creatorUid = await requireCreator(sql, req);
      if (!creatorUid) return NextResponse.json({ ok: false, code: "UNAUTHORIZED", message: "Creator access required" }, { status: 401 });

      const dispute = await sql`SELECT * FROM physi_school_disputes WHERE id = ${disputeId} LIMIT 1`;
      if (!dispute.length) return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
      const existing = dispute[0] as any;

      const newStatus = b?.status;
      const validStatuses = ["resolved_a_wins", "resolved_b_wins", "expired", "creator_decided"];
      if (newStatus && !validStatuses.includes(newStatus)) {
        return NextResponse.json({ ok: false, code: "BAD_INPUT", message: "status must be: " + validStatuses.join("|") }, { status: 400 });
      }

      if (!newStatus) {
        return NextResponse.json({ ok: false, code: "BAD_INPUT", message: "status required to resolve dispute" }, { status: 400 });
      }

      const sA = await sql`SELECT id, name FROM physi_schools WHERE id = ${existing.school_id_a} LIMIT 1`;
      const sB = await sql`SELECT id, name FROM physi_schools WHERE id = ${existing.school_id_b} LIMIT 1`;

      try {
        // Inverted-audit P0: explicit whitelisted UPDATE (see schools PATCH).
        let r: any[];
        if (b?.resolution_notes) {
          r = await sql`UPDATE physi_school_disputes SET status=${newStatus}, resolved_at=NOW(), resolved_by=${creatorUid}, resolution_notes=${String(b.resolution_notes).slice(0, 1000)} WHERE id=${disputeId} RETURNING *` as any;
        } else {
          r = await sql`UPDATE physi_school_disputes SET status=${newStatus}, resolved_at=NOW(), resolved_by=${creatorUid} WHERE id=${disputeId} RETURNING *` as any;
        }

        // Burn loser's coins
        let totalBurn = 0;
        let creatorFee = 0;
        let winnerGets = 0;
        let burnedAmount = 0;

        if (newStatus === "resolved_a_wins" || newStatus === "resolved_b_wins") {
          const loserSchoolId = (newStatus === "resolved_a_wins") ? existing.school_id_b : existing.school_id_a;
          const loserDepts = await sql`SELECT id, event_count FROM physi_school_departments WHERE school_id = ${loserSchoolId}`;
          for (const d of loserDepts as any[]) {
            totalBurn += Number(d.event_count) * 10;
          }
          if (totalBurn > 0) {
            creatorFee = totalBurn * 0.05;
            winnerGets = totalBurn * 0.70;
            burnedAmount = totalBurn * 0.30;

            await sql`
              INSERT INTO physi_coins_burned (dispute_id, loser_school_id, loser_dept_id, amount_burned, creator_fee, winner_gets, burned_by)
              VALUES (${disputeId}, ${loserSchoolId}, NULL, ${burnedAmount}, ${creatorFee}, ${winnerGets}, ${creatorUid})`;

            await sql`UPDATE physi_schools SET status = 'rejected' WHERE id = ${loserSchoolId}`;
          }
        }

        return NextResponse.json({ ok: true, dispute: r[0], burned: totalBurn > 0 ? { amount: totalBurn, fee: creatorFee, winner: winnerGets, burned: burnedAmount } : null });
      } catch (e) {
        logError("DISPUTES_RESOLVE_FAILED", e, { route: "/api/schools/disputes", method: "PATCH" });
        return NextResponse.json({ ok: false, code: "DISPUTES_RESOLVE_FAILED" }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: false, code: "METHOD_NOT_ALLOWED" }, { status: 405 });
  } catch (e) {
    logError("INTERNAL", e, { route: "/api/schools/disputes", method: req.method });
    return NextResponse.json({ ok: false, code: "INTERNAL" }, { status: 500 });
  }
}

// ── Vine dedicated vote handlers (additive, separate routes for explicit voting) ──

async function handleSchoolVotes(req: Request): Promise<Response> {
  try {
    const sql = getSql();
    if (!isDbConfigured() || !sql) return NextResponse.json(dbNotConfigured(), { status: 503 });
    try { await runVineMaintenance(sql); } catch {}
    const url = new URL(req.url);
    if (req.method === "GET") {
      const normalized = url.searchParams.get("normalized") ?? url.searchParams.get("name");
      if (normalized) {
        const choices = await getAggregatedSchoolChoices(sql);
        const hit = choices.find((c:any)=> c.normalized===normalize(normalized));
        if (!hit) return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
        return NextResponse.json({ ok: true, choice: hit });
      }
      const choices = await getAggregatedSchoolChoices(sql);
      return NextResponse.json({ ok: true, choices, dropdown_options: choices.filter((c:any)=>c.is_winner).map((c:any)=>({value:c.normalized,label:c.display_name,votes:c.total_votes})) });
    }
    if (req.method === "POST") {
      const b = await req.json().catch(()=>null);
      const norm = normalize(String(b?.normalized ?? b?.name ?? b?.vote_for ?? ""));
      if (!norm) return NextResponse.json({ ok:false, code:"BAD_INPUT", message:"normalized required"},{status:400});
      const voterId = String(b?.voter_id ?? b?.verifier_id ?? "").trim() || null;
      const voteVal = Number(b?.vote_value ?? b?.vote ?? 1) >=0 ? 1 : -1;
      try {
        if (voterId) {
          await sql`INSERT INTO physi_school_votes (voter_id, normalized, vote_value) VALUES (${voterId}, ${norm}, ${voteVal}) ON CONFLICT (voter_id, lower(normalized)) DO UPDATE SET vote_value=${voteVal}, created_at=NOW()`;
        } else {
          await sql`INSERT INTO physi_school_votes (normalized, vote_value) VALUES (${norm}, ${voteVal})`;
        }
      } catch { try { await sql`INSERT INTO physi_school_votes (normalized, vote_value) VALUES (${norm}, ${voteVal})`; } catch {} }
      await promoteWinnersIfNeeded(sql);
      const choices = await getAggregatedSchoolChoices(sql);
      return NextResponse.json({ ok: true, voted: true, normalized: norm, choice: choices.find((c:any)=>c.normalized===norm)??null, choices });
    }
    return NextResponse.json({ ok:false, code:"METHOD_NOT_ALLOWED"},{status:405});
  } catch (e) { logError("INTERNAL", e, { route:"/api/schools/votes", method:req.method }); return NextResponse.json({ ok:false, code:"INTERNAL"},{status:500}); }
}

async function handleDeptVotes(req: Request): Promise<Response> {
  try {
    const sql = getSql();
    if (!isDbConfigured() || !sql) return NextResponse.json(dbNotConfigured(), { status: 503 });
    try { await runVineMaintenance(sql); } catch {}
    const url = new URL(req.url);
    if (req.method === "GET") {
      const schoolId = url.searchParams.get("school_id");
      const choices = await getAggregatedDeptChoices(sql, schoolId);
      return NextResponse.json({ ok: true, choices, dropdown_options: choices.filter((c:any)=>c.is_winner).map((c:any)=>({value:c.normalized,label:c.display_name,votes:c.total_votes})) });
    }
    if (req.method === "POST") {
      const b = await req.json().catch(()=>null);
      const norm = normalize(String(b?.normalized ?? b?.name ?? b?.vote_for ?? ""));
      const schoolId = String(b?.school_id ?? "").trim() || null;
      if (!norm) return NextResponse.json({ ok:false, code:"BAD_INPUT"},{status:400});
      const voterId = String(b?.voter_id ?? "").trim() || null;
      const voteVal = Number(b?.vote_value ?? b?.vote ?? 1) >=0 ? 1 : -1;
      try {
        if (voterId) {
          await sql`INSERT INTO physi_dept_votes (voter_id, normalized, school_id, vote_value) VALUES (${voterId}, ${norm}, ${schoolId}, ${voteVal}) ON CONFLICT (voter_id, lower(normalized), COALESCE(school_id::text,'')) DO UPDATE SET vote_value=${voteVal}, created_at=NOW()`;
        } else {
          await sql`INSERT INTO physi_dept_votes (normalized, school_id, vote_value) VALUES (${norm}, ${schoolId}, ${voteVal})`;
        }
      } catch { try { await sql`INSERT INTO physi_dept_votes (normalized, school_id, vote_value) VALUES (${norm}, ${schoolId}, ${voteVal})`; } catch {} }
      await promoteWinnersIfNeeded(sql);
      const choices = await getAggregatedDeptChoices(sql, schoolId);
      return NextResponse.json({ ok: true, voted: true, normalized: norm, choice: choices.find((c:any)=>c.normalized===norm)??null, choices });
    }
    return NextResponse.json({ ok:false, code:"METHOD_NOT_ALLOWED"},{status:405});
  } catch (e) { logError("INTERNAL", e, { route:"/api/schools/dept-votes", method:req.method }); return NextResponse.json({ ok:false, code:"INTERNAL"},{status:500}); }
}

// ── Register API adapters ──

registerApiAdapter({
  id: "schools",
  route: "/api/schools",
  label: "Schools API",
  handle: handleSchools,
});

registerApiAdapter({
  id: "school-departments",
  route: "/api/schools/departments",
  label: "Departments API",
  handle: handleDepartments,
});

registerApiAdapter({
  id: "school-disputes",
  route: "/api/schools/disputes",
  label: "Disputes API",
  handle: handleDisputes,
});

registerApiAdapter({
  id: "school-votes",
  route: "/api/schools/votes",
  label: "School Votes API (vine lower() aggregation)",
  handle: handleSchoolVotes,
});

registerApiAdapter({
  id: "dept-votes",
  route: "/api/schools/dept-votes",
  label: "Dept Votes API (vine lower() aggregation)",
  handle: handleDeptVotes,
});
