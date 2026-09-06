import { BUILDINGS } from "@/lib/campus";

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

const orderedBuildings = BUILDINGS.slice().sort(
  (a, b) => (NODE_POSITIONS[a.id]?.y ?? 0) - (NODE_POSITIONS[b.id]?.y ?? 0)
);
const svgPath = buildSvgPath(orderedBuildings.map((b) => b.id));

/**
 * Mini campus preview — Server Component.
 * Elvenar-inspired parchment + jewel-tone aesthetic.
 * Renders SVG + nodes in initial HTML (no client JS needed).
 */
export default function CampusPreview() {
  return (
    <div className="relative mx-auto max-w-sm overflow-hidden rounded-[16px] border border-[#c5a059]/30 bg-[#f7f5ef]">
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
            <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="rgba(197,160,89,0.6)" />
          </filter>
          <filter id="jewel-bevel">
            <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="rgba(0,0,0,0.4)" />
          </filter>
          <radialGradient id="jewel-inner" cx="30%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.4" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
        </defs>

        {/* Road — burnished gold ribbon */}
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

        {/* Building nodes — jewel-tone ellipses with gold bezels */}
        {orderedBuildings.map((b) => {
          const pos = NODE_POSITIONS[b.id];
          return (
            <g key={b.id}>
              <ellipse
                cx={pos.x}
                cy={pos.y}
                rx="14"
                ry="16"
                fill={b.color}
                stroke="#c5a059"
                strokeWidth={1.5}
                aria-label={`${b.label} — ${b.code}. Tap to enter map`}
                role="img"
              />
              <ellipse
                cx={pos.x}
                cy={pos.y}
                rx="14"
                ry="16"
                fill="url(#jewel-inner)"
                strokeWidth="0"
              />
              <text
                x={pos.x}
                y={pos.y + 18}
                textAnchor="middle"
                fontSize="8"
                fontWeight="700"
                fill="#1a1208"
                fontFamily="'Instrument Serif', system-serif"
              >
                {b.code}
              </text>
            </g>
          );
        })}

        {/* Clock tower */}
        <g>
          <path
            d={`M ${CLOCK_TOWER_POS.x - 8} ${CLOCK_TOWER_POS.y - 2}
               L ${CLOCK_TOWER_POS.x - 6} ${CLOCK_TOWER_POS.y - 6}
               L ${CLOCK_TOWER_POS.x + 6} ${CLOCK_TOWER_POS.y - 6}
               L ${CLOCK_TOWER_POS.x + 8} ${CLOCK_TOWER_POS.y - 2} Z`}
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
          <text
            x={CLOCK_TOWER_POS.x}
            y={CLOCK_TOWER_POS.y + 6}
            textAnchor="middle"
            fontSize="2.6"
            fontWeight="700"
            fill="#c5a059"
            fontFamily="'Instrument Serif', system-serif"
          >
            300L
          </text>
        </g>

        {/* Click hint */}
        <text
          x="50"
          y="680"
          textAnchor="middle"
          fontSize="2.8"
          fontWeight="700"
          fill="#4a3f2a"
          fontFamily="monospace"
        >
          Map · List inside — tap jewels to verify
        </text>
      </svg>
    </div>
  );
}
