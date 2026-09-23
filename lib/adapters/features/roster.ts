/**
 * lib/adapters/features/roster.ts — Class Roster Feature + Api Adapter
 *
 * BEDROCK Phase 1: invite-code bounded participation. A roster = one class +
 * term. Rotation = new invite_code on the same roster (kills all leaks at
 * once). Events carry nullable roster_id; votes/posts on roster-linked events
 * require membership. Legacy open events (roster_id NULL) keep working.
 */
import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getSql, isDbConfigured, dbNotConfigured } from "@/lib/db";
import { registerApiAdapter } from "../api";
import { registerFeature } from "../features";
import { logError, getErrorMessage, isMissingTable } from "../error";

export const rosterFeature = {
  id: "roster",
  label: "Class Roster",
  nav: { href: "/app/timetable", label: "Roster", short: "Rs" },
  apiRoute: "/api/roster",
  description: "Invite-code class rosters — bounded participation for votes",
};

registerFeature(rosterFeature);

function newInviteCode(): string {
  return randomBytes(4).toString("hex").toUpperCase();
}

/** Shared membership check for timetable/verify gating. */
export async function isRosterMember(sql: any, rosterId: string, userId: string): Promise<boolean> {
  try {
    const rows = await sql`SELECT 1 FROM physi_roster_members WHERE roster_id=${rosterId} AND user_id=${userId} LIMIT 1` as any[];
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function handleRoster(req: Request): Promise<Response> {
  try {
    const sql = getSql();
    if (!isDbConfigured() || !sql) return NextResponse.json(dbNotConfigured(), { status: 503 });

    if (req.method === "GET") {
      const url = new URL(req.url);
      const rosterId = url.searchParams.get("roster_id");
      const userId = url.searchParams.get("user_id");
      try {
        if (rosterId) {
          const r = await sql`SELECT id, class_code, term, created_at FROM physi_rosters WHERE id=${rosterId} LIMIT 1`;
          if (!r.length) return NextResponse.json({ ok: false, code: "NOT_FOUND", message: getErrorMessage("NOT_FOUND") }, { status: 404 });
          const members = await sql`SELECT u.nickname, m.enrolled_at FROM physi_roster_members m JOIN physi_users u ON u.id=m.user_id WHERE m.roster_id=${rosterId} ORDER BY m.enrolled_at ASC LIMIT 500`;
          return NextResponse.json({ ok: true, roster: r[0], members, count: (members as any[]).length });
        }
        if (userId) {
          const rows = await sql`SELECT r.id, r.class_code, r.term, m.enrolled_at FROM physi_roster_members m JOIN physi_rosters r ON r.id=m.roster_id WHERE m.user_id=${userId} ORDER BY m.enrolled_at DESC`;
          return NextResponse.json({ ok: true, rosters: rows });
        }
        return NextResponse.json({ ok: false, code: "BAD_INPUT", message: getErrorMessage("BAD_INPUT") }, { status: 400 });
      } catch (e) {
        if (isMissingTable(e)) return NextResponse.json({ ok: false, code: "TABLE_NOT_READY", message: "Roster tables not ready — redeploy to run migration." }, { status: 503 });
        logError("ROSTER_FETCH_FAILED", e, { route: "/api/roster" });
        return NextResponse.json({ ok: false, code: "INTERNAL", message: getErrorMessage("INTERNAL") }, { status: 500 });
      }
    }

    if (req.method !== "POST") return NextResponse.json({ ok: false, code: "METHOD_NOT_ALLOWED" }, { status: 405 });

    const { getAuthUserId } = await import("@/lib/auth");
    const uid = getAuthUserId(req as Request);
    if (!uid) return NextResponse.json({ ok: false, code: "UNAUTHORIZED", message: getErrorMessage("UNAUTHORIZED") }, { status: 401 });
    const b = await req.json().catch(() => null);
    const action = String(b?.action ?? "join").toLowerCase();

    try {
      // Create: {action:"create", class_code, term?} → roster + enroll creator
      if (action === "create") {
        const classCode = String(b?.class_code ?? "").trim().slice(0, 40);
        if (!classCode) return NextResponse.json({ ok: false, code: "BAD_INPUT", message: getErrorMessage("BAD_INPUT") }, { status: 400 });
        const term = String(b?.term ?? "").trim().slice(0, 20);
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const code = newInviteCode();
            const rows = await sql`INSERT INTO physi_rosters (class_code, term, invite_code, created_by) VALUES (${classCode}, ${term}, ${code}, ${uid}) RETURNING id, class_code, term, invite_code, created_at`;
            await sql`INSERT INTO physi_roster_members (roster_id, user_id) VALUES (${(rows as any[])[0].id}, ${uid}) ON CONFLICT DO NOTHING`;
            return NextResponse.json({ ok: true, roster: (rows as any[])[0] }, { status: 201 });
          } catch (e) {
            if (String((e as Error).message).includes("duplicate") && attempt < 2) continue;
            throw e;
          }
        }
        return NextResponse.json({ ok: false, code: "INTERNAL", message: getErrorMessage("INTERNAL") }, { status: 500 });
      }

      // Rotate: {action:"rotate", roster_id} — any member; kills leaked codes
      if (action === "rotate") {
        const rosterId = String(b?.roster_id ?? "").trim();
        if (!rosterId) return NextResponse.json({ ok: false, code: "BAD_INPUT", message: getErrorMessage("BAD_INPUT") }, { status: 400 });
        if (!(await isRosterMember(sql, rosterId, uid))) {
          return NextResponse.json({ ok: false, code: "FORBIDDEN", message: "Only roster members can rotate the invite code." }, { status: 403 });
        }
        const code = newInviteCode();
        const rows = await sql`UPDATE physi_rosters SET invite_code=${code} WHERE id=${rosterId} RETURNING id, class_code, term, invite_code`;
        return NextResponse.json({ ok: true, roster: (rows as any[])[0] ?? null });
      }

      // Join: {action:"join", invite_code} — idempotent
      const code = String(b?.invite_code ?? b?.code ?? "").trim().toUpperCase();
      if (!code) return NextResponse.json({ ok: false, code: "BAD_INPUT", message: getErrorMessage("BAD_INPUT") }, { status: 400 });
      const found = await sql`SELECT id, class_code, term FROM physi_rosters WHERE invite_code=${code} LIMIT 1`;
      if (!found.length) return NextResponse.json({ ok: false, code: "ROSTER_NOT_FOUND", message: getErrorMessage("ROSTER_NOT_FOUND") }, { status: 404 });
      const rosterId = (found as any[])[0].id;
      await sql`INSERT INTO physi_roster_members (roster_id, user_id) VALUES (${rosterId}, ${uid}) ON CONFLICT DO NOTHING`;
      return NextResponse.json({ ok: true, roster: (found as any[])[0] }, { status: 200 });
    } catch (e) {
      if (isMissingTable(e)) {
        logError("TABLE_NOT_READY", e, { route: "/api/roster" });
        return NextResponse.json({ ok: false, code: "TABLE_NOT_READY", message: "Roster tables not ready — redeploy to run migration." }, { status: 503 });
      }
      logError("ROSTER_FAILED", e, { route: "/api/roster" });
      return NextResponse.json({ ok: false, code: "INTERNAL", message: getErrorMessage("INTERNAL") }, { status: 500 });
    }
  } catch (e) {
    logError("INTERNAL", e, { route: "/api/roster", method: req.method });
    return NextResponse.json({ ok: false, code: "INTERNAL", message: getErrorMessage("INTERNAL") }, { status: 500 });
  }
}

registerApiAdapter({
  id: "roster",
  route: "/api/roster",
  label: "Roster API",
  handle: handleRoster,
});
