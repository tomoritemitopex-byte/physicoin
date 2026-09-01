import { NextRequest, NextResponse } from "next/server";
import { getSql, isDbConfigured, dbNotConfigured, ensureAllTables, ensureNotesTables } from "@/lib/db";
import { buildGhostChainSigs, prepareGhostChainQueries, GHOST_GENESIS } from "@/lib/ghostWitness";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Notes Drop
 * POST /api/notes  multipart: file + { title, building_id, level, uploader_id, lat, lng }
 *   -> photo upload + OCR (NVIDIA vision if key, else fallback), stored as map drop, blur preview (1 coin to unlock)
 * GET  /api/notes?building_id=phys&level=200L&viewer_id=... -> map drops with blur logic
 */

async function ocrViaVision(imageBase64: string, mime: string): Promise<string> {
  const apiKey = process.env.NVIDIA_API_KEY || process.env.NVIDIA_API_TOKEN || "";
  if (!apiKey || !imageBase64) return "";
  try {
    const dataUrl = `data:${mime};base64,${imageBase64}`;
    const r = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "meta/llama-3.2-11b-vision-instruct",
        max_tokens: 900,
        temperature: 0.15,
        messages: [{ role: "user", content: [{ type: "text", text: "Extract all readable text from this handwritten/printed note. Return only the transcription, no commentary. If blurry, give best effort." }, { type: "image_url", image_url: { url: dataUrl } }] }],
      }),
    });
    if (!r.ok) return "";
    const j = await r.json().catch(() => null);
    const t: string = j?.choices?.[0]?.message?.content ?? "";
    return t.slice(0, 4000).trim();
  } catch { return ""; }
}

export async function GET(req: NextRequest) {
  const sql = getSql();
  if (!isDbConfigured() || !sql) return NextResponse.json(dbNotConfigured(), { status: 503 });
  try { await ensureAllTables(); await ensureNotesTables(); } catch {}
  const { searchParams } = new URL(req.url);
  const buildingId = (searchParams.get("building_id") || searchParams.get("building") || "").trim().toLowerCase();
  const level = (searchParams.get("level") || "").trim();
  const viewerId = searchParams.get("viewer_id") || searchParams.get("user_id") || null;
  const noteId = searchParams.get("note_id") || searchParams.get("id") || "";

  try {
    if (noteId) {
      const rows = await sql`SELECT * FROM physi_notes_drops WHERE id=${noteId} LIMIT 1`;
      if (!rows.length) return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
      const n: any = rows[0];
      let unlocked = false;
      if (viewerId) {
        const u = await sql`SELECT 1 FROM physi_notes_unlocks WHERE note_id=${noteId} AND user_id=${viewerId} LIMIT 1`;
        unlocked = u.length > 0 || String(n.uploader_id) === String(viewerId);
      }
      const isOwner = viewerId ? String(n.uploader_id) === String(viewerId) : false;
      const showFull = unlocked || isOwner;
      return NextResponse.json({
        ok: true,
        note: {
          id: n.id, title: n.title, building_id: n.building_id, level: n.level, lat: n.lat, lng: n.lng,
          created_at: n.created_at, uploader_id: n.uploader_id,
          ocr_text: showFull ? n.ocr_text : n.preview_blur || n.ocr_text.slice(0, 180).replace(/[A-Za-z0-9]/g, "·"),
          preview_blur: n.preview_blur,
          blurred: !showFull,
          image_data: showFull ? n.image_data : "",
          cost: 1,
        },
      });
    }

    let rows: any[] = [];
    if (buildingId && level) rows = await sql`SELECT * FROM physi_notes_drops WHERE building_id=${buildingId} AND level ILIKE ${level} ORDER BY created_at DESC LIMIT 50`;
    else if (buildingId) rows = await sql`SELECT * FROM physi_notes_drops WHERE building_id=${buildingId} ORDER BY created_at DESC LIMIT 50`;
    else if (level) rows = await sql`SELECT * FROM physi_notes_drops WHERE level ILIKE ${level} ORDER BY created_at DESC LIMIT 50`;
    else rows = await sql`SELECT * FROM physi_notes_drops ORDER BY created_at DESC LIMIT 50`;

    // for viewer, check which are unlocked
    let unlockedSet = new Set<string>();
    if (viewerId && rows.length) {
      try {
        const ids = rows.map((r: any) => r.id);
        // naive: fetch unlocks for viewer
        const unlocked = await sql`SELECT note_id FROM physi_notes_unlocks WHERE user_id=${viewerId}`;
        for (const u of unlocked as any[]) unlockedSet.add(String(u.note_id));
      } catch {}
    }

    const notes = rows.map((n: any) => {
      const isOwner = viewerId ? String(n.uploader_id) === String(viewerId) : false;
      const unlocked = unlockedSet.has(String(n.id)) || isOwner;
      return {
        id: n.id, title: n.title, building_id: n.building_id, level: n.level, lat: n.lat, lng: n.lng,
        created_at: n.created_at, uploader_id: n.uploader_id,
        ocr_text: unlocked ? n.ocr_text : (n.preview_blur || n.ocr_text.slice(0, 160).replace(/[A-Za-z0-9]/g, "·")),
        preview_blur: n.preview_blur,
        blurred: !unlocked,
        has_image: !!n.image_data,
        cost: 1,
      };
    });
    return NextResponse.json({ ok: true, notes, count: notes.length });
  } catch (e) {
    return NextResponse.json({ ok: false, code: "INTERNAL", message: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const sql = getSql();
  if (!isDbConfigured() || !sql) return NextResponse.json(dbNotConfigured(), { status: 503 });
  try { await ensureAllTables(); await ensureNotesTables(); } catch {}

  const ct = req.headers.get("content-type") || "";
  let title = "", buildingId = "phys", level = "100L", uploaderId: string | null = null;
  let lat: number | null = null, lng: number | null = null;
  let imageBase64 = "", mime = "image/jpeg";
  let textFallback = "";

  try {
    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      title = String(form.get("title") || form.get("course") || "Notes").slice(0, 120);
      buildingId = String(form.get("building_id") || form.get("building") || "phys").toLowerCase().slice(0, 24) || "phys";
      level = String(form.get("level") || "100L").slice(0, 10) || "100L";
      uploaderId = form.get("uploader_id") ? String(form.get("uploader_id")) : form.get("user_id") ? String(form.get("user_id")) : null;
      const latS = form.get("lat"); if (latS) lat = Number(latS);
      const lngS = form.get("lng"); if (lngS) lng = Number(lngS);
      textFallback = String(form.get("ocr_text") || form.get("text") || "").slice(0, 4000);
      const file = (form.get("file") || form.get("image") || form.get("photo")) as unknown;
      if (file instanceof Blob) {
        const buf = Buffer.from(await (file as Blob).arrayBuffer());
        mime = (file as Blob).type || "image/jpeg";
        imageBase64 = buf.toString("base64");
        if (imageBase64.length > 5_000_000) return NextResponse.json({ ok: false, code: "IMAGE_TOO_LARGE", message: "Image too large (max ~4MB)" }, { status: 400 });
      } else if (typeof file === "string" && (file as string).length > 100) {
        const s = file as string;
        imageBase64 = s.replace(/^data:[^;]+;base64,/, "");
        const m = s.match(/^data:([^;]+);base64,/); if (m) mime = m[1];
      }
    } else {
      const body: any = await req.json().catch(() => null);
      if (!body) return NextResponse.json({ ok: false, code: "BAD_INPUT", message: "JSON or multipart required" }, { status: 400 });
      title = String(body.title || body.course || "Notes").slice(0, 120);
      buildingId = String(body.building_id || body.building || "phys").toLowerCase().slice(0, 24) || "phys";
      level = String(body.level || "100L").slice(0, 10) || "100L";
      uploaderId = body.uploader_id ? String(body.uploader_id) : body.user_id ? String(body.user_id) : null;
      if (body.lat != null) lat = Number(body.lat);
      if (body.lng != null) lng = Number(body.lng);
      textFallback = String(body.ocr_text || body.text || "").slice(0, 4000);
      if (body.imageBase64) {
        const s = String(body.imageBase64);
        imageBase64 = s.replace(/^data:[^;]+;base64,/, "");
        const m = s.match(/^data:([^;]+);base64,/); if (m) mime = m[1];
      } else if (body.image_data) {
        const s = String(body.image_data);
        imageBase64 = s.replace(/^data:[^;]+;base64,/, "");
      }
    }
  } catch (e) {
    return NextResponse.json({ ok: false, code: "BAD_INPUT", message: (e as Error).message }, { status: 400 });
  }

  if (!imageBase64 && !textFallback) return NextResponse.json({ ok: false, code: "BAD_INPUT", message: "Photo or text required" }, { status: 400 });
  if (!uploaderId) {
    // allow anonymous? but need uploader for ghost chain; if missing treat as anon text-only drop without chain
    uploaderId = null;
  } else {
    try {
      const u = await sql`SELECT id FROM physi_users WHERE id=${uploaderId} LIMIT 1`;
      if (!u.length) return NextResponse.json({ ok: false, code: "NOT_FOUND", message: "uploader not found" }, { status: 404 });
    } catch {}
  }

  // OCR
  let ocr = textFallback;
  if (imageBase64) {
    const visionText = await ocrViaVision(imageBase64, mime);
    if (visionText) ocr = visionText;
    else if (!ocr) ocr = "Notes detected — clear photo saved. Tap Show to reveal (1 coin).";
  }
  if (!ocr) ocr = "Notes shared — tap Show to reveal (1 coin).";
  const preview = ocr.slice(0, 180);
  // store image as data URL truncated for demo (limit 1MB in DB text)
  let imageData = "";
  if (imageBase64) {
    const dataUrl = `data:${mime};base64,${imageBase64}`;
    imageData = dataUrl.length > 900_000 ? dataUrl.slice(0, 900_000) : dataUrl;
  }

  const finalTitle = title && title !== "Notes" ? title : (ocr.slice(0, 40).split("\n")[0].slice(0, 60) || "Notes");

  try {
    let ghostQs: any[] = [];
    let ghostSig: string | null = null;
    if (uploaderId) {
      try {
        const u = await sql`SELECT rep_ghost_sig FROM physi_users WHERE id=${uploaderId} LIMIT 1`;
        const prev = (u[0] as any)?.rep_ghost_sig ?? GHOST_GENESIS;
        const gb = buildGhostChainSigs(prev, "notes:drop", uploaderId);
        ghostSig = gb.newSig;
        ghostQs = prepareGhostChainQueries(sql, uploaderId, "notes:drop", gb.prev, gb.newSig);
      } catch {}
    }

    const inserted = await sql`INSERT INTO physi_notes_drops (uploader_id, title, building_id, level, lat, lng, ocr_text, image_data, preview_blur) VALUES (${uploaderId}, ${finalTitle}, ${buildingId}, ${level}, ${lat}, ${lng}, ${ocr}, ${imageData}, ${preview}) RETURNING *`;
    if (ghostQs.length) { try { await Promise.all(ghostQs); } catch {} }

    const note = inserted?.[0] as any;
    return NextResponse.json({ ok: true, note: { id: note.id, title: note.title, building_id: note.building_id, level: note.level, preview_blur: note.preview_blur, blurred: true, cost: 1, created_at: note.created_at }, ocr_length: ocr.length, ghost_sig: ghostSig }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ ok: false, code: "INTERNAL", message: (e as Error).message }, { status: 500 });
  }
}
