/**
 * lib/adapters/presence.ts — Proof-of-Presence adapter
 * Checks geolocation (150m) + time (30min) → Witness 1.0 gold vs Remote 0.3 grey
 */
export const VENUE_COORDS: Record<string, { lat: number; lng: number }> = {
  "lt1": { lat: 7.4591, lng: 5.8412 },
  "lt2": { lat: 7.4595, lng: 5.8418 },
  "lt3": { lat: 7.4599, lng: 5.8421 },
  "lt5": { lat: 7.4602, lng: 5.8415 },
  "hall b": { lat: 7.4587, lng: 5.8405 },
  "hall a": { lat: 7.4585, lng: 5.8408 },
  "exam hall": { lat: 7.4580, lng: 5.8410 },
  "auditorium": { lat: 7.4578, lng: 5.8402 },
  "lab": { lat: 7.4600, lng: 5.8430 },
  "default": { lat: 7.4590, lng: 5.8410 },
};

export function getVenueCoords(venue: string): { lat: number; lng: number } {
  const key = String(venue || "").trim().toLowerCase();
  if (VENUE_COORDS[key]) return VENUE_COORDS[key];
  // partial match: lt1 contains
  for (const [k, v] of Object.entries(VENUE_COORDS)) {
    if (k === "default") continue;
    if (key.includes(k) || k.includes(key)) return v;
  }
  return VENUE_COORDS["default"];
}

export function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function eventInstantWAT(dateStr: string, timeStr: string): number {
  const t = String(timeStr ?? "00:00").slice(0, 5);
  const iso = `${String(dateStr).slice(0, 10)}T${t}:00+01:00`;
  const ms = Date.parse(iso);
  if (!isNaN(ms)) return ms;
  return new Date(`${dateStr}T${t}:00`).getTime();
}

export type PresenceResult = {
  isWitness: boolean;
  distanceM: number | null;
  timeDiffMin: number;
  award: number;
  label: string;
};

export function checkPresenceAward(opts: {
  venue: string;
  event_date: string;
  event_time: string;
  userCoords: { lat: number; lng: number } | null;
  nowMs?: number;
}): PresenceResult {
  const now = opts.nowMs ?? Date.now();
  const venueCoords = getVenueCoords(opts.venue);
  let distanceM: number | null = null;
  let withinDist = false;
  if (opts.userCoords) {
    distanceM = haversineM(opts.userCoords, venueCoords);
    withinDist = distanceM <= 150;
  }
  const evMs = eventInstantWAT(opts.event_date, opts.event_time);
  const diffMin = Math.abs(now - evMs) / 60000;
  const withinTime = diffMin <= 30;
  const isWitness = withinDist && withinTime;
  const award = isWitness ? 1.0 : 0.3;
  const label = isWitness ? "Witness" : "Remote";
  return { isWitness, distanceM, timeDiffMin: diffMin, award, label };
}

export function requestGeolocation(timeoutMs = 5000): Promise<{ lat: number; lng: number } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) { done = true; resolve(null); }
    }, timeoutMs);
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (done) return;
          done = true; clearTimeout(timer);
          resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        () => {
          if (done) return;
          done = true; clearTimeout(timer);
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: timeoutMs - 200, maximumAge: 0 }
      );
    } catch {
      if (!done) { done = true; clearTimeout(timer); resolve(null); }
    }
  });
}

// persist presence history for UI streak
export function persistPresence(entry: { eventId: string; isWitness: boolean; award: number }) {
  try {
    const raw = localStorage.getItem("physi_presence_hist");
    let arr: any[] = [];
    if (raw) { try { arr = JSON.parse(raw); if (!Array.isArray(arr)) arr=[]; } catch {} }
    arr.push({ ...entry, at: Date.now() });
    if (arr.length > 50) arr = arr.slice(-50);
    localStorage.setItem("physi_presence_hist", JSON.stringify(arr));
    // also track score totals
    const totalW = Number(localStorage.getItem("physi_presence_score") || "0") || 0;
    localStorage.setItem("physi_presence_score", String(totalW + entry.award));
  } catch {}
}

export function getPresenceScore(): number {
  try { return Number(localStorage.getItem("physi_presence_score") || "0") || 0; } catch { return 0; }
}
