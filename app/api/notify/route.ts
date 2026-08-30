import { NextResponse } from "next/server";
import { notifyCanonical } from "@/lib/adapters/notify";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(()=> ({} as any));
    const event = body?.event ?? body;
    if (!event || (!event.title && !event.id)) {
      return NextResponse.json({ ok: false, code: "BAD_INPUT", message: "need event {title, venue, event_date, event_time}" }, { status: 400 });
    }
    const r = await notifyCanonical({
      id: String(event.id ?? ""),
      title: String(event.title ?? ""),
      venue: String(event.venue ?? ""),
      event_date: String(event.event_date ?? ""),
      event_time: String(event.event_time ?? ""),
      yes_weight: Number(event.yes_weight ?? event.authority_points ?? 0) || undefined,
      total_weight: Number(event.total_weight ?? event.required_points ?? 8) || undefined,
      yes_ratio: event.yes_ratio != null ? Number(event.yes_ratio) : undefined,
    });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ ok: false, code: "NOTIFY_FAILED", message: (e as Error).message }, { status: 500 });
  }
}
export async function GET() {
  return NextResponse.json({ ok: true, hint: "POST {event:{title,venue,event_date,event_time}} → Telegram (BOT_TOKEN) + WhatsApp placeholder" });
}
