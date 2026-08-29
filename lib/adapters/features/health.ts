/**
 * lib/adapters/features/health.ts — Health Feature + Api Adapter
 */
import { NextResponse } from "next/server";
import { getSql, isDbConfigured, dbNotConfigured } from "@/lib/db";
import { registerApiAdapter } from "../api";
import { registerFeature } from "../features";
import { logError, getErrorMessage } from "../error";

registerFeature({
  id: "health",
  label: "Health",
  apiRoute: "/api/health",
  description: "DB ping + env check",
});

async function handleHealth(): Promise<Response> {
  try {
    const sql = getSql();
    if (!isDbConfigured() || !sql) {
      return NextResponse.json({ db: false, ...dbNotConfigured() }, { status: 503 });
    }
    try {
      await sql`SELECT 1 AS ok`;
      return NextResponse.json({ ok: true, db: true, at: new Date().toISOString() });
    } catch (e) {
      logError("DB_UNREACHABLE", e, { route: "/api/health" });
      return NextResponse.json({ ok: false, db: false, message: getErrorMessage("DB_UNREACHABLE"), code: "DB_UNREACHABLE" }, { status: 503 });
    }
  } catch (e) {
    logError("HEALTH_CHECK_FAILED", e, { route: "/api/health" });
    return NextResponse.json({ ok: false, db: false, message: getErrorMessage("HEALTH_CHECK_FAILED"), code: "HEALTH_CHECK_FAILED" }, { status: 503 });
  }
}

registerApiAdapter({ id: "health", route: "/api/health", label: "Health API", handle: handleHealth });
