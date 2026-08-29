"use client";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { listFeatures } from "@/lib/adapters/features";
import "@/lib/adapters";

// UI is adapter-driven: nav comes from FeatureAdapter registry — no hard-coded core
// Profile is separate CTA (not in main tabs); stats/health have no nav
// Bottom game nav: 2 big buttons Road + Timetable only — Verify/Mining are node actions
const ALL_TABS = listFeatures()
  .filter((f) => f.nav && f.id !== "profile")
  .map((f) => f.nav!);

// game nav only 2: Road (roadmap) + Timetable — still adapter-driven
const BOTTOM_TABS = listFeatures()
  .filter((f) => f.id === "roadmap" || f.id === "timetable")
  .map((f) => f.nav!)
  .filter(Boolean) as { href: string; label: string; short: string }[];

// label override: Roadmap -> Road for game feel
const GAME_LABELS: Record<string, string> = {
  "/app/roadmap": "Road",
  "/app/timetable": "Timetable",
};
const GAME_ICONS: Record<string, string> = {
  "/app/roadmap": "⬢",
  "/app/timetable": "▦",
};

const LABELS: Record<string, string> = {
  timetable: "Timetable",
  verify: "Verify",
  mining: "Check-in",
  roadmap: "Roadmap",
  profile: "Profile",
};

function Breadcrumb({ pathname }: { pathname: string | null }) {
  const seg = (pathname ?? "").split("/").filter(Boolean);
  const appIdx = seg.indexOf("app");
  const page = appIdx >= 0 ? seg[appIdx + 1] : undefined;
  const title = page ? LABELS[page] ?? page : "Dashboard";
  const isHome = !page;
  return (
    <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
      <div className="min-w-0">
        <h2 className="truncate text-[13px] font-semibold tracking-tight text-white sm:text-[15px]">{title}</h2>
        <ol className="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] leading-none">
          <li>
            <a href="/app/timetable" className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-300 transition">
              Home
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden className="opacity-60">
                <path d="M6 3.5L10 8L6 12.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          </li>
          {!isHome ? <li className="text-slate-300">{title}</li> : <li className="text-slate-500">overview</li>}
        </ol>
      </div>
      <div className="hidden shrink-0 items-center gap-2 sm:flex">
        <span className="rounded-full border border-white/[0.07] bg-white/[0.03] px-2.5 py-1 font-mono text-[10.5px] tracking-wide text-slate-400">advisory only</span>
        <span className="hidden items-center gap-1.5 rounded-full border border-emerald-400/15 bg-emerald-400/10 px-2.5 py-1 font-mono text-[10.5px] text-emerald-300 lg:inline-flex">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
          live
        </span>
      </div>
    </div>
  );
}

function BottomGameNav({ pathname }: { pathname: string | null }) {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 border-t border-white/[0.08] bg-[#070a12]/92 backdrop-blur-[20px] supports-[backdrop-filter]:bg-[#070a12]/85 shadow-[0_-8px_32px_rgba(0,0,0,0.5),0_-1px_0_rgba(255,255,255,0.05)_inset]">
      <div className="mx-auto flex max-w-[560px] items-center gap-2 px-3 py-2.5 sm:px-4 sm:py-3">
        {BOTTOM_TABS.map((t) => {
          const active = pathname === t.href || pathname?.startsWith(t.href + "/");
          const label = GAME_LABELS[t.href] ?? t.label;
          const icon = GAME_ICONS[t.href] ?? "●";
          return (
            <a
              key={t.href}
              href={t.href}
              className={`flex flex-1 items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-[15px] font-bold tracking-tight transition-all ${
                active
                  ? "bg-white text-[#070a12] shadow-[0_4px_20px_rgba(255,255,255,0.18),0_1px_0_rgba(255,255,255,0.6)_inset] scale-[1.02]"
                  : "border border-white/10 bg-white/[0.06] text-slate-200 hover:bg-white/[0.10] hover:text-white"
              }`}
            >
              <span className={`flex h-7 w-7 items-center justify-center rounded-full text-[13px] ${active ? "bg-[#070a12] text-white" : "bg-white text-[#070a12]"}`}>{icon}</span>
              {label}
            </a>
          );
        })}
      </div>
      <div className="h-[env(safe-area-inset-bottom)] bg-[#070a12]" />
    </nav>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const isProfile = pathname === "/app/profile" || pathname?.startsWith("/app/profile/");
  const isRoadmap = pathname === "/app/roadmap" || pathname?.startsWith("/app/roadmap/");
  const isFullBleed = isRoadmap;

  return (
    <div className="min-h-screen bg-[#070a12] text-slate-200 selection:bg-white selection:text-[#070a12]">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[#070a12]" />
        <div className="absolute -top-[30vh] left-1/2 h-[70vh] w-[110vw] -translate-x-1/2 rounded-[100%] bg-white/[0.025] blur-[80px]" />
        <div className="absolute top-[18vh] left-[8%] h-64 w-64 rounded-full bg-emerald-500/10 blur-[90px]" />
        <div className="absolute top-[45vh] right-[10%] h-72 w-72 rounded-full bg-indigo-500/10 blur-[90px]" />
        <div
          className="absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage: "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
      </div>

      <header
        className={`sticky top-0 z-40 border-b transition-all ${
          scrolled
            ? "border-white/[0.08] bg-[#070a12]/88 backdrop-blur-[16px] shadow-[0_8px_32px_rgba(0,0,0,0.45),0_1px_0_rgba(255,255,255,0.04)_inset]"
            : "border-white/[0.06] bg-[#070a12]/70 backdrop-blur-[12px] shadow-[0_1px_20px_rgba(0,0,0,0.25)]"
        }`}
      >
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              aria-label="Toggle navigation"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen((v) => !v)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] hover:text-white transition sm:hidden"
            >
              <span className="sr-only">Menu</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                {mobileOpen ? (
                  <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                ) : (
                  <path d="M4 7H20M4 12H20M4 17H20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                )}
              </svg>
            </button>
            <a
              href="/"
              className="flex h-[32px] w-[32px] items-center justify-center rounded-[10px] bg-white text-[10px] font-black tracking-[-0.04em] text-[#0a0f1e] shadow-[0_1px_14px_rgba(255,255,255,0.18),0_1px_0_rgba(255,255,255,0.6)_inset]"
            >
              PHYSI
            </a>
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.04] px-2.5 py-1 font-mono text-[10px] font-medium tracking-[0.08em] text-slate-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
              INSIDE
            </span>
          </div>

          {/* top bar: Profile only — main nav moved to bottom game bar */}
          <div className="flex items-center gap-2">
            <a
              href="/app/profile"
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] font-medium backdrop-blur transition ${
                isProfile
                  ? "border-white bg-white text-[#070a12] shadow-[0_4px_18px_rgba(255,255,255,0.16)]"
                  : "border-white/[0.08] bg-white/[0.05] text-slate-200 hover:bg-white/[0.09] hover:text-white"
              }`}
            >
              <span className="hidden sm:inline">{isProfile ? "Profile • active" : "Profile"}</span>
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${isProfile ? "bg-[#070a12] text-white" : "bg-white text-[#0a0f1e]"}`}>◯</span>
            </a>
          </div>
        </div>

        {mobileOpen && (
          <div className="border-t border-white/[0.06] bg-[#070a12]/95 px-4 py-3 backdrop-blur sm:hidden">
            <nav className="grid grid-cols-2 gap-2">
              {ALL_TABS.map((t) => {
                const active = pathname === t.href || pathname?.startsWith(t.href + "/");
                const label = GAME_LABELS[t.href] ?? t.label;
                return (
                  <a
                    key={t.href}
                    href={t.href}
                    className={`rounded-[12px] border px-3 py-2.5 text-center text-[13px] font-medium transition ${
                      active ? "border-white bg-white text-[#070a12] shadow-[0_4px_16px_rgba(255,255,255,0.12)]" : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] hover:text-white"
                    }`}
                  >
                    {label}
                  </a>
                );
              })}
              <a
                href="/app/profile"
                className={`col-span-2 rounded-[12px] border px-3 py-2.5 text-center text-[13px] font-medium transition ${isProfile ? "border-white bg-white text-[#070a12]" : "border-white/10 bg-white/[0.04] text-slate-300"}`}
              >
                Profile
              </a>
            </nav>
            <p className="mt-2 text-center font-mono text-[11px] text-slate-500">Verify &amp; Check-in live on Road nodes — tap the map</p>
          </div>
        )}

        <div className="border-t border-amber-400/10 bg-amber-400/[0.04] backdrop-blur">
          <div className="mx-auto max-w-[1280px] px-4 py-[6px] sm:px-6 lg:px-8">
            <p className="text-center font-mono text-[10.5px] leading-3 tracking-wide text-amber-200/70">
              <a href="/terms" className="hover:text-amber-100 transition">
                advisory feed — green tick means your coursemates confirmed it · Terms →
              </a>
            </p>
          </div>
        </div>
      </header>

      {!isFullBleed && (
        <div className="border-b border-white/[0.04] bg-white/[0.01] backdrop-blur-[2px]">
          <Breadcrumb pathname={pathname} />
        </div>
      )}
      <main className={`${isFullBleed ? "w-full" : "mx-auto max-w-[1280px] px-4 py-5 sm:px-6 sm:py-6 lg:px-8"} pb-[88px] sm:pb-[92px]`}>{children}</main>

      <BottomGameNav pathname={pathname} />

      <footer className={`${isFullBleed ? "w-full border-t border-white/[0.04] px-4 py-6 sm:px-6 lg:px-8" : "mx-auto max-w-[1280px] border-t border-white/[0.04] px-4 py-6 sm:px-6 lg:px-8"} pb-[96px]`}>
        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
          <p className="font-mono text-[10.5px] text-slate-600">
            PHYSI · built by students, for students · <a href="/terms" className="underline decoration-white/20 hover:text-slate-400">Terms · advisory only · TEST-PHYSI no cash value →</a>
          </p>
          <div className="flex items-center gap-2 font-mono text-[10.5px] text-slate-500">
            <a href="/app/timetable" className="hover:text-slate-300 transition">Timetable</a>
            <span className="opacity-30">·</span>
            <a href="/app/verify" className="hover:text-slate-300 transition">Verify</a>
            <span className="opacity-30">·</span>
            <a href="/app/roadmap" className="hover:text-slate-300 transition">Roadmap</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
