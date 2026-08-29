/**
 * lib/adapters/features/profile.ts — Profile Feature + Api Adapter
 */
import { NextResponse } from "next/server";
import { getSql, isDbConfigured, dbNotConfigured, ensureAllTables } from "@/lib/db";
import { registerApiAdapter } from "../api";
import { registerFeature } from "../features";

export const profileFeature = {
  id: "profile",
  label: "Profile",
  nav: { href: "/app/profile", label: "Profile", short: "◯" },
  apiRoute: "/api/profile",
  description: "User handles — weight & mining balance",
};

registerFeature(profileFeature);

async function handleProfile(req: Request): Promise<Response> {
  const sql = getSql();
  if (!isDbConfigured() || !sql) return NextResponse.json(dbNotConfigured(), { status: 503 });
  if (req.method === "DELETE") {
    try {
      await ensureAllTables();
    } catch {}
    let id: string | null = new URL(req.url).searchParams.get("id");
    if (!id) {
      try {
        const b = await req.json();
        id = b?.id ?? b?.userId ?? null;
      } catch {}
    }
    if (!id) return NextResponse.json({ ok: false, code: "BAD_INPUT", error: "id required (?id=UUID or JSON {id})" }, { status: 400 });
    try {
      await sql`DELETE FROM physi_verifications WHERE verifier_id = ${id}`;
    } catch {}
    try {
      await sql`DELETE FROM physi_mining_logs WHERE user_id = ${id}`;
    } catch {}
    try {
      await sql`DELETE FROM physi_canonical_log WHERE promoted_by = ${id}`;
    } catch {}
    const rows = await sql`DELETE FROM physi_users WHERE id = ${id} RETURNING id`;
    if (!rows.length) return NextResponse.json({ ok: false, code: "NOT_FOUND", error: "user not found" }, { status: 404 });
    return NextResponse.json({ ok: true, deletedId: id }, { status: 200 });
  }
  if (req.method === "POST") {
    await ensureAllTables();
    const b = await req.json().catch(() => null);
    if (!b?.full_name || !b?.nickname || !b?.programme || !b?.level) {
      return NextResponse.json({ ok: false, code: "BAD_INPUT", error: "full_name, nickname, programme, level required" }, { status: 400 });
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
        return NextResponse.json({ ok: false, code: "NICKNAME_TAKEN", error: "nickname already exists" }, { status: 409 });
      }
      throw e;
    }
  }
  // GET
  try {
    await ensureAllTables();
  } catch {}
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const nick = url.searchParams.get("nickname");
  if (!id && !nick) return NextResponse.json({ ok: true, note: "GET ?id=UUID or ?nickname=str" });
  const rows = id
    ? await sql`SELECT * FROM physi_users WHERE id = ${id} LIMIT 1`
    : await sql`SELECT * FROM physi_users WHERE lower(nickname)=lower(${nick!}) LIMIT 1`;
  if (!rows.length) return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ ok: true, user: rows[0] });
}

registerApiAdapter({
  id: "profile",
  route: "/api/profile",
  label: "Profile API",
  handle: handleProfile,
});
