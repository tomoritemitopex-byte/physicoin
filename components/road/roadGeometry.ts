import { BUILDINGS } from "@/lib/campus";

/**
 * roadGeometry — pure shared module (no "use client", no hooks).
 * Single source of truth for the serpentine campus road.
 * Imported by WindingRoadStatic (Server Component, SSR HTML) and
 * WindingRoad (Client Component, interactive overlay) so both agree
 * on node positions and the SVG path.
 */

export const ROAD_WIDTH = 18;
export const ROAD_STROKE = 3;

/* ── Serpentine road path control points (percent coords, viewBox 0 0 100 1000) ── */
export const NODE_POSITIONS: Record<string, { x: number; y: number }> = {
  anat:    { x: 14,  y: 120 },
  phys:    { x: 50,  y: 200 },
  biochem: { x: 86,  y: 320 },
  mbbs:    { x: 50,  y: 440 },
  pharm:   { x: 14,  y: 560 },
  commed:  { x: 86,  y: 680 },
  nursing: { x: 50,  y: 800 },
  lab:     { x: 14,  y: 920 },
};

export const CLOCK_TOWER_POS = { x: 50, y: 440 };

export function buildSvgPath(nodeIds: string[]): string {
  const pts = nodeIds
    .map((id) => NODE_POSITIONS[id])
    .filter(Boolean)
    .sort((a, b) => a.y - b.y);
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1], cur = pts[i];
    const cpx = (prev.x + cur.x) / 2;
    d += ` C ${cpx} ${prev.y}, ${cpx} ${cur.y}, ${cur.x} ${cur.y}`;
  }
  return d;
}

/** Buildings in road order (top → bottom). Unknown ids sort last. */
export function orderedBuildings() {
  return BUILDINGS.slice().sort(
    (a, b) => (NODE_POSITIONS[a.id]?.y ?? 9999) - (NODE_POSITIONS[b.id]?.y ?? 9999)
  );
}

/** The serpentine path through every known building node. */
export function roadSvgPath(): string {
  return buildSvgPath(orderedBuildings().map((b) => b.id));
}
