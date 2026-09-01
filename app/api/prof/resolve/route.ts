import { NextRequest, NextResponse } from "next/server";
import { getSql, isDbConfigured, dbNotConfigured, ensureAllTables } from "@/lib/db";
import { profGroupKey } from "@/lib/profMatch";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const sql = getSql();
  if (!isDbConfigured() || !sql) return NextResponse.json(dbNotConfigured(), { status: 503 });
  try { await ensureAllTables(); } catch {}
  const { searchParams } = new URL(req.url);
  const raw = String(searchParams.get("name") || searchParams.get("prof") || "").trim();
  if (!raw) return NextResponse.json({ ok: false, code: "BAD_INPUT", message: "name required" }, { status: 400 });
  const gk = profGroupKey(raw);
  const rows = await sql`SELECT canonical FROM physi_prof_aliases WHERE prof_group_key=${gk} AND status='resolved' ORDER BY votes_yes DESC LIMIT 1` as any[];
  if (rows.length) return NextResponse.json({ ok: true, input: raw, canonical: rows[0].canonical, group_key: gk, resolved: true });
  return NextResponse.json({ ok: true, input: raw, canonical: raw, group_key: gk, resolved: false });
}
