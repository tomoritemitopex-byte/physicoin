import { NextResponse } from "next/server";
import { getSql, isDbConfigured, dbNotConfigured, ensureAllTables } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/vision/parse
 * Accepts: JSON { imageBase64 } OR multipart/form-data { file, image, imageBase64 }
 * Calls NVIDIA meta/llama-3.2-11b-vision-instruct, parses timetable -> [{title,venue,date,time,scope_type}]
 * Bulk creates via physi_events insert (same logic as /api/timetable).
 */
type ParsedEvent = { title: string; venue: string; date: string; time: string; scope_type: string };

const PHYSI_PIPE_FORMAT = "PHYSI | COURSE | VENUE | YYYY-MM-DD | HH:MM | SCOPE | STATUS";
const SYSTEM_PROMPT = `You are a timetable extraction assistant for PHYSI.

PRIMARY FORMAT (distinct, pipe-delimited, scannable):
Each event is one line: PHYSI | COURSE | VENUE | YYYY-MM-DD | HH:MM | SCOPE | STATUS
Example:
PHYSI | BIO 101 | LT2 | 2026-09-01 | 08:00 | 100L | Advisory
PHYSI | ANA 201 | Hall B | 2026-09-02 | 10:00 | 200L | Advisory
PHYSI | CHM 112 | New Lab | 2026-09-03 | 14:00 | general | Advisory

Return ONLY a JSON array: [{title, venue, date, time, scope_type}]
- title: COURSE code like ANA 201, BIO 101 (uppercase)
- venue: VENUE like LT1, LT2, Hall B, New Lab
- date: YYYY-MM-DD (infer current year if missing)
- time: HH:MM (24h)
- scope_type: "level" if level-specific (100L/200L), "general" otherwise
If image shows a freeform table/grid (columns: Course, Venue, Date, Time), parse that too — map to same JSON.
If unclear, skip entry. Return [] if nothing. NO markdown, NO explanation, ONLY JSON array.`;

// fallback regex parser if LLM returns markdown
function extractJsonArray(text: string): ParsedEvent[] {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const match = cleaned.match(/\[[\s\S]*\]/);
  const jsonStr = match ? match[0] : cleaned;
  try {
    const arr = JSON.parse(jsonStr);
    if (Array.isArray(arr)) return arr as ParsedEvent[];
  } catch {}
  return [];
}

function normalizeEvents(raw: ParsedEvent[]): ParsedEvent[] {
  return raw
    .filter((e) => e && e.title && e.venue && e.date && e.time)
    .map((e) => ({
      title: String(e.title).trim().toUpperCase().slice(0, 80),
      venue: String(e.venue).trim().slice(0, 80),
      date: String(e.date).trim().slice(0, 10),
      time: String(e.time).trim().slice(0, 8).padEnd(5, ":00").slice(0, 8),
      scope_type: String(e.scope_type || "general").toLowerCase() === "level" ? "level" : "general",
    }))
    .filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.date) && /^\d{2}:\d{2}/.test(e.time));
}

export async function POST(req: Request) {
  try {
    // 1) extract imageBase64
    let imageBase64: string | null = null;
    let mimeType = "image/jpeg";
    const ct = req.headers.get("content-type") || "";

    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = (form.get("file") || form.get("image") || form.get("imageBase64")) as unknown;
      if (file instanceof Blob) {
        const buf = Buffer.from(await file.arrayBuffer());
        mimeType = (file as Blob).type || "image/jpeg";
        imageBase64 = buf.toString("base64");
      } else if (typeof file === "string" && file.length > 100) {
        imageBase64 = file.replace(/^data:[^;]+;base64,/, "");
        const m = (file as string).match(/^data:([^;]+);base64,/);
        if (m) mimeType = m[1];
      }
    } else {
      const body = await req.json().catch(() => null);
      if (body?.imageBase64) {
        const s = String(body.imageBase64);
        imageBase64 = s.replace(/^data:[^;]+;base64,/, "");
        const m = s.match(/^data:([^;]+);base64,/);
        if (m) mimeType = m[1];
      } else if (body?.image) {
        const s = String(body.image);
        imageBase64 = s.replace(/^data:[^;]+;base64,/, "");
        const m = s.match(/^data:([^;]+);base64,/);
        if (m) mimeType = m[1];
      }
    }

    if (!imageBase64 || imageBase64.length < 100) {
      return NextResponse.json({ ok: false, code: "BAD_INPUT", message: "No image provided. Send multipart file or JSON { imageBase64: dataUrl|base64 }" }, { status: 400 });
    }

    // size guard ~4MB base64
    if (imageBase64.length > 6_000_000) {
      return NextResponse.json({ ok: false, code: "IMAGE_TOO_LARGE", message: "Image too large (max ~4MB)" }, { status: 400 });
    }

    const apiKey = process.env.NVIDIA_API_KEY || process.env.NVIDIA_API_TOKEN || "";
    if (!apiKey) {
      return NextResponse.json({ ok: false, code: "NVIDIA_KEY_MISSING", message: "NVIDIA_API_KEY not configured" }, { status: 503 });
    }

    // 2) call NVIDIA vision
    const dataUrl = `data:${mimeType};base64,${imageBase64}`;
    const nvidiaRes = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "meta/llama-3.2-11b-vision-instruct",
        max_tokens: 1200,
        temperature: 0.2,
        messages: [
          { role: "user", content: [{ type: "text", text: SYSTEM_PROMPT }, { type: "image_url", image_url: { url: dataUrl } }] },
        ],
      }),
    });

    if (!nvidiaRes.ok) {
      const errText = await nvidiaRes.text().catch(() => "");
      console.warn("[vision] nvidia error:", nvidiaRes.status, errText.slice(0, 500));
      return NextResponse.json({ ok: false, code: "VISION_FAILED", message: `NVIDIA ${nvidiaRes.status}: ${errText.slice(0, 300)}` }, { status: 502 });
    }

    const nvidiaJson = await nvidiaRes.json().catch(() => null);
    const content: string = nvidiaJson?.choices?.[0]?.message?.content ?? "";
    if (!content) {
      return NextResponse.json({ ok: false, code: "VISION_EMPTY", message: "Vision model returned empty" }, { status: 502 });
    }

    const parsed = normalizeEvents(extractJsonArray(content));
    if (parsed.length === 0) {
      return NextResponse.json({ ok: true, parsed: [], created: [], message: "No timetable entries detected", raw: content.slice(0, 800) });
    }

    // 3) bulk create via DB (same as /api/timetable POST logic)
    const sql = getSql();
    if (!isDbConfigured() || !sql) {
      // return parsed even if DB not configured (still useful)
      return NextResponse.json({ ok: true, parsed, created: [], warning: dbNotConfigured().error });
    }
    try { await ensureAllTables(); } catch {}

    const created: unknown[] = [];
    const errors: unknown[] = [];
    for (const ev of parsed) {
      try {
        const r = await sql`
          INSERT INTO physi_events (title, venue, event_date, event_time, scope_type, scope_value, status, authority_points, required_points)
          VALUES (${ev.title}, ${ev.venue}, ${ev.date}, ${ev.time}, ${ev.scope_type}, ${null}, ${"pending"}, ${0}, ${10})
          ON CONFLICT (lower(title), lower(venue), event_date) DO NOTHING
          RETURNING *`;
        if (r?.[0]) created.push(r[0]);
        else {
          // already exists — fetch existing
          const ex = await sql`SELECT * FROM physi_events WHERE lower(title)=lower(${ev.title}) AND lower(venue)=lower(${ev.venue}) AND event_date=${ev.date} LIMIT 1`;
          if (ex?.[0]) created.push({ ...ex[0], _existing: true });
        }
      } catch (e) {
        errors.push({ event: ev, error: (e as Error).message });
      }
    }

    return NextResponse.json({ ok: true, parsed, created, count: created.length, errors: errors.length ? errors : undefined, raw: content.slice(0, 400) });
  } catch (e) {
    console.error("[vision] internal:", e);
    return NextResponse.json({ ok: false, code: "INTERNAL", message: (e as Error).message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, usage: "POST multipart file or JSON { imageBase64 }", model: "meta/llama-3.2-11b-vision-instruct" });
}
