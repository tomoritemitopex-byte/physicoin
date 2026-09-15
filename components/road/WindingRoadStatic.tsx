import { ROAD_WIDTH, ROAD_STROKE, CLOCK_TOWER_POS, roadSvgPath } from "./roadGeometry";

/**
 * WindingRoadStatic — Server Component (no "use client").
 * Renders the campus sky, the serpentine road SVG and the clock tower
 * into the initial HTML so View-Source contains `<path d="M ...">`
 * without running any JavaScript.
 *
 * Interactive layers (building nodes, panels, event feed, ghosts)
 * live in WindingRoad.tsx (Client Component) and overlay this scene.
 */
export default function WindingRoadStatic() {
  const svgPath = roadSvgPath();

  return (
    <>
      {/* ── Campus sky + lawn depth layers ── */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden" aria-hidden="true">
        <div className="absolute inset-0 bg-gradient-to-b from-sky via-sky-2 to-green-50" />
        <div className="absolute bottom-0 left-0 w-[140%] h-[35%] rounded-b-[50%] opacity-40" style={{ background: "linear-gradient(to top, #15803d, transparent)", filter: "blur(1px)", transform: "translateX(-20%)", }} />
      </div>

      {/* ── Road SVG ── */}
      <svg className="road-svg" viewBox="0 0 100 1000" preserveAspectRatio="xMidYMid slice" style={{ minHeight: "100vh" }} role="img" aria-label="Campus road with 8 department buildings">
        <defs>
          <filter id="road-shadow"><feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="rgba(12,30,58,0.35)" /></filter>
          <filter id="road-glow"><feDropShadow dx="0" dy="0" stdDeviation="8" flood-color="rgba(3,105,161,0.35)" /></filter>
        </defs>
        {svgPath && (
          <>
            <path d={svgPath} fill="none" stroke="#0c1e3a" strokeWidth={ROAD_WIDTH} strokeLinecap="round" strokeLinejoin="round" filter="url(#road-shadow)" />
            <path d={svgPath} fill="none" stroke="#ffffff" strokeWidth={ROAD_WIDTH + ROAD_STROKE} strokeLinecap="round" strokeLinejoin="round" opacity="0.6" />
            <path d={svgPath} fill="none" stroke="#0369a1" strokeWidth={ROAD_STROKE} strokeLinecap="round" strokeLinejoin="round" opacity="0.7" filter="url(#road-glow)" />
          </>
        )}
      </svg>

      {/* ── Clock tower milestone — MBBS landmark ── */}
      <div className="clock-tower" style={{ left: `${CLOCK_TOWER_POS.x}%`, top: `${CLOCK_TOWER_POS.y}%`, position: "absolute", zIndex: 25 }}>
        <div className="tower-icon" role="img" aria-label="MBBS clock tower">🕛</div>
        <span className="tower-label">MBBS · clock tower</span>
      </div>
    </>
  );
}
