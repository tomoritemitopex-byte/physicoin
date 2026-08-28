import { NextResponse } from "next/server";
import { sql, isDbConfigured, dbNotConfigured, ensureAllTables } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isDbConfigured() || !sql) return NextResponse.json(dbNotConfigured(), { status: 503 });
  try { await ensureAllTables(); } catch {}
  const id = new URL(req.url).searchParams.get("id");
  const nick = new URL(req.url).searchParams.get("nickname");
  if (!id && !nick) return NextResponse.json({ ok: true, note: "GET ?id=UUID or ?nickname=str" });
  const rows = id
    ? await sql`SELECT * FROM physi_users WHERE id = ${id} LIMIT 1`
    : await sql`SELECT * FROM physi_users WHERE lower(nickname)=lower(${nick!}) LIMIT 1`;
  if (!rows.length) return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ ok: true, user: rows[0] });
}

export async function POST(req: Request) {
  if (!isDbConfigured() || !sql) return NextResponse.json(dbNotConfigured(), { status: 503 });
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
  } catch (e: any) {
    if (String(e.message).includes("duplicate") || String(e.message).includes("unique")) {
      return NextResponse.json({ ok: false, code: "NICKNAME_TAKEN", error: "nickname already exists" }, { status: 409 });
    }
    throw e;
  }
}
