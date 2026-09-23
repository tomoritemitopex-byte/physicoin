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
import { BEDROCK_V5, PETITION_THRESHOLD } from "@/lib/bedrock";

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
          // BEDROCK v5.0: member nicknames require membership (public
          // enumeration enabled targeted harassment). Meta + count stay public.
          const { getSessionUserId } = await import("@/lib/auth");
          const self = getSessionUserId(req as Request);
          const insider = self ? await isRosterMember(sql, rosterId, self) : false;
          if (!insider) {
            const c: any[] = await sql`SELECT COUNT(*)::int AS c FROM physi_roster_members WHERE roster_id=${rosterId}` as any;
            return NextResponse.json({ ok: true, roster: r[0], members: [], count: Number((c[0] as any)?.c ?? 0), gated: true });
          }
          const members = await sql`SELECT u.nickname, m.enrolled_at FROM physi_roster_members m JOIN physi_users u ON u.id=m.user_id WHERE m.roster_id=${rosterId} ORDER BY m.enrolled_at ASC LIMIT 500`;
          return NextResponse.json({ ok: true, roster: r[0], members, count: (members as any[]).length });
        }
        if (userId) {
          // BEDROCK v5.0: nobody enumerates anybody else's rosters.
          const { getSessionUserId } = await import("@/lib/auth");
          const self = getSessionUserId(req as Request);
          if (!self || self !== userId) {
            return NextResponse.json({ ok: false, code: "FORBIDDEN", message: "You can only list your own rosters." }, { status: 403 });
          }
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
      // Create: {action:"create", class_code, term?} → roster + enroll creator.
      // BEDROCK v5.0: idempotent — duplicate create returns the ONE canonical
      // roster (squatting yields nothing). invite_code is included ONLY for
      // the creator/members; outsiders get the roster without the key.
      if (action === "create") {
        const classCode = String(b?.class_code ?? "").trim().slice(0, 40);
        if (!classCode) return NextResponse.json({ ok: false, code: "BAD_INPUT", message: getErrorMessage("BAD_INPUT") }, { status: 400 });
        const term = String(b?.term ?? "").trim().slice(0, 20);
        const existing: any[] = await sql`SELECT id, class_code, term, invite_code, created_by FROM physi_rosters WHERE lower(class_code)=lower(${classCode}) AND term=${term} LIMIT 1` as any;
        if (existing.length) {
          const ex = existing[0] as any;
          const mine = String(ex.created_by) === String(uid) || await isRosterMember(sql, String(ex.id), uid);
          const { invite_code: _k, ...pub } = ex;
          return NextResponse.json({ ok: true, roster: mine ? ex : pub, existed: true, hint: mine ? undefined : "Roster exists — ask a member for the invite code." }, { status: 200 });
        }
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

      // Rotate: {action:"rotate", roster_id} — CREATOR ONLY (v5.0: any-member
      // rotation was a griefing button). Kills leaked codes.
      if (action === "rotate") {
        const rosterId = String(b?.roster_id ?? "").trim();
        if (!rosterId) return NextResponse.json({ ok: false, code: "BAD_INPUT", message: getErrorMessage("BAD_INPUT") }, { status: 400 });
        const rr: any[] = await sql`SELECT created_by FROM physi_rosters WHERE id=${rosterId} LIMIT 1` as any;
        if (!rr.length) return NextResponse.json({ ok: false, code: "NOT_FOUND", message: getErrorMessage("NOT_FOUND") }, { status: 404 });
        if (String((rr[0] as any).created_by) !== String(uid)) {
          return NextResponse.json({ ok: false, code: "FORBIDDEN", message: "Only the roster creator can rotate the invite code." }, { status: 403 });
        }
        const code = newInviteCode();
        const rows = await sql`UPDATE physi_rosters SET invite_code=${code} WHERE id=${rosterId} RETURNING id, class_code, term, invite_code`;
        return NextResponse.json({ ok: true, roster: (rows as any[])[0] ?? null });
      }

      // Transfer: {action:"transfer", roster_id, to_user_id} — creator only.
      if (action === "transfer") {
        const rosterId = String(b?.roster_id ?? "").trim();
        const toUid = String(b?.to_user_id ?? b?.toUserId ?? "").trim();
        if (!rosterId || !toUid) return NextResponse.json({ ok: false, code: "BAD_INPUT", message: getErrorMessage("BAD_INPUT") }, { status: 400 });
        const rr: any[] = await sql`SELECT created_by FROM physi_rosters WHERE id=${rosterId} LIMIT 1` as any;
        if (!rr.length) return NextResponse.json({ ok: false, code: "NOT_FOUND", message: getErrorMessage("NOT_FOUND") }, { status: 404 });
        if (String((rr[0] as any).created_by) !== String(uid)) {
          return NextResponse.json({ ok: false, code: "FORBIDDEN", message: "Only the roster creator can transfer it." }, { status: 403 });
        }
        if (!(await isRosterMember(sql, rosterId, toUid))) {
          return NextResponse.json({ ok: false, code: "BAD_INPUT", message: "New creator must be a roster member." }, { status: 400 });
        }
        await sql`UPDATE physi_rosters SET created_by=${toUid} WHERE id=${rosterId}`;
        await sql`DELETE FROM physi_roster_petitions WHERE roster_id=${rosterId}`;
        return NextResponse.json({ ok: true, transferred: true, to: toUid });
      }

      // Remove: {action:"remove", roster_id, user_id} — creator only, never self
      // (transfer first). Ejects leaked intruders without punishing residents.
      if (action === "remove") {
        const rosterId = String(b?.roster_id ?? "").trim();
        const target = String(b?.user_id ?? "").trim();
        if (!rosterId || !target) return NextResponse.json({ ok: false, code: "BAD_INPUT", message: getErrorMessage("BAD_INPUT") }, { status: 400 });
        const rr: any[] = await sql`SELECT created_by FROM physi_rosters WHERE id=${rosterId} LIMIT 1` as any;
        if (!rr.length) return NextResponse.json({ ok: false, code: "NOT_FOUND", message: getErrorMessage("NOT_FOUND") }, { status: 404 });
        if (String((rr[0] as any).created_by) !== String(uid)) {
          return NextResponse.json({ ok: false, code: "FORBIDDEN", message: "Only the roster creator can remove members." }, { status: 403 });
        }
        if (target === String(uid)) {
          return NextResponse.json({ ok: false, code: "BAD_INPUT", message: "Transfer creatorship before leaving." }, { status: 400 });
        }
        await sql`DELETE FROM physi_roster_members WHERE roster_id=${rosterId} AND user_id=${target}`;
        await sql`DELETE FROM physi_roster_petitions WHERE roster_id=${rosterId} AND petitioner_id=${target}`;
        return NextResponse.json({ ok: true, removed: true });
      }

      // Petition: {action:"petition", roster_id} — member-only, blind count.
      // 8 co-signs auto-transfer to the OLDEST petitioner (mandate consumed).
      // Covers absentee AND abusive creators; check-in heartbeats don't count.
      if (action === "petition") {
        if (!BEDROCK_V5.petitionSuccession) {
          return NextResponse.json({ ok: false, code: "PETITIONS_OFF", message: "Petitions are temporarily disabled." }, { status: 503 });
        }
        const rosterId = String(b?.roster_id ?? "").trim();
        if (!rosterId) return NextResponse.json({ ok: false, code: "BAD_INPUT", message: getErrorMessage("BAD_INPUT") }, { status: 400 });
        if (!(await isRosterMember(sql, rosterId, uid))) {
          return NextResponse.json({ ok: false, code: "FORBIDDEN", message: "Only roster members can petition." }, { status: 403 });
        }
        await sql`INSERT INTO physi_roster_petitions (roster_id, petitioner_id) VALUES (${rosterId}, ${uid}) ON CONFLICT DO NOTHING`;
        const cnt: any[] = await sql`SELECT COUNT(*)::int AS c FROM physi_roster_petitions WHERE roster_id=${rosterId}` as any;
        const n = Number((cnt[0] as any)?.c ?? 0);
        if (n >= PETITION_THRESHOLD) {
          const oldest: any[] = await sql`SELECT petitioner_id FROM physi_roster_petitions WHERE roster_id=${rosterId} ORDER BY created_at ASC LIMIT 1` as any;
          const next = String((oldest[0] as any)?.petitioner_id ?? "");
          if (next) {
            await sql`UPDATE physi_rosters SET created_by=${next} WHERE id=${rosterId}`;
            await sql`DELETE FROM physi_roster_petitions WHERE roster_id=${rosterId}`;
            return NextResponse.json({ ok: true, petitions: n, transferred: true, to: next });
          }
        }
        return NextResponse.json({ ok: true, petitions: n, threshold: PETITION_THRESHOLD });
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
