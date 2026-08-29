/**
 * lib/adapters/features/profile.ts — Profile Feature + Api Adapter
 */
import { NextResponse } from "next/server";
import { getSql, isDbConfigured, dbNotConfigured, ensureAllTables } from "@/lib/db";
import { registerApiAdapter } from "../api";
import { registerFeature } from "../features";
import { logError, getErrorMessage } from "../error";

export const profileFeature = {
  id: "profile",
  label: "Profile",
  nav: { href: "/app/profile", label: "Profile", short: "◯" },
  apiRoute: "/api/profile",
  description: "User handles — weight & mining balance",
};

registerFeature(profileFeature);

async function handleProfile(req: Request): Promise<Response> {
  try {
    const sql = getSql();
    if (!isDbConfigured() || !sql) return NextResponse.json(dbNotConfigured(), { status: 503 });
    if (req.method === "DELETE") {
      try {
        await ensureAllTables();
      } catch (e) {
        logError("PROFILE_DELETE_FAILED", e, { route: "/api/profile", phase: "ensure" });
      }
      let id: string | null = new URL(req.url).searchParams.get("id");
      if (!id) {
        try {
          const b = await req.json();
          id = b?.id ?? b?.userId ?? null;
        } catch {}
      }
      if (!id) return NextResponse.json({ ok: false, code: "BAD_INPUT", message: getErrorMessage("BAD_INPUT") }, { status: 400 });
      try {
        try {
          await sql`DELETE FROM physi_verifications WHERE verifier_id = ${id}`;
        } catch (e) {
          logError("PROFILE_DELETE_FAILED", e, { route: "/api/profile", step: "verifications" });
        }
        try {
          await sql`DELETE FROM physi_mining_logs WHERE user_id = ${id}`;
        } catch (e) {
          logError("PROFILE_DELETE_FAILED", e, { route: "/api/profile", step: "mining_logs" });
        }
        try {
          await sql`DELETE FROM physi_canonical_log WHERE promoted_by = ${id}`;
        } catch (e) {
          logError("PROFILE_DELETE_FAILED", e, { route: "/api/profile", step: "canonical" });
        }
        const rows = await sql`DELETE FROM physi_users WHERE id = ${id} RETURNING id`;
        if (!rows.length) return NextResponse.json({ ok: false, code: "NOT_FOUND", message: getErrorMessage("NOT_FOUND") }, { status: 404 });
        return NextResponse.json({ ok: true, deletedId: id }, { status: 200 });
      } catch (e) {
        logError("PROFILE_DELETE_FAILED", e, { route: "/api/profile", method: "DELETE" });
        return NextResponse.json({ ok: false, code: "PROFILE_DELETE_FAILED", message: getErrorMessage("PROFILE_DELETE_FAILED") }, { status: 500 });
      }
    }
    if (req.method === "POST") {
      try {
        await ensureAllTables();
      } catch (e) {
        logError("PROFILE_CREATE_FAILED", e, { route: "/api/profile", phase: "ensure" });
      }
      const b = await req.json().catch(() => null);
      if (!b?.full_name || !b?.nickname || !b?.programme || !b?.level) {
        return NextResponse.json({ ok: false, code: "BAD_INPUT", message: getErrorMessage("BAD_INPUT") }, { status: 400 });
      }
      try {
        const r = await sql`
        INSERT INTO physi_users (full_name, nickname, programme, level, statuses, authority_base, authority_final)
        VALUES (${b.full_name}, ${b.nickname}, ${b.programme}, ${b.level}, ${JSON.stringify(b.statuses ?? [])}::jsonb, ${b.authority_base ?? 1.0}, ${b.authority_final ?? 1.0})
        RETURNING *`;
        return NextResponse.json({ ok: true, user: r[0] }, { status: 201 });
      } catch (e: unknown) {
        const msg = String((e as Error).message);
        if (msg.includes("duplicate") || msg.includes("unique")) {
          logError("NICKNAME_TAKEN", e, { route: "/api/profile", nickname: b.nickname });
          return NextResponse.json({ ok: false, code: "NICKNAME_TAKEN", message: getErrorMessage("NICKNAME_TAKEN") }, { status: 409 });
        }
        logError("PROFILE_CREATE_FAILED", e, { route: "/api/profile", method: "POST" });
        return NextResponse.json({ ok: false, code: "PROFILE_CREATE_FAILED", message: getErrorMessage("PROFILE_CREATE_FAILED") }, { status: 500 });
      }
    }
    // GET
    try {
      await ensureAllTables();
    } catch (e) {
      logError("PROFILE_FETCH_FAILED", e, { route: "/api/profile", phase: "ensure" });
    }
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    const nick = url.searchParams.get("nickname");
    if (!id && !nick) return NextResponse.json({ ok: true, note: "GET ?id=UUID or ?nickname=str" });
    try {
      const rows = id
        ? await sql`SELECT * FROM physi_users WHERE id = ${id} LIMIT 1`
        : await sql`SELECT * FROM physi_users WHERE lower(nickname)=lower(${nick!}) LIMIT 1`;
      if (!rows.length) return NextResponse.json({ ok: false, code: "NOT_FOUND", message: getErrorMessage("NOT_FOUND") }, { status: 404 });
      return NextResponse.json({ ok: true, user: rows[0] });
    } catch (e) {
      logError("PROFILE_FETCH_FAILED", e, { route: "/api/profile", method: "GET" });
      return NextResponse.json({ ok: false, code: "PROFILE_FETCH_FAILED", message: getErrorMessage("PROFILE_FETCH_FAILED") }, { status: 500 });
    }
  } catch (e) {
    logError("INTERNAL", e, { route: "/api/profile", method: req.method });
    return NextResponse.json({ ok: false, code: "INTERNAL", message: getErrorMessage("INTERNAL") }, { status: 500 });
  }
}

registerApiAdapter({
  id: "profile",
  route: "/api/profile",
  label: "Profile API",
  handle: handleProfile,
});
