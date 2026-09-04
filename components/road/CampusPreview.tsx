"use client";
import React, { useMemo } from "react";
import { BUILDINGS } from "@/lib/campus";

/**
 * Mini campus preview — matches the PHYST mobile interface aesthetic.
 * Deep forest green (#0d3b2a) background, mint-green glowing path
 * shaped like a "7", building nodes as simple rounded dots with
 * department codes, DNA helix node icon as central milestone.
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
    <div className="relative mx-auto max-w-sm overflow-hidden rounded-[16px] border border-[rgba(52,211,153,0.15)] bg-[#0d3b2a] shadow-[0_16px_48px_rgba(2,44,30,0.55)]">
      <svg
        className="road-svg block"
        viewBox="0 0 100 720"
        preserveAspectRatio="xMidYMid slice"
        style={{ height: "400px", width: "100%" }}
        role="img"
        aria-label="Campus road — department buildings along a winding path"
      >
        <defs>
          <filter id="road-glow-mini">
            <feDropShadow dx="0" dy="0" stdDeviation="8" flood-color="rgba(52,211,153,0.5)" />
          </filter>
          <filter id="node-glow-mini">
            <feDropShadow dx="0" dy="0" stdDeviation="5" flood-color="rgba(251,191,36,0.5)" />
          </filter>
        </defs>

        {/* Deep green background — no hex grid, no parchment, clean */}
        <rect x="0" y="0" width="100" height="720" fill="#0d3b2a" />

        {/* Subtle radial glow at top for depth */}
        <radialGradient id="top-glow" cx="50%" cy="0%" r="60%">
          <stop offset="0%" stopColor="rgba(26,95,72,0.15)" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <rect x="0" y="0" width="100" height="200" fill="url(#top-glow)" />

        {/* road — mint-green glowing path ("7" shape) */}
        {svgPath && (
          <>
            {/* glow layer */}
            <path
              d={svgPath}
              fill="none"
              stroke="rgba(52,211,153,0.2)"
              strokeWidth={20}
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#road-glow-mini)"
              opacity="0.8"
            />
            {/* main path */}
            <path
              d={svgPath}
              fill="none"
              stroke="#34d399"
              strokeWidth={10}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.9"
            />
            {/* inner highlight */}
            <path
              d={svgPath}
              fill="none"
              stroke="#f0fdf4"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.7"
            />
          </>
        )}

        {/* Building nodes — simple rounded dots with codes */}
        {orderedBuildings.map((b) => {
          const pos = NODE_POSITIONS[b.id];
          const hovered = hoveredId === b.id;
          return (
            <g key={b.id}>
              <rect
                x={pos.x - 6}
                y={pos.y - 6}
                width="12"
                height="12"
                rx="4"
                ry="4"
                fill={b.color}
                stroke={hovered ? "#fbbf24" : "rgba(240,253,244,0.3)"}
                strokeWidth={hovered ? "1.5" : "1"}
                filter={hovered ? "url(#node-glow-mini)" : undefined}
                style={{ transition: "all 180ms ease", cursor: "pointer" }}
                onMouseEnter={() => setHoveredId(b.id)}
                onMouseLeave={() => setHoveredId(null)}
                onFocus={() => setHoveredId(b.id)}
                onBlur={() => setHoveredId(null)}
                onClick={() => (window.location.href = "/app/roadmap")}
                tabIndex={0}
                role="button"
                aria-label={`${b.label} — ${b.code}. Tap to enter map`}
              />
              {/* Department code below node */}
              <text
                x={pos.x}
                y={pos.y + 10}
                textAnchor="middle"
                fontSize="7"
                fontWeight="700"
                fill="rgba(240,253,244,0.6)"
                fontFamily="var(--font-fredoka), system-ui, sans-serif"
              >
                {b.code}
              </text>
              {/* Hover label */}
              {hovered && (
                <text
                  x={pos.x}
                  y={pos.y - 8}
                  textAnchor="middle"
                  fontSize="2.2"
                  fontWeight="700"
                  fill="#fbbf24"
                  fontFamily="var(--font-fredoka), system-ui, sans-serif"
                >
                  {b.label}
                </text>
              )}
            </g>
          );
        })}

        {/* Clock tower — DNA helix node (central milestone) */}
        <g>
          <rect
            x={CLOCK_TOWER_POS.x - 4}
            y={CLOCK_TOWER_POS.y - 11}
            width="8"
            height="14"
            rx="2"
            ry="2"
            fill="rgba(26,95,72,0.9)"
            stroke="rgba(251,191,36,0.5)"
            strokeWidth="1.5"
          >
            <animate
              attributeName="stroke-width"
              values="1.5;2.5;1.5"
              dur="3s"
              repeatCount="indefinite"
            />
          </rect>
          {/* DNA helix inside the tower card */}
          <path
            d={`M ${CLOCK_TOWER_POS.x - 1.5} ${CLOCK_TOWER_POS.y - 9} C ${CLOCK_TOWER_POS.x - 1.5} ${CLOCK_TOWER_POS.y - 2} ${CLOCK_TOWER_POS.x + 1.5} ${CLOCK_TOWER_POS.y - 2} ${CLOCK_TOWER_POS.x + 1.5} ${CLOCK_TOWER_POS.y + 4}`}
            fill="none"
            stroke="#ec4899"
            strokeWidth="1"
            opacity="0.8"
          />
          <path
            d={`M ${CLOCK_TOWER_POS.x + 1.5} ${CLOCK_TOWER_POS.y - 9} C ${CLOCK_TOWER_POS.x + 1.5} ${CLOCK_TOWER_POS.y - 2} ${CLOCK_TOWER_POS.x - 1.5} ${CLOCK_TOWER_POS.y - 2} ${CLOCK_TOWER_POS.x - 1.5} ${CLOCK_TOWER_POS.y + 4}`}
            fill="none"
            stroke="#06b6d4"
            strokeWidth="1"
            opacity="0.8"
          />
          {/* tower label */}
          <text
            x={CLOCK_TOWER_POS.x}
            y={CLOCK_TOWER_POS.y + 6}
            textAnchor="middle"
            fontSize="2"
            fontWeight="700"
            fill="rgba(251,191,36,0.7)"
            fontFamily="var(--font-fredoka), system-ui, sans-serif"
          >
            300L
          </text>
        </g>
      </svg>

      {/* Footer note — matches PHYST style */}
      <div className="border-t border-[rgba(52,211,153,0.1)] bg-[#022c1e]/40 px-3 py-2 text-center">
        <span className="font-mono text-[10px] text-[rgba(240,253,244,0.45)]">Map · List inside — tap nodes to verify</span>
      </div>

      {/* Hover hint */}
      {hoveredId && (
        <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 rounded-full border border-[rgba(52,211,153,0.2)] bg-[#022c1e]/80 px-3 py-1 font-mono text-[10px] text-[#34d399]">
          Tap to enter → {hoveredId}
        </div>
      )}
    </div>
  );
}
