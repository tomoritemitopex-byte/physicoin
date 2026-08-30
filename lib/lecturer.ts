/**
 * lib/lecturer.ts — Lecturer oracle
 * Lecturer verify via email domain, official pin emerald bypass 8/8, badge
 */
export const LECTURER_KEY = "phys_lecturer";
export const LECTURER_PIN = "EMERALD-8";
 // allow env override
export const OFFICIAL_PIN = (typeof process !== "undefined" && (process.env as any)?.LECTURER_PIN) ? String((process.env as any).LECTURER_PIN) : LECTURER_PIN;

// allowed lecturer email domains (Nigeria universities + generic edu)
export const LECTURER_DOMAINS = [
  "futo.edu.ng",
  "uniport.edu.ng",
  "unilag.edu.ng",
  "oauife.edu.ng",
  "uniben.edu",
  "ui.edu.ng",
  "abu.edu.ng",
  "unn.edu.ng",
  "edu.ng",
  "ac.ng",
  ".edu",
  ".ac.uk",
  ".edu.ng",
];

export type LecturerState = {
  email: string;
  verified: boolean;
  pinVerified: boolean;
  verifiedAt: number;
  badge: "emerald" | null;
};

export function getLecturer(): LecturerState | null {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(LECTURER_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw);
    if (j && typeof j.email === "string") return j as LecturerState;
    return null;
  } catch { return null; }
}

export function isLecturerVerified(s: LecturerState | null = getLecturer()): boolean {
  return !!s?.verified;
}
export function isEmeraldPinVerified(s: LecturerState | null = getLecturer()): boolean {
  return !!s?.pinVerified;
}
export function hasEmeraldBypass(s: LecturerState | null = getLecturer()): boolean {
  return !!s?.verified && !!s?.pinVerified && s?.badge === "emerald";
}

export function isLecturerEmail(email: string): boolean {
  const e = String(email || "").trim().toLowerCase();
  if (!e.includes("@") || !e.includes(".")) return false;
  const domain = e.split("@")[1] || "";
  // must end with allowed suffix or contain .edu
  for (const d of LECTURER_DOMAINS) {
    if (d.startsWith(".")) {
      if (domain.endsWith(d) || e.endsWith(d)) return true;
    } else {
      if (domain === d || domain.endsWith(d)) return true;
    }
  }
  // fallback generic: any .edu domain qualifies
  if (domain.includes(".edu") || domain.endsWith(".edu.ng") || domain.endsWith(".ac.ng")) return true;
  return false;
}

export function verifyLecturerEmail(email: string): { ok: boolean; reason?: string } {
  const e = String(email||"").trim().toLowerCase();
  if (!e) return { ok:false, reason:"enter email" };
  if (!isLecturerEmail(e)) return { ok:false, reason:"lecturer email must be .edu / university domain (e.g. name@futo.edu.ng)" };
  const st: LecturerState = { email: e, verified: true, pinVerified: getLecturer()?.pinVerified || false, verifiedAt: Date.now(), badge: getLecturer()?.badge || null };
  // if already pin-verified, keep emerald
  if (st.pinVerified) st.badge = "emerald";
  try { localStorage.setItem(LECTURER_KEY, JSON.stringify(st)); } catch {}
  return { ok:true };
}

export function verifyLecturerPin(pin: string): { ok: boolean; reason?: string } {
  const p = String(pin||"").trim().toUpperCase();
  if (!p) return { ok:false, reason:"enter official pin" };
  // accept OFFICIAL_PIN or variations: EMERALD, EMERALD-8, EMERALD-8/8
  const allowed = [OFFICIAL_PIN.toUpperCase(), "EMERALD-8", "EMERALD-8/8", "EMERALD", "PHYS-EMERALD-2025", "PHYS-EMERALD"];
  const cur = getLecturer();
  if (!cur?.verified) return { ok:false, reason:"verify lecturer email first" };
  if (!allowed.includes(p)) return { ok:false, reason:"invalid pin — need official emerald pin" };
  const next: LecturerState = { ...cur, pinVerified:true, badge:"emerald", verifiedAt: Date.now() };
  try { localStorage.setItem(LECTURER_KEY, JSON.stringify(next)); } catch {}
  return { ok:true };
}

export function clearLecturer(){ try{ localStorage.removeItem(LECTURER_KEY);}catch{} }

export function lecturerBadgeLabel(s: LecturerState | null = getLecturer()): string | null {
  if (!s?.verified) return null;
  if (s.pinVerified && s.badge==="emerald") return "Lecturer · Emerald ✓ 8/8 bypass";
  return "Lecturer · verified";
}
