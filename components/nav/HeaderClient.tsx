"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";

const LABELS: Record<string, string> = {
  timetable: "Feed",
  verify: "Verify",
  mining: "Check-in",
  roadmap: "Road",
  profile: "Profile",
};

export default function HeaderClient() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profile, setProfile] = useState<{ id?: string; mining_balance?: string; level?: string } | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("physi_profile");
      if (raw) setProfile(JSON.parse(raw));
    } catch {}
    const onStorage = () => {
      try {
        const raw = localStorage.getItem("physi_profile");
        if (raw) setProfile(JSON.parse(raw));
      } catch {}
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const isProfile = pathname?.startsWith("/app/profile");

  return (
    <>
      <header className={`sticky top-0 z-40 border-b transition ${
        scrolled ? "border-[rgba(52,211,153,0.15)] bg-[#0d3b2a]/90 backdrop-blur-xl shadow-lg shadow-[rgba(2,44,30,0.35)]"
          : "border-[rgba(52,211,153,0.12)] bg-[#0d3a2a]/75 backdrop-blur-xl"
      }`}>
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-3 px-4 py-2.5 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              aria-label="Toggle navigation"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen((v) => !v)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[rgba(52,211,153,0.15)] bg-[#1a5f48]/60 text-[rgba(240,253,244,0.70)] hover:text-[#f0fdf4] sm:hidden"
            >
              {mobileOpen ? "✕" : "☰"}
            </button>
            <a href="/" className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f0fdf4] text-[10px] font-black tracking-tight text-[#022c1e]">PHYSI</a>
            <span className="hidden sm:inline text-sm font-semibold tracking-tight text-[#f0fdf4]">PHYSI</span>
            <span className="hidden sm:inline-flex rounded-full border border-[rgba(52,211,153,0.15)] bg-[#1a5f48]/70 px-2.5 py-1 font-mono text-[11px] text-[rgba(240,253,244,0.65)]">advisory · not official</span>
          </div>

          {/* Wallet button */}
          <a href="/app/profile" className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition ${
            isProfile
              ? "border-[#34d399] bg-[#34d399] text-[#022c1e]"
              : "border-[rgba(52,211,153,0.15)] bg-[#1a5f48]/60 text-[rgba(240,253,244,0.80)] hover:bg-[#1a5f48] hover:text-[#f0fdf4]"
          }`}>
            <span className="hidden sm:inline-flex items-center gap-1">
              {isProfile ? "Profile · active" : "Profile"}
              {profile?.mining_balance && (
                <span className={`ml-1 rounded-full px-2 py-0.5 font-mono text-xs font-black ${
                  isProfile ? "bg-[#022c1e] text-emerald-300" : "bg-white text-[#022c1e]"
                }`}>{Number(profile.mining_balance).toFixed(0)} $PHY</span>
              )}
            </span>
            <span className="sm:hidden flex items-center gap-1">
              Profile
              {profile?.mining_balance && (
                <span className="rounded-full bg-white px-1.5 py-0.5 font-mono text-[10px] font-black text-[#022c1e]">
                  {Number(profile.mining_balance).toFixed(0)}
                </span>
              )}
            </span>
            <span className={`hidden sm:flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
              isProfile ? "bg-[#022c1e] text-[#fbbf24]" : "bg-[#f0fdf4] text-[#022c1e]"
            }`}>◯</span>
          </a>
        </div>

        {/* Mobile nav menu */}
        {mobileOpen && (
          <div className="border-t border-[rgba(52,211,153,0.12)] bg-[#022c1e]/95 px-4 py-3 sm:hidden">
            <nav className="grid grid-cols-2 gap-2">
              <a href="/app/roadmap" className="min-h-[44px] rounded-xl border border-[rgba(52,211,153,0.15)] bg-[#1a5f48]/60 px-3 py-2.5 text-center text-sm font-medium text-[rgba(240,253,244,0.80)] hover:bg-[#1a5f48] hover:text-[#f0fdf4]">Road</a>
              <a href="/app/timetable" className="min-h-[44px] rounded-xl border border-[rgba(52,211,153,0.15)] bg-[#1a5f48]/60 px-3 py-2.5 text-center text-sm font-medium text-[rgba(240,253,244,0.80)] hover:bg-[#1a5f48] hover:text-[#f0fdf4]">Feed</a>
            </nav>
          </div>
        )}
      </header>
    </>
  );
}
