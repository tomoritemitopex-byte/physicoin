/**
 * lib/adapters/notify.ts — Push adapter (Telegram + WhatsApp)
 * Env: BOT_TOKEN | TELEGRAM_BOT_TOKEN | TELEGRAM_TOKEN + TELEGRAM_CHAT_ID
 * WhatsApp placeholder: WHATSAPP_TOKEN | WHATSAPP_PHONE_ID (logs when unset).
 * Called when an event reaches canonical quorum (see verify feature) or 8/8.
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
  const token = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_TOKEN || "";
  const chatId = process.env.TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHANNEL || process.env.CHAT_ID || "";
  return { token, chatId };
}

function getWhatsAppConfig() {
  const token = process.env.WHATSAPP_TOKEN || process.env.WHATSAPP_BEARER || "";
  const phoneId = process.env.WHATSAPP_PHONE_ID || process.env.WHATSAPP_PHONE || "";
  const to = process.env.WHATSAPP_TO || process.env.WHATSAPP_CHAT_ID || "";
  return { token, phoneId, to };
}

function formatText(event: CanonicalEvent): string {
  const title = String(event.title ?? event.id ?? "PHYSI event");
  const venue = String(event.venue ?? "");
  const date = String(event.event_date ?? "");
  const time = String(event.event_time ?? "");
  const ratio = event.yes_ratio != null ? String(event.yes_ratio) : "";
  const yes = event.yes_weight != null ? String(event.yes_weight) : "";
  const total = event.total_weight != null ? String(event.total_weight) : "";
  const quorum = yes && total ? ` · quorum ${yes}/${total}` : ratio ? ` · yes=${ratio}` : "";
  return `✅ PHYSI canonical: ${title}${venue ? ` @ ${venue}` : ""}${date ? ` · ${date}` : ""}${time ? ` ${time}` : ""}${quorum}`;
}

export async function notifyTelegram(event: CanonicalEvent): Promise<{ ok: boolean; skipped?: boolean; reason?: string }> {
  const { token, chatId } = getTelegramConfig();
  const text = formatText(event);
  if (!token || !chatId) {
    console.log("[notify] telegram skipped (no BOT_TOKEN/TELEGRAM_BOT_TOKEN or CHAT_ID):", text);
    return { ok: true, skipped: true, reason: "BOT_TOKEN or TELEGRAM_CHAT_ID not set — logged" };
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

export async function notifyWhatsApp(event: CanonicalEvent): Promise<{ ok: boolean; skipped?: boolean; reason?: string; placeholder?: boolean }> {
  const { token, phoneId, to } = getWhatsAppConfig();
  const text = formatText(event);
  // placeholder: if no creds, log and return skipped (keeps build/env-light)
  if (!token || !phoneId) {
    console.log("[notify] whatsapp placeholder (no WHATSAPP_TOKEN/PHONE_ID, logged only):", text, { placeholder: true, event });
    return { ok: true, skipped: true, reason: "WHATSAPP_TOKEN or WHATSAPP_PHONE_ID not set — placeholder logged", placeholder: true };
  }
  try {
    // Graph API placeholder — POST to graph.facebook.com/v20.0/{phoneId}/messages
    const url = `https://graph.facebook.com/v20.0/${phoneId}/messages`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: to || "broadcast-placeholder",
        type: "text",
        text: { preview_url: false, body: text },
      }),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok) {
      console.warn("[notify] whatsapp failed:", res.status, j);
      return { ok: false, reason: `whatsapp ${res.status}` };
    }
    console.log("[notify] whatsapp sent:", j?.messages?.[0]?.id ?? "ok");
    return { ok: true };
  } catch (e) {
    console.warn("[notify] whatsapp error:", (e as Error).message);
    return { ok: false, reason: (e as Error).message };
  }
}

export async function notifyCanonical(event: CanonicalEvent): Promise<{ ok: boolean; skipped?: boolean; reason?: string; telegram?: any; whatsapp?: any }> {
  const text = formatText(event);
  console.log("[notify] canonical →", text);
  const [telegram, whatsapp] = await Promise.all([notifyTelegram(event), notifyWhatsApp(event)]);
  const ok = telegram.ok && whatsapp.ok;
  // both skipped is still ok (env-light), but report
  if (telegram.skipped && whatsapp.skipped) {
    return { ok: true, skipped: true, reason: "both adapters skipped — logged only", telegram, whatsapp };
  }
  return { ok, telegram, whatsapp };
}

export async function notifyQuorumPromoted(event: CanonicalEvent) {
  return notifyCanonical(event);
}

// alias used by roadmap 8/8 hook
export async function notifyBroadcast(event: CanonicalEvent) {
  return notifyCanonical(event);
}
