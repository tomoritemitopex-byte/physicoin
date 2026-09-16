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
        scrolled ? "border-sky/20 bg-[#07111f]/95 backdrop-blur-xl shadow-lg shadow-cyan-950/20" : "border-sky/15 bg-[#07111f]/90 backdrop-blur-xl"
      }`}>
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-3 px-4 py-2.5 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              aria-label="Toggle navigation"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen((v) => !v)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-sky/30 bg-white text-ink/80 hover:text-ink sm:hidden"
            >
              {mobileOpen ? "✕" : "☰"}
            </button>
            <a href="/" className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky text-white font-black tracking-tight text-[10px]">PHYSI</a>
            <span className="hidden sm:inline text-sm font-semibold tracking-tight text-ink">PHYSI</span>
            <span className="hidden sm:inline-flex rounded-full border border-sky/30 bg-white px-2.5 py-1 font-mono text-[11px] text-ink/70">advisory · not official</span>
          </div>

          {/* Wallet button */}
          <a href="/app/profile" className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition ${
            isProfile ? "border-sky bg-sky text-white shadow-md" : "border-sky/30 bg-white text-ink hover:bg-sky/10"
          }`}>
            <span className="hidden sm:inline-flex items-center gap-1">
              {isProfile ? "Profile · active" : "Profile"}
              {profile?.mining_balance && (
                <span className={`ml-1 rounded-full px-2 py-0.5 font-mono text-xs font-black ${
                  isProfile ? "bg-white/20 text-white" : "bg-sky/15 text-sky"
                }`}>{Number(profile.mining_balance).toFixed(0)} $PHY</span>
              )}
            </span>
            <span className="sm:hidden flex items-center gap-1">
              Profile
              {profile?.mining_balance && (
                <span className="rounded-full bg-sky/15 px-1.5 py-0.5 font-mono text-[10px] font-black text-sky">
                  {Number(profile.mining_balance).toFixed(0)}
                </span>
              )}
            </span>
            <span className={`hidden sm:flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
              isProfile ? "bg-white/20 text-white" : "bg-sky/15 text-sky"
            }`}>◯</span>
          </a>
        </div>

        {/* Mobile nav menu */}
        {mobileOpen && (
          <div className="border-t border-sky/20 bg-white/95 px-4 py-3 sm:hidden">
            <nav className="grid grid-cols-2 gap-2">
              <a href="/app/roadmap" className="min-h-[44px] rounded-xl border border-sky/30 bg-sky/10 px-3 py-2.5 text-center text-sm font-medium text-ink hover:bg-sky/20">Road</a>
              <a href="/app/timetable" className="min-h-[44px] rounded-xl border border-sky/30 bg-sky/10 px-3 py-2.5 text-center text-sm font-medium text-ink hover:bg-sky/20">Feed</a>
            </nav>
          </div>
        )}
      </header>
    </>
  );
}
