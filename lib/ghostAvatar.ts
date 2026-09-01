/**
 * lib/ghostAvatar.ts — Ephemeral anonymous avatar system
 * Pure UI drift: no DB writes. Each verification => new ghost form.
 * Ghost morphs via CSS only; seed is ephemeral state, never persisted.
 */

export type GhostForm = {
  id: string;
  bg: string;
  fg: string;
  eye: "oo" | "^-^" | "◉◉" | "··" | "◐◑";
  shape: "round" | "wavy" | "pointy" | "blob";
  hue: number;
  scale: number;
  wobbleMs: number;
  drift: number;
};

const PALETTE = [
  { bg: "#065f46", fg: "#10b981" },
  { bg: "#0c4a6e", fg: "#0ea5e9" },
  { bg: "#4c1d95", fg: "#34d399" },
  { bg: "#78350f", fg: "#f59e0b" },
  { bg: "#831843", fg: "#ec4899" },
  { bg: "#164e63", fg: "#06b6d4" },
  { bg: "#365314", fg: "#84cc16" },
  { bg: "#881337", fg: "#f43f5e" },
  { bg: "#1e293b", fg: "#94a3b8" },
  { bg: "#422006", fg: "#fbbf24" },
];

const EYES: GhostForm["eye"][] = ["oo", "^-^", "◉◉", "··", "◐◑"];
const SHAPES: GhostForm["shape"][] = ["round", "wavy", "pointy", "blob"];

function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function ghostForSeed(seed: string | number, salt = 0): GhostForm {
  const s = String(seed) + ":" + salt;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  const r = mulberry32(h >>> 0);
  const pal = PALETTE[Math.floor(r() * PALETTE.length)];
  const eye = EYES[Math.floor(r() * EYES.length)];
  const shape = SHAPES[Math.floor(r() * SHAPES.length)];
  const hue = Math.floor(r() * 360);
  const scale = 0.92 + r() * 0.22;
  const wobbleMs = 900 + Math.floor(r() * 900);
  const drift = (r() - 0.5) * 8;
  return { id: `g-${h.toString(16).slice(0, 6)}-${salt}`, bg: pal.bg, fg: pal.fg, eye, shape, hue, scale, wobbleMs, drift };
}

export function ghostsForCount(count: number, epoch: number): GhostForm[] {
  const n = Math.max(0, Math.min(12, count));
  return Array.from({ length: n }, (_, i) => ghostForSeed(`c${count}-i${i}`, epoch + i * 7919));
}

/** ephemeral drift: call with Date.now() tick to get new forms — no persistence */
export function driftGhosts(prev: GhostForm[], tick: number): GhostForm[] {
  return prev.map((g, i) => ghostForSeed(g.id, tick + i * 1013));
}
