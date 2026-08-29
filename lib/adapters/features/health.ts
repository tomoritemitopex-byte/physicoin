/**
 * lib/adapters/features/health.ts — Health Feature + Api Adapter
 */
import { NextResponse } from "next/server";
import { getSql, isDbConfigured, dbNotConfigured } from "@/lib/db";
import { registerApiAdapter } from "../api";
import { registerFeature } from "../features";

registerFeature({
  id: "health",
  label: "Health",
  apiRoute: "/api/health",
  description: "DB ping + env check",
});

async function handleHealth(): Promise<Response> {
  const sql = getSql();
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

registerApiAdapter({ id: "health", route: "/api/health", label: "Health API", handle: handleHealth });
