import { NextResponse } from "next/server";
import { isDbConfigured, dbNotConfigured, sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isDbConfigured() || !sql) {
    return NextResponse.json({ db: false, ...dbNotConfigured() }, { status: 503 });
  }
  try {
    await sql`SELECT 1 AS ok`;
    return NextResponse.json({ ok: true, db: true, at: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ ok: false, db: false, error: (e as Error).message, code: "DB_UNREACHABLE" }, { status: 503 });
  }
}
