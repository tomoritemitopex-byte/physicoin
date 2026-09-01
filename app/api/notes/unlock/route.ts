import { NextRequest, NextResponse } from "next/server";
import { getSql, isDbConfigured, dbNotConfigured, ensureAllTables, ensureNotesTables } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * POST /api/notes/unlock  { note_id, user_id } -> spend 1 coin to reveal (deduct mining_balance)
 */

export async function POST(req: NextRequest) {
  const sql = getSql();
  if (!isDbConfigured() || !sql) return NextResponse.json(dbNotConfigured(), { status: 503 });
  try { await ensureAllTables(); await ensureNotesTables(); } catch {}
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, code: "BAD_INPUT", message: "JSON required" }, { status: 400 }); }
  const noteId = String(body?.note_id || body?.id || "").trim();
  const userId = String(body?.user_id || body?.userId || "").trim();
  if (!noteId || !userId) return NextResponse.json({ ok: false, code: "BAD_INPUT", message: "note_id and user_id required" }, { status: 400 });

  try {
    const note = await sql`SELECT * FROM physi_notes_drops WHERE id=${noteId} LIMIT 1`;
    if (!note.length) return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
    const n: any = note[0];
    if (String(n.uploader_id) === String(userId)) {
      return NextResponse.json({ ok: true, unlocked: true, ocr_text: n.ocr_text, image_data: n.image_data, cost: 0, message: "Your own note — no coins needed" });
    }
    const already = await sql`SELECT 1 FROM physi_notes_unlocks WHERE note_id=${noteId} AND user_id=${userId} LIMIT 1`;
    if (already.length) {
      return NextResponse.json({ ok: true, unlocked: true, ocr_text: n.ocr_text, image_data: n.image_data, cost: 0, message: "Already unlocked" });
    }
    const u = await sql`SELECT id, mining_balance FROM physi_users WHERE id=${userId} LIMIT 1`;
    if (!u.length) return NextResponse.json({ ok: false, code: "NOT_FOUND", message: "user not found" }, { status: 404 });
    const bal = Number((u[0] as any).mining_balance ?? 0);
    if (bal < 1) return NextResponse.json({ ok: false, code: "INSUFFICIENT_COINS", message: "You need 1 coin to reveal — earn by checking in to classes", balance: bal }, { status: 402 });

    // deduct + record unlock
    await sql`UPDATE physi_users SET mining_balance = mining_balance - 1, updated_at=NOW() WHERE id=${userId}`;
    await sql`INSERT INTO physi_notes_unlocks (note_id, user_id, cost) VALUES (${noteId}, ${userId}, 1) ON CONFLICT (note_id, user_id) DO NOTHING`;
    // reward uploader 0.5 coin
    try { if (n.uploader_id) await sql`UPDATE physi_users SET mining_balance = mining_balance + 0.5, updated_at=NOW() WHERE id=${n.uploader_id}`; } catch {}

    return NextResponse.json({ ok: true, unlocked: true, ocr_text: n.ocr_text, image_data: n.image_data, cost: 1, balance: bal - 1 });
  } catch (e) {
    return NextResponse.json({ ok: false, code: "INTERNAL", message: (e as Error).message }, { status: 500 });
  }
}
