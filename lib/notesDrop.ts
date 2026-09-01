/**
 * lib/notesDrop.ts — Notes Drop helpers
 * Photo upload + OCR + map drops + blur preview (1 coin to unblur)
 */
export const NOTES_UNLOCK_COST = 1;

export function blurPreview(text: string, revealed: boolean): string {
  if (revealed) return text;
  if (!text) return "No text yet — snap a note to see here";
  // blur: replace alphanumerics with dots but keep length
  return text.slice(0, 180).replace(/[A-Za-z0-9]/g, "·");
}

export function ocrFallback(imageData: string): string {
  // if NVIDIA vision unavailable, return placeholder so UI still works
  if (!imageData) return "";
  return "Detected notes — tap Show to spend 1 coin and reveal (demo OCR fallback)";
}

export function buildPreviewBlur(ocr: string): string {
  if (!ocr) return "";
  return ocr.slice(0, 220);
}
