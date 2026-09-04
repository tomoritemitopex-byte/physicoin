"use client";

import { useEffect, useState } from "react";

export default function SplashScreen({
  onReady,
}: {
  onReady: () => void;
}) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(false);
      const t2 = setTimeout(onReady, 300);
      return () => clearTimeout(t2);
    }, 800);
    return () => clearTimeout(t);
  }, [onReady]);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-300 ${
        visible ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
      style={{
        background: "radial-gradient(ellipse at center, rgba(247,245,239,0.06), transparent 70%)",
      }}
    >
      <div className="relative flex flex-col items-center gap-7 text-center">
        {/* Gold medallion with parchment vignette */}
        <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-[#f7f5ef] to-[#c5a059] border-[3px] border-[#8a6d2b] shadow-[0_0_0_1px_#fbbf24,0_12px_32px_rgba(0,0,0,0.45)]">
          <span className="font-display text-2xl font-bold text-[#1a1208]" style={{ fontFamily: "'Instrument Serif', system-serif" }}>
            PHYSI
          </span>
          <div className="absolute -inset-1 rounded-full bg-[#c5a059] opacity-20 blur-xl" />
        </div>

        {/* Tagline */}
        <div className="space-y-1">
          <p className="font-mono text-xs tracking-[0.2em] text-[rgba(240,253,244,0.45)]">
            Student-powered · live
          </p>
          <p className="text-lg font-medium text-[#f0fdf4]">
            Never trek to the wrong hall again.
          </p>
        </div>

        {/* Shimmer loading bar - single gold underline */}
        <div className="relative h-0.5 w-24 overflow-hidden rounded-full bg-[#4a3f2a]/40">
          <div className="shimmer absolute inset-0 w-full h-full" style={{
            background: "linear-gradient(90deg, transparent, #c5a059, transparent)",
            animation: "shimmer 1.8s infinite",
          }} />
        </div>
      </div>
    </div>
  );
}
