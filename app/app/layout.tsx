"use client";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

const TABS = [
  { href: "/app/timetable", label: "Timetable", short: "TT" },
  { href: "/app/verify", label: "Verify", short: "✓" },
  { href: "/app/mining", label: "Check-in", short: "In" },
  { href: "/app/roadmap", label: "Roadmap", short: "Map" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", on);
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <div className="min-h-screen bg-[#070a12] text-slate-200 selection:bg-white selection:text-[#070a12]">
      {/* subtle ambient */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[#070a12]" />
        <div className="absolute -top-[30vh] left-1/2 h-[70vh] w-[110vw] -translate-x-1/2 rounded-[100%] bg-white/[0.025] blur-[80px]" />
        <div className="absolute top-[18vh] left-[8%] h-64 w-64 rounded-full bg-emerald-500/10 blur-[90px]" />
        <div className="absolute top-[45vh] right-[10%] h-72 w-72 rounded-full bg-indigo-500/10 blur-[90px]" />
      </div>

      <header
        className={`sticky top-0 z-40 border-b transition-all ${
          scrolled ? "border-white/[0.09] bg-[#070a12]/85 backdrop-blur-[14px]" : "border-white/[0.05] bg-[#070a12]/60 backdrop-blur-[10px]"
        }`}
      >
        <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <a
              href="/"
              className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-white text-[10px] font-black tracking-[-0.04em] text-[#0a0f1e] shadow-[0_1px_12px_rgba(255,255,255,0.18)]"
            >
              PHYSI
            </a>
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.04] px-2.5 py-1 font-mono text-[10px] font-medium tracking-[0.08em] text-slate-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
              INSIDE
            </span>
          </div>

          <nav className="flex items-center gap-1 rounded-full border border-white/[0.07] bg-white/[0.035] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            {TABS.map((t) => {
              const active = pathname === t.href || pathname?.startsWith(t.href + "/");
              return (
                <a
                  key={t.href}
                  href={t.href}
                  className={`relative rounded-full px-3 py-[6px] text-[13px] font-medium transition sm:px-[14px] ${
                    active
                      ? "bg-white text-[#0a0f1e] shadow-[0_2px_10px_rgba(255,255,255,0.12)]"
                      : "text-slate-400 hover:text-white hover:bg-white/[0.06]"
                  }`}
                >
                  <span className="hidden sm:inline">{t.label}</span>
                  <span className="sm:hidden">{t.short}</span>
                </a>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <a
              href="/app/profile"
              className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.05] px-3 py-1.5 text-[13px] font-medium text-slate-200 backdrop-blur hover:bg-white/[0.09] transition"
            >
              <span className="hidden sm:inline">Profile</span>
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-[11px] font-bold text-[#0a0f1e]">◯</span>
            </a>
          </div>
        </div>
        {/* advisory strip */}
        <div className="border-t border-amber-400/10 bg-amber-400/[0.04]">
          <div className="mx-auto max-w-[1240px] px-4 py-[6px] sm:px-6 lg:px-8">
            <p className="text-center font-mono text-[10.5px] leading-3 tracking-wide text-amber-200/70">
              advisory feed — green tick means your coursemates confirmed it · always double-check exams with your department
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1240px] px-4 py-5 sm:px-6 sm:py-6 lg:px-8">{children}</div>

      <footer className="mx-auto max-w-[1240px] px-4 pb-10 pt-6 sm:px-6 lg:px-8">
        <p className="text-center font-mono text-[10.5px] text-slate-600">
          PHYSI · built by students, for students · TEST-PHYSI has no cash value — expires in 24h · advisory only
        </p>
      </footer>
    </div>
  );
}
