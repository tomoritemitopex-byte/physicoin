"use client";
import React, { useMemo } from "react";
import { BUILDINGS } from "@/lib/campus";

/**
 * Mini campus preview — Elvenar-inspired parchment + jewel-tone aesthetic.
 * Deep parchment (#f7f5ef) background, burnished gold (#c5a059) road ribbon,
 * building nodes as jewel-tone ellipses with gold bezels.
 */

const NODE_POSITIONS: Record<string, { x: number; y: number }> = {
  phys:  { x: 50,  y: 76  },
  mbbs:  { x: 18,  y: 212 },
  pharm: { x: 82,  y: 212 },
  dpt:   { x: 18,  y: 364 },
  bnsc:  { x: 82,  y: 364 },
  bmls:  { x: 50,  y: 516 },
  nutr:  { x: 18,  y: 668 },
  it:    { x: 82,  y: 668 },
};

const CLOCK_TOWER_POS = { x: 50, y: 516 };

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
    <div className="relative mx-auto max-w-sm overflow-hidden rounded-[16px] border border-[#c5a059]/30 bg-[#f7f5ef] shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_12px_28px_rgba(13,30,20,0.35),0_0_0_1.5px_#c5a059]">
      <svg
        className="road-svg block"
        viewBox="0 0 100 720"
        preserveAspectRatio="xMidYMid slice"
        style={{ height: "400px", width: "100%" }}
        role="img"
        aria-label="Campus road — department jewels along a gilded path"
      >
        <defs>
          <filter id="road-glow-mini">
            <feDropShadow dx="0" dy="0" stdDeviation="4" flood-color="rgba(197,160,89,0.6)" />
          </filter>
          <filter id="jewel-bevel">
            <feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="rgba(0,0,0,0.4)" />
          </filter>
          <radialGradient id="jewel-inner" cx="30%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.4" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
          <radialGradient id="parchment-fill" cx="50%" cy="0%" r="70%">
            <stop offset="0%" stopColor="#f7f5ef" stopOpacity="1" />
            <stop offset="100%" stopColor="#ede9df" stopOpacity="0.95" />
          </radialGradient>
        </defs>

        {/* Parchment background with subtle noise */}
        <rect x="0" y="0" width="100" height="720" fill="url(#parchment-fill)" />
        <rect x="0" y="0" width="100" height="720" fill="rgba(247,245,239,0.06)" />

        {/* Road - burnished gold ribbon */}
        {svgPath && (
          <path
            d={svgPath}
            fill="none"
            stroke="#d8cbb0"
            strokeWidth={16}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.5"
          />
        )}
        {svgPath && (
          <path
            d={svgPath}
            fill="none"
            stroke="#c5a059"
            strokeWidth={8}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="4 6"
            filter="url(#road-glow-mini)"
            opacity="0.7"
          />
        )}

        {/* Building nodes - jewel-tone ellipses with gold bezels */}
        {orderedBuildings.map((b) => {
          const pos = NODE_POSITIONS[b.id];
          const hovered = hoveredId === b.id;
          return (
            <g key={b.id}>
              <ellipse
                cx={pos.x}
                cy={pos.y}
                rx="14"
                ry="16"
                fill={b.color}
                stroke={hovered ? "#fbbf24" : "#c5a059"}
                strokeWidth={hovered ? "2" : "1.5"}
                filter={hovered ? "url(#jewel-bevel)" : undefined}
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
              {/* Jewel inner highlight */}
              <ellipse
                cx={pos.x}
                cy={pos.y}
                rx="14"
                ry="16"
                fill="url(#jewel-inner)"
                strokeWidth="0"
              />
              {/* Department code below node */}
              <text
                x={pos.x}
                y={pos.y + 18}
                textAnchor="middle"
                fontSize="8"
                fontWeight="700"
                fill="#1a1208"
                fontFamily="'Instrument Serif', var(--font-display), system-serif"
              >
                {b.code}
              </text>
              {/* Hover label */}
              {hovered && (
                <text
                  x={pos.x}
                  y={pos.y - 10}
                  textAnchor="middle"
                  fontSize="2.4"
                  fontWeight="700"
                  fill="#c5a059"
                  fontFamily="'Instrument Serif', var(--font-display), system-serif"
                >
                  {b.label}
                </text>
              )}
            </g>
          );
        })}

        {/* Clock tower - milestone arch with gold roof */}
        <g>
          <path
            d={`M ${CLOCK_TOWER_POS.x - 8} ${CLOCK_TOWER_POS.y - 2}
               L ${CLOCK_TOWER_POS.x - 6} ${CLOCK_TOWER_POS.y - 6}
               L ${CLOCK_TOWER_POS.x + 6} ${CLOCK_TOWER_POS.y - 6}
               L ${CLOCK_TOWER_POS.x + 8} ${CLOCK_TOWER_POS.y - 2}
               Z`}
            fill="#c5a059"
            stroke="#8a6d2b"
            strokeWidth="1"
          />
          <rect
            x={CLOCK_TOWER_POS.x - 3}
            y={CLOCK_TOWER_POS.y - 2}
            width="6"
            height="10"
            rx="1"
            fill="#1a1208"
            stroke="rgba(197,160,89,0.5)"
            strokeWidth="1"
          />
          {/* tower label in serif */}
          <text
            x={CLOCK_TOWER_POS.x}
            y={CLOCK_TOWER_POS.y + 6}
            textAnchor="middle"
            fontSize="2.6"
            fontWeight="700"
            fill="#c5a059"
            fontFamily="'Instrument Serif', var(--font-display), system-serif"
          >
            300L
          </text>
        </g>
      </svg>

      {/* Footer - parchment strip */}
      <div className="border-t border-[#d8cbb0]/40 bg-[#ede9df]/60 px-3 py-2 text-center">
        <span className="font-mono text-[10px] text-[#4a3f2a]">Map · List inside — tap jewels to verify</span>
      </div>

      {/* Hover hint */}
      {hoveredId && (
        <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 rounded-full border border-[#c5a059]/30 bg-[#c5a059]/15 px-3 py-1 font-mono text-[10px] text-[#c5a059]">
          Tap to enter → {hoveredId}
        </div>
      )}
    </div>
  );
}
