"use client";

import { useEffect, useState } from "react";

export default function SplashScreen({
  onReady,
}: {
  onReady: () => void;
}) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // Minimum 800ms so it doesn't flash on instant loads
    const t = setTimeout(() => {
      setVisible(false);
      // Let fade-out animation play before unmounting
      const t2 = setTimeout(onReady, 300);
      return () => clearTimeout(t2);
    }, 800);
    return () => clearTimeout(t);
  }, [onReady]);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-[#0d3b2a] transition-opacity duration-300 ${
        visible ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
    >
      <div className="flex flex-col items-center gap-6 text-center">
        {/* Pulsing logo */}
        <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-[#34d399] text-[18px] font-black text-[#022c1e] shadow-[0_0_40px_rgba(52,211,153,0.5)]">
          <span>PHYSI</span>
          <div className="absolute -inset-1 rounded-2xl bg-[#34d399] opacity-30 blur-xl animate-pulse" />
        </div>

        {/* Tagline with shimmer */}
        <div className="space-y-1">
          <p className="font-mono text-xs tracking-[0.2em] text-[rgba(240,253,244,0.50)]">
            Student-powered · live
          </p>
          <p className="text-lg font-medium text-[#f0fdf4]">
            Never trek to the wrong hall again.
          </p>
        </div>

        {/* Loading dots */}
        <div className="flex items-center gap-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-1 w-1 rounded-full bg-[#34d399]"
              style={{
                animation: `pulse 1.4s ease-in-out ${i * 0.16}s infinite both`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
