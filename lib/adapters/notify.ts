/**
 * lib/adapters/notify.ts — Push adapter (Telegram)
 * Minimal, env-light: uses TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID if set, else logs.
 * Called when an event reaches canonical quorum (see verify feature).
 */

export type CanonicalEvent = {
  id?: string;
  title?: string;
  venue?: string;
  event_date?: string;
  event_time?: string;
  yes_weight?: number;
  total_weight?: number;
  yes_ratio?: number;
  [k: string]: unknown;
};

function getTelegramConfig() {
  const token = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_TOKEN || "";
  const chatId = process.env.TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHANNEL || "";
  return { token, chatId };
}

export async function notifyCanonical(event: CanonicalEvent): Promise<{ ok: boolean; skipped?: boolean; reason?: string }> {
  const { token, chatId } = getTelegramConfig();
  const title = String(event.title ?? event.id ?? "PHYSI event");
  const venue = String(event.venue ?? "");
  const date = String(event.event_date ?? "");
  const time = String(event.event_time ?? "");
  const ratio = event.yes_ratio != null ? String(event.yes_ratio) : "";
  const text = `✅ PHYSI canonical: ${title}${venue ? ` @ ${venue}` : ""}${date ? ` · ${date}` : ""}${time ? ` ${time}` : ""}${ratio ? ` · yes=${ratio}` : ""}`;

  if (!token || !chatId) {
    console.log("[notify] canonical (no TELEGRAM_BOT_TOKEN/CHAT_ID, logged only):", text, event);
    return { ok: true, skipped: true, reason: "TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set — logged" };
  }

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok) {
      console.warn("[notify] telegram failed:", res.status, j);
      return { ok: false, reason: `telegram ${res.status}` };
    }
    console.log("[notify] telegram sent:", j?.result?.message_id ?? "ok");
    return { ok: true };
  } catch (e) {
    console.warn("[notify] telegram error:", (e as Error).message);
    return { ok: false, reason: (e as Error).message };
  }
}

export async function notifyQuorumPromoted(event: CanonicalEvent) {
  return notifyCanonical(event);
}
