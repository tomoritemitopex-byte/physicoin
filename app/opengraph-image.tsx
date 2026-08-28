import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "PHYSI — A live timetable, built by the students who use it";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#070a12",
          padding: 48,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              fontWeight: 900,
              color: "#0f172a",
              letterSpacing: -1,
            }}
          >
            PHYSI
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 13, letterSpacing: 4, color: "#64748b", fontWeight: 600 }}>PILOT — TESTING NOW</span>
            <span style={{ fontSize: 14, color: "#94a3b8" }}>Not official · TEST-PHYSI, no cash value</span>
          </div>
          <div
            style={{
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
              gap: 8,
              border: "1px solid rgba(255,255,255,0.1)",
              background: "rgba(255,255,255,0.04)",
              borderRadius: 999,
              padding: "8px 16px",
              fontSize: 12,
              color: "#94a3b8",
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: 999, background: "#34d399" }} />
            Preview
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 64, fontWeight: 800, color: "white", lineHeight: 1, letterSpacing: -2 }}>
            A live timetable,
          </div>
          <div style={{ fontSize: 64, fontWeight: 800, color: "#94a3b8", lineHeight: 1, letterSpacing: -2 }}>
            built by the students who use it.
          </div>
          <div style={{ fontSize: 20, color: "#64748b", maxWidth: 640, marginTop: 8 }}>
            Share what you hear, confirm what you see. The more of us who use it, the more accurate it gets.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12, color: "#475569", letterSpacing: 2 }}>
          <span>10 BASE</span>
          <span>·</span>
          <span>× LEVEL</span>
          <span>·</span>
          <span>24H</span>
          <span style={{ marginLeft: "auto", letterSpacing: 1 }}>PHYSI · Pilot · Advisory only</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
