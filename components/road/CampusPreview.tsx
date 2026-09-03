"use client";
import React, { useMemo } from "react";
import { BUILDINGS } from "@/lib/campus";

/**
 * Mini preview of the WindingRoad campus for the landing page.
 * Shows the serpentine road with building nodes — mirrors the campus
 * from the user's image (Anatomy, Physiology, Biochemistry, Medicine,
 * Pharmacology, etc.) as tappable dots along a candy path.
 * Pure presentational — no DB, no interactivity beyond hover labels.
 */

const NODE_POSITIONS: Record<string, { x: number; y: number }> = {
  phys:  { x: 50,  y: 60  },
  mbbs:  { x: 18,  y: 196 },
  pharm: { x: 82,  y: 196 },
  dpt:   { x: 18,  y: 332 },
  bnsc:  { x: 82,  y: 332 },
  bmls:  { x: 50,  y: 468 },
  nutr:  { x: 18,  y: 604 },
  it:    { x: 82,  y: 604 },
};

const CLOCK_TOWER_POS = { x: 50, y: 468 };

function buildSvgPath(nodeIds: string[]): string {
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

export default function CampusPreview() {
  const [hoveredId, setHoveredId] = React.useState<string | null>(null);

  const orderedBuildings = useMemo(
    () => BUILDINGS.slice().sort((a, b) => (NODE_POSITIONS[a.id]?.y ?? 0) - (NODE_POSITIONS[b.id]?.y ?? 0)),
    []
  );
  const svgPath = useMemo(() => buildSvgPath(orderedBuildings.map((b) => b.id)), [orderedBuildings]);

  return (
    <div className="relative mx-auto max-w-md rounded-[20px] border border-[rgba(52,211,153,0.15)] bg-[#1a5f48]/80 p-1 shadow-[0_16px_48px_rgba(2,44,30,0.45)] backdrop-blur-xl">
      <svg
        className="road-svg"
        viewBox="0 0 100 720"
        preserveAspectRatio="xMidYMid slice"
        style={{ height: "480px", width: "100%" }}
        aria-hidden="true"
        role="img"
        aria-label="Campus map preview — serpentine road through 8 department buildings"
      >
        <defs>
          <filter id="road-shadow-mini">
            <feDropShadow dx="0" dy="3" stdDeviation="5" flood-color="rgba(2,44,30,0.45)" />
          </filter>
          <filter id="road-glow-mini">
            <feDropShadow dx="0" dy="0" stdDeviation="6" flood-color="rgba(52,211,153,0.35)" />
          </filter>
        </defs>

        {/* 3-layer forest depth (fixed) */}
        <rect x="0" y="480" width="100" height="240" fill="url(#forest-deep)" />
        <rect x="0" y="520" width="100" height="200" fill="url(#forest-mid)" />
        <rect x="0" y="560" width="100" height="160" fill="url(#forest-near)" />
        <defs>
          <linearGradient id="forest-deep" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(16,55,32,0.35)" />
            <stop offset="100%" stopColor="transparent" />
          </linearGradient>
          <linearGradient id="forest-mid" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(22,78,44,0.25)" />
            <stop offset="100%" stopColor="transparent" />
          </linearGradient>
          <linearGradient id="forest-near" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(34,110,60,0.18)" />
            <stop offset="100%" stopColor="transparent" />
          </linearGradient>
        </defs>

        {/* road — 3-layer: shadow, cream path, mint glow */}
        {svgPath && (
          <>
            <path
              d={svgPath}
              fill="none"
              stroke="#0d3b2a"
              strokeWidth={14}
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#road-shadow-mini)"
            />
            <path
              d={svgPath}
              fill="none"
              stroke="#f0fdf4"
              strokeWidth={8}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.75"
            />
            <path
              d={svgPath}
              fill="none"
              stroke="#34d399"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.5"
              filter="url(#road-glow-mini)"
            />
          </>
        )}

        {/* roadside grass wisps */}
        {orderedBuildings.slice(0, -1).map((b, i) => {
          const p1 = NODE_POSITIONS[b.id];
          const next = orderedBuildings[i + 1];
          const p2 = next ? NODE_POSITIONS[next.id] : p1;
          const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
          return (
            <React.Fragment key={i}>
              <path d={`M ${p1.x} ${p1.y + 1} Q ${mx} ${my + 2} ${p2.x} ${p2.y + 1}`} fill="none" stroke="rgba(52,211,153,0.06)" strokeWidth="1" />
              <path d={`M ${p1.x} ${p1.y - 0.5} Q ${mx} ${my - 1} ${p2.x} ${p2.y - 0.5}`} fill="none" stroke="rgba(134,239,172,0.04)" strokeWidth="0.8" />
            </React.Fragment>
          );
        })}

        {/* Building nodes */}
        {orderedBuildings.map((b) => {
          const pos = NODE_POSITIONS[b.id];
          const hovered = hoveredId === b.id;
          return (
            <g key={b.id}>
              <circle
                cx={pos.x}
                cy={pos.y}
                r={hovered ? 5.2 : 4.2}
                fill={b.color}
                stroke="rgba(240,253,244,0.6)"
                strokeWidth="1.5"
                style={{ transition: "r 180ms ease, filter 180ms ease" }}
                filter={hovered ? "url(#road-glow-mini)" : undefined}
              />
              <text
                x={pos.x}
                y={pos.y + 1.2}
                textAnchor="middle"
                fontSize="3.2"
                fontWeight="700"
                fill="rgba(240,253,244,0.6)"
                fontFamily="var(--font-fredoka), system-ui, sans-serif"
              >
                {b.code}
              </text>
              {/* hover label */}
              {hovered && (
                <text
                  x={pos.x}
                  y={pos.y - 10}
                  textAnchor="middle"
                  fontSize="2.8"
                  fontWeight="700"
                  fill="rgba(240,253,244,0.9)"
                  fontFamily="var(--font-fredoka), system-ui, sans-serif"
                >
                  {b.label}
                </text>
              )}
            </g>
          );
        })}

        {/* Clock tower milestone */}
        <g>
          <circle cx={CLOCK_TOWER_POS.x} cy={CLOCK_TOWER_POS.y} r="5" fill="rgba(251,191,36,0.85)" stroke="rgba(251,191,36,0.4)" strokeWidth="1.5" />
          <text
            x={CLOCK_TOWER_POS.x}
            y={CLOCK_TOWER_POS.y + 1.2}
            textAnchor="middle"
            fontSize="2.6"
            fontWeight="700"
            fill="rgba(251,191,36,0.7)"
            fontFamily="var(--font-fredoka), system-ui, sans-serif"
          >
            ⏛
          </text>
        </g>
      </svg>

      {/* Hover hint */}
      {hoveredId && (
        <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 rounded-full border border-[rgba(52,211,153,0.2)] bg-[#022c1e]/80 px-3 py-1 font-mono text-[10px] text-[#34d399]">
          Tap to enter → {hoveredId}
        </div>
      )}
    </div>
  );
}
