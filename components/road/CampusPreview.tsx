"use client";
import React, { useMemo } from "react";
import { BUILDINGS } from "@/lib/campus";

/**
 * Mini campus preview — Elvenar style.
 * Parchment-textured hex grid over deep twilight with gold accents,
 * building nodes as ornate parchment cards, student foot-traffic
 * as small gold dots along the road.
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

function studentPositions(nodeIds: string[], count: number): { x: number; y: number }[] {
  const pts = nodeIds
    .map((id) => NODE_POSITIONS[id])
    .filter(Boolean)
    .sort((a, b) => a.y - b.y);
  if (pts.length < 2) return [];
  const totalLen = pts.length - 1;
  const result: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    const t = (i / (count - 1)) * totalLen;
    const idx = Math.floor(t);
    const frac = t - idx;
    const p1 = pts[idx];
    const p2 = pts[Math.min(idx + 1, pts.length - 1)];
    const x = p1.x + (p2.x - p1.x) * frac;
    const y = p1.y + (p2.y - p1.y) * frac;
    const offset = (i % 2 === 0) ? -0.8 : 0.8;
    result.push({ x: x + offset, y });
  }
  return result;
}

export default function CampusPreview() {
  const [hoveredId, setHoveredId] = React.useState<string | null>(null);

  const orderedBuildings = useMemo(
    () => BUILDINGS.slice().sort((a, b) => (NODE_POSITIONS[a.id]?.y ?? 0) - (NODE_POSITIONS[b.id]?.y ?? 0)),
    []
  );
  const svgPath = useMemo(() => buildSvgPath(orderedBuildings.map((b) => b.id)), [orderedBuildings]);
  const studentDots = useMemo(() => studentPositions(orderedBuildings.map((b) => b.id), 12), [orderedBuildings]);

  return (
    <div className="relative mx-auto max-w-md overflow-hidden rounded-[20px] border-2 border-[rgba(251,191,36,0.25)] bg-gradient-to-b from-[#0c1449] via-[#1a5f48] to-[#0d3b2a] p-1 shadow-[0_16px_48px_rgba(2,44,30,0.55)]">
      {/* Parchment texture overlay */}
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage: `
            radial-gradient(circle at 30% 30%, rgba(240,253,244,0.1) 1px, transparent 1px),
            radial-gradient(circle at 70% 70%, rgba(240,253,244,0.06) 1px, transparent 1px)
          `,
          backgroundSize: "8px 8px",
        }}
      />

      <svg
        className="road-svg"
        viewBox="0 0 100 720"
        preserveAspectRatio="xMidYMid slice"
        style={{ height: "480px", width: "100%" }}
        aria-hidden="true"
        role="img"
        aria-label="Campus hex map — serpentine road through 8 department towers"
      >
        <defs>
          <filter id="road-shadow-mini">
            <feDropShadow dx="0" dy="3" stdDeviation="5" flood-color="rgba(0,0,0,0.5)" />
          </filter>
          <filter id="road-glow-mini">
            <feDropShadow dx="0" dy="0" stdDeviation="8" flood-color="rgba(251,191,36,0.45)" />
          </filter>
          <filter id="building-shadow-mini">
            <feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="rgba(0,0,0,0.5)" />
          </filter>
          <filter id="hex-glow-mini">
            <feDropShadow dx="0" dy="0" stdDeviation="6" flood-color="rgba(251,191,36,0.3)" />
          </filter>

          {/* Hex grid background pattern */}
          <pattern id="hex-grid" x="0" y="0" width="8" height="7" patternUnits="userSpaceOnUse" patternTransform="scale(3.5)">
            <polygon
              points="4,0 8,3 4,6 0,3"
              fill="none"
              stroke="rgba(251,191,36,0.08)"
              strokeWidth="0.5"
            />
          </pattern>

          {/* Parchment texture for building cards */}
          <pattern id="parchment-texture" x="0" y="0" width="1" height="1" patternUnits="userSpaceOnUse">
            <rect width="1" height="1" fill="rgba(240,253,244,0.03)" />
            <path d="M0,0.3 Q0.5,0.2 1,0.3 T2,0.3" stroke="rgba(240,253,244,0.08)" strokeWidth="0.2" fill="none" />
          </pattern>

          {/* Gold gradient for building highlights */}
          <linearGradient id="gold-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#d4a72c" />
          </linearGradient>

          <linearGradient id="forest-deep" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(12,20,73,0.4)" />
            <stop offset="100%" stopColor="transparent" />
          </linearGradient>
        </defs>

        {/* Hex grid background */}
        <rect x="0" y="0" width="100" height="720" fill="url(#hex-grid)" opacity="0.4" />

        {/* 3-layer forest depth */}
        <rect x="0" y="420" width="100" height="300" fill="url(#forest-deep)" />

        {/* road — gold-accented mint glow over deep path */}
        {svgPath && (
          <>
            {/* shadow */}
            <path
              d={svgPath}
              fill="none"
              stroke="#0d3b2a"
              strokeWidth={16}
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#road-shadow-mini)"
            />
            {/* path base — dark green */}
            <path
              d={svgPath}
              fill="none"
              stroke="#0d3b2a"
              strokeWidth={11}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.9"
            />
            {/* road edge — cream */}
            <path
              d={svgPath}
              fill="none"
              stroke="#f0fdf4"
              strokeWidth={5}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.6"
            />
            {/* gold glow */}
            <path
              d={svgPath}
              fill="none"
              stroke="#fbbf24"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.5"
              filter="url(#road-glow-mini)"
            />
          </>
        )}

        {/* Student foot traffic — gold dots */}
        {studentDots.map((pos, i) => (
          <circle
            key={`student-${i}`}
            cx={pos.x}
            cy={pos.y - 0.8}
            r="0.8"
            fill="#fbbf24"
            opacity="0.8"
            filter="url(#road-glow-mini)"
          >
            <animate
              attributeName="opacity"
              values="0.5;0.9;0.5"
              dur={`${1.5 + (i % 3) * 0.5}s`}
              repeatCount="indefinite"
            />
          </circle>
        ))}

        {/* Building nodes — parchment tower cards with gold borders */}
        {orderedBuildings.map((b) => {
          const pos = NODE_POSITIONS[b.id];
          const hovered = hoveredId === b.id;
          const bw = 8;
          const bh = 12;
          const bx = pos.x - bw / 2;
          const by = pos.y - bh / 2;

          return (
            <g key={b.id}>
              {/* Parchment tower card */}
              <rect
                x={bx} y={by} width={bw} height={bh}
                rx="2" ry="2"
                fill="url(#parchment-texture)"
                stroke={hovered ? "#fbbf24" : "rgba(251,191,36,0.25)"}
                strokeWidth={hovered ? "2" : "1"}
                filter="url(#building-shadow-mini)"
                style={{ transition: "stroke-width 180ms ease, stroke 180ms ease" }}
              />
              {/* Inner shadow — window grid */}
              <rect
                x={bx + 0.6} y={by + 1.5} width={bw - 1.2} height={bh - 5}
                fill="rgba(251,191,36,0.08)"
                rx="1"
              />
              {/* Window dots — gold when hovered */}
              {Array.from({ length: 8 }).map((_, wi) => (
                <circle
                  key={wi}
                  cx={bx + 1.8 + (wi % 2) * 2.4}
                  cy={by + 2.5 + Math.floor(wi / 2) * 2.5}
                  r="0.6"
                  fill={hovered ? "#fbbf24" : "rgba(251,191,36,0.3)"}
                  opacity={hovered ? "0.9" : "0.5"}
                  style={{ transition: "fill 180ms ease, opacity 180ms ease" }}
                />
              ))}
              {/* Building icon — gold */}
              <text
                x={pos.x}
                y={by - 0.5}
                textAnchor="middle"
                fontSize="3.8"
                fontWeight="700"
                fill={hovered ? "#fbbf24" : "rgba(251,191,36,0.6)"}
              >
                {b.icon}
              </text>
              {/* Department code — below tower */}
              <text
                x={pos.x}
                y={by + bh + 3}
                textAnchor="middle"
                fontSize="2.8"
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
                  y={by + bh + 6}
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

        {/* Clock tower — central keep with gold trim */}
        <g>
          <rect
            x={CLOCK_TOWER_POS.x - 4.5}
            y={CLOCK_TOWER_POS.y - 11}
            width="9"
            height="14"
            rx="1.5"
            ry="1.5"
            fill="rgba(26,95,72,0.9)"
            stroke="rgba(251,191,36,0.5)"
            strokeWidth="2"
            filter="url(#building-shadow-mini)"
          >
            <animate
              attributeName="stroke-width"
              values="2;3;2"
              dur="3s"
              repeatCount="indefinite"
            />
          </rect>
          {/* clock face */}
          <circle cx={CLOCK_TOWER_POS.x} cy={CLOCK_TOWER_POS.y - 4} r="3" fill="rgba(240,253,244,0.9)" />
          <text x={CLOCK_TOWER_POS.x} y={CLOCK_TOWER_POS.y - 3.8} textAnchor="middle" fontSize="2.2" fontWeight="700" fill="#022c1e">
            ⏛
          </text>
          {/* gold banner on tower */}
          <rect
            x={CLOCK_TOWER_POS.x - 3}
            y={CLOCK_TOWER_POS.y + 4}
            width="6"
            height="2"
            fill="rgba(251,191,36,0.3)"
          />
          <text
            x={CLOCK_TOWER_POS.x}
            y={CLOCK_TOWER_POS.y + 5.3}
            textAnchor="middle"
            fontSize="2"
            fontWeight="700"
            fill="#fbbf24"
            fontFamily="var(--font-fredoka), system-ui, sans-serif"
          >
            300L
          </text>
        </g>
      </svg>

      {/* Hover hint */}
      {hoveredId && (
        <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 rounded-full border border-[rgba(251,191,36,0.3)] bg-[#022c1e]/80 px-3 py-1 font-mono text-[10px] text-[#fbbf24]">
          Tap to enter → {hoveredId}
        </div>
      )}
    </div>
  );
}
