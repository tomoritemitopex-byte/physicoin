import { NextRequest, NextResponse } from "next/server";
import { getSql, isDbConfigured, dbNotConfigured, ensureAllTables } from "@/lib/db";
import { logError, getErrorMessage } from "@/lib/adapters/error";
import { findDuplicateEvents, suggestTitleFromScope, resolveCanonicalVenue } from "@/lib/eventDedup";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sql = getSql();
    if (!isDbConfigured() || !sql) return NextResponse.json(dbNotConfigured(), { status: 503 });
    try { await ensureAllTables(); } catch {}
    const sp = new URL(req.url).searchParams;
    const title = sp.get("title");
    const venue = sp.get("venue");
    const event_date = sp.get("event_date");
    const scope_value = sp.get("scope_value");

    let autoTitle: string | null = null;
    if (scope_value) autoTitle = suggestTitleFromScope(scope_value);

    if (title && venue && event_date) {
      const dups = await findDuplicateEvents(sql, title, venue, event_date);
      const canonicalVenue = await resolveCanonicalVenue(sql, venue);
      if (dups.length) {
        return NextResponse.json({
          ok: true,
          duplicate: true,
          duplicate_suggestion: {
            message: "Looks like duplicate — merge?",
            existing: dups[0],
            all: dups,
            hint: canonicalVenue ? `Canonical venue is "${canonicalVenue}"` : `Existing: ${dups[0].title} @ ${dups[0].venue} on ${String(dups[0].event_date).slice(0,10)}`,
            canonicalVenue,
          },
          autoTitle,
        });
      }
      return NextResponse.json({ ok: true, duplicate: false, autoTitle, canonicalVenue });
    }
    if (scope_value) {
      return NextResponse.json({ ok: true, duplicate: false, autoTitle });
    }
    return NextResponse.json({ ok: false, code: "BAD_INPUT", message: "title+venue+event_date or scope_value required" }, { status: 400 });
  } catch (e) {
    logError("EVENT_DEDUP_FAILED", e, {});
    return NextResponse.json({ ok: false, code: "INTERNAL", message: getErrorMessage("INTERNAL") }, { status: 500 });
  }
}
