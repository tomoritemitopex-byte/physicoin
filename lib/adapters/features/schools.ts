/**
 * lib/adapters/features/schools.ts — Schools + Departments Feature + API Adapter
 *
 * Student-created schools, creator-verified.
 * Departments with years. Disputes + coin burning.
 */
import { NextResponse } from "next/server";
import { getSql, isDbConfigured, dbNotConfigured, ensureAllTables } from "@/lib/db";
import { registerApiAdapter } from "../api";
import { registerFeature } from "../features";
import { logError, getErrorMessage } from "../error";

export const schoolsFeature = {
  id: "schools",
  label: "Schools",
  apiRoute: "/api/schools",
  description: "Student-created schools + departments, creator-verified",
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

// ── Schools CRUD ──

async function handleSchools(req: Request): Promise<Response> {
  try {
    const sql = getSql();
    if (!isDbConfigured() || !sql) return NextResponse.json(dbNotConfigured(), { status: 503 });

    if (req.method === "POST") {
      try { await ensureAllTables(); } catch (e) { logError("SCHOOLS_CREATE_FAILED", e, { route: "/api/schools", phase: "ensure" }); }
      const b = await req.json().catch(() => null);
      if (!b?.name) return NextResponse.json({ ok: false, code: "BAD_INPUT", message: getErrorMessage("BAD_INPUT") }, { status: 400 });

      const createdBy = (await requireCreator(sql, req)) ?? (b.created_by ?? null);

      try {
        const r = await sql`
          INSERT INTO physi_schools (name, created_by, status)
          VALUES (${String(b.name).slice(0, 200)}, ${createdBy}, 'pending')
          RETURNING *`;
        try {
          await sql`
            INSERT INTO physi_school_event_counts (school_id, event_count)
            VALUES (${r[0].id}, 0)
            ON CONFLICT (school_id) DO NOTHING`;
        } catch {}
        return NextResponse.json({ ok: true, school: r[0] }, { status: 201 });
      } catch (e: unknown) {
        const msg = String((e as Error).message);
        logError("SCHOOLS_CREATE_FAILED", e, { route: "/api/schools", method: "POST" });
        return NextResponse.json({ ok: false, code: "SCHOOLS_CREATE_FAILED", message: getErrorMessage("SCHOOLS_CREATE_FAILED") }, { status: 500 });
      }
    }

    if (req.method === "GET") {
      try { await ensureAllTables(); } catch (e) { logError("SCHOOLS_FETCH_FAILED", e, { route: "/api/schools", phase: "ensure" }); }
      const url = new URL(req.url);
      const id = url.searchParams.get("id");
      const name = url.searchParams.get("name");
      const status = url.searchParams.get("status");
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
          rows = await sql`SELECT * FROM physi_schools WHERE status = ${status} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
        } else {
          rows = await sql`SELECT * FROM physi_schools ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
        }
        const schoolsWithDepts = await Promise.all(rows.map(async (s: any) => {
          const deptCount = await sql`SELECT COUNT(*)::int AS c FROM physi_school_departments WHERE school_id = ${s.id}`;
          return { ...s, department_count: Number(deptCount[0]?.c ?? 0) };
        }));
        return NextResponse.json({ ok: true, schools: schoolsWithDepts, count: schoolsWithDepts.length });
      } catch (e) {
        logError("SCHOOLS_FETCH_FAILED", e, { route: "/api/schools", method: "GET" });
        return NextResponse.json({ ok: false, code: "SCHOOLS_FETCH_FAILED" }, { status: 500 });
      }
    }

    if (req.method === "PATCH") {
      try { await ensureAllTables(); } catch (e) { logError("SCHOOLS_UPDATE_FAILED", e, { route: "/api/schools", phase: "ensure" }); }
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
        const updates: string[] = [];
        const vals: any[] = [];

        if (newStatus) {
          updates.push("status = $" + (updates.length + 1));
          vals.push(newStatus);
          if (newStatus === "verified") {
            updates.push("verified_by = $" + (updates.length + 1));
            vals.push(creatorUid);
            updates.push("verified_at = NOW()");
          }
          if (newStatus === "rejected") {
            updates.push("verified_by = $" + (updates.length + 1));
            vals.push(creatorUid);
            updates.push("verified_at = NOW()");
            if (b?.rejection_reason) {
              updates.push("rejection_reason = $" + (updates.length + 1));
              vals.push(String(b.rejection_reason).slice(0, 500));
            }
          }
        }

        if (updates.length === 0) {
          return NextResponse.json({ ok: true, school: existing });
        }

        updates.push("updated_at = NOW()");
        const setClause = updates.join(", ");
        const r = await sql`
          UPDATE physi_schools SET ${sql[setClause]} WHERE id = ${schoolId}
          RETURNING *`;

        const evtCount = await sql`SELECT COUNT(*)::int AS c FROM physi_events WHERE scope_value = ${existing.name} OR title ILIKE ${'%' + existing.name + '%'}`;
        const newCount = Number(evtCount[0]?.c ?? 0);
        if (newCount !== existing.event_count) {
          await sql`UPDATE physi_schools SET event_count = ${newCount} WHERE id = ${schoolId}`;
          await sql`
            INSERT INTO physi_school_event_counts (school_id, event_count, last_updated)
            VALUES (${schoolId}, ${newCount}, NOW())
            ON CONFLICT (school_id) DO UPDATE SET event_count = ${newCount}, last_updated = NOW()`;
        }

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
      try { await ensureAllTables(); } catch (e) { logError("DEPTS_CREATE_FAILED", e, { route: "/api/schools/departments", phase: "ensure" }); }
      const b = await req.json().catch(() => null);
      const schoolId = String(b?.school_id ?? b?.schoolId ?? "").trim();
      if (!schoolId) return NextResponse.json({ ok: false, code: "BAD_INPUT", message: "school_id required" }, { status: 400 });
      if (!b?.name) return NextResponse.json({ ok: false, code: "BAD_INPUT", message: "name required" }, { status: 400 });

      const school = await sql`SELECT id, status FROM physi_schools WHERE id = ${schoolId} LIMIT 1`;
      if (!school.length) return NextResponse.json({ ok: false, code: "NOT_FOUND", message: "School not found" }, { status: 404 });

      const createdBy = (await requireCreator(sql, req)) ?? (b.created_by ?? null);
      const years = Math.max(1, Math.min(10, parseInt(b?.years ?? "4", 10) || 4));

      try {
        const r = await sql`
          INSERT INTO physi_school_departments (school_id, name, years, created_by, status)
          VALUES (${schoolId}, ${String(b.name).slice(0, 200)}, ${years}, ${createdBy}, 'pending')
          RETURNING *`;

        try {
          await sql`
            INSERT INTO physi_school_event_counts (school_id, dept_id, event_count)
            VALUES (${schoolId}, ${r[0].id}, 0)
            ON CONFLICT (school_id) DO NOTHING`;
        } catch {}

        return NextResponse.json({ ok: true, department: r[0] }, { status: 201 });
      } catch (e: unknown) {
        const msg = String((e as Error).message);
        logError("DEPTS_CREATE_FAILED", e, { route: "/api/schools/departments", method: "POST" });
        return NextResponse.json({ ok: false, code: "DEPTS_CREATE_FAILED", message: getErrorMessage("DEPTS_CREATE_FAILED") }, { status: 500 });
      }
    }

    if (req.method === "GET") {
      try { await ensureAllTables(); } catch (e) { logError("DEPTS_FETCH_FAILED", e, { route: "/api/schools/departments", phase: "ensure" }); }
      const url = new URL(req.url);
      const schoolId = url.searchParams.get("school_id");
      const id = url.searchParams.get("id");

      try {
        if (id) {
          const rows = await sql`SELECT * FROM physi_school_departments WHERE id = ${id} LIMIT 1`;
          if (!rows.length) return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
          return NextResponse.json({ ok: true, department: rows[0] });
        }
        if (schoolId) {
          const rows = await sql`SELECT * FROM physi_school_departments WHERE school_id = ${schoolId} ORDER BY created_at DESC`;
          return NextResponse.json({ ok: true, departments: rows, count: rows.length });
        }
        const rows = await sql`SELECT * FROM physi_school_departments ORDER BY created_at DESC LIMIT 100`;
        return NextResponse.json({ ok: true, departments: rows, count: rows.length });
      } catch (e) {
        logError("DEPTS_FETCH_FAILED", e, { route: "/api/schools/departments", method: "GET" });
        return NextResponse.json({ ok: false, code: "DEPTS_FETCH_FAILED" }, { status: 500 });
      }
    }

    if (req.method === "PATCH") {
      try { await ensureAllTables(); } catch (e) { logError("DEPTS_UPDATE_FAILED", e, { route: "/api/schools/departments", phase: "ensure" }); }
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
        const updates: string[] = [];
        const vals: any[] = [];

        if (newStatus) {
          updates.push("status = $" + (updates.length + 1));
          vals.push(newStatus);
          if (newStatus === "verified") {
            updates.push("verified_by = $" + (updates.length + 1));
            vals.push(creatorUid);
            updates.push("verified_at = NOW()");
          }
          if (newStatus === "rejected") {
            updates.push("verified_by = $" + (updates.length + 1));
            vals.push(creatorUid);
            updates.push("verified_at = NOW()");
            if (b?.rejection_reason) {
              updates.push("rejection_reason = $" + (updates.length + 1));
              vals.push(String(b.rejection_reason).slice(0, 500));
            }
          }
        }

        if (b?.years && !isNaN(Number(b.years))) {
          const y = Math.max(1, Math.min(10, Number(b.years)));
          updates.push("years = $" + (updates.length + 1));
          vals.push(y);
        }

        if (updates.length === 0) {
          return NextResponse.json({ ok: true, department: existing });
        }

        updates.push("updated_at = NOW()");
        const setClause = updates.join(", ");
        const r = await sql`
          UPDATE physi_school_departments SET ${sql[setClause]} WHERE id = ${deptId}
          RETURNING *`;

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
      try { await ensureAllTables(); } catch (e) { logError("DISPUTES_CREATE_FAILED", e, { route: "/api/schools/disputes", phase: "ensure" }); }
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
      try { await ensureAllTables(); } catch (e) { logError("DISPUTES_FETCH_FAILED", e, { route: "/api/schools/disputes", phase: "ensure" }); }
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
      try { await ensureAllTables(); } catch (e) { logError("DISPUTES_RESOLVE_FAILED", e, { route: "/api/schools/disputes", phase: "ensure" }); }
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
        const updates: string[] = [];
        const vals: any[] = [];
        updates.push("status = $" + (updates.length + 1));
        vals.push(newStatus);
        updates.push("resolved_at = NOW()");
        updates.push("resolved_by = $" + (updates.length + 1));
        vals.push(creatorUid);
        if (b?.resolution_notes) {
          updates.push("resolution_notes = $" + (updates.length + 1));
          vals.push(String(b.resolution_notes).slice(0, 1000));
        }

        const setClause = updates.join(", ");
        const r = await sql`
          UPDATE physi_school_disputes SET ${sql[setClause]} WHERE id = ${disputeId}
          RETURNING *`;

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
