"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const BOTTOM_TABS = [
  { href: "/app/roadmap", label: "Road", short: "⬢" },
  { href: "/app/timetable", label: "Feed", short: "≡" },
];

export default function BottomNavClient() {
  const pathname = usePathname();
  const [mineDot, setMineDot] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const raw = localStorage.getItem("physi_profile");
        if (!raw) return;
        const uid = JSON.parse(raw)?.id;
        if (!uid) return;
        if (localStorage.getItem("physi_mine_has_new") === "1") {
          setMineDot(true);
          return;
        }
        const r = await fetch("/api/timetable?limit=200", { cache: "no-store" });
        const j = await r.json().catch(() => ({} as any));
        const mine = (j.events ?? []).filter((e: any) => String(e.created_by) === String(uid));
        if (cancelled) return;
        const totalYes = mine.reduce((s: any, e: any) => s + Number(e.vote_weight_yes || 0), 0);
        const last = Number(localStorage.getItem(`physi_mine_seen_${uid}`) || "0");
        if (last > 0 && totalYes > last) setMineDot(true);
      } catch {}
    }
    check();
    const iv = setInterval(check, 30000);
    const onSeen = () => setMineDot(false);
    window.addEventListener("physi-mine-seen", onSeen as any);
    return () => {
      cancelled = true;
      clearInterval(iv);
      window.removeEventListener("physi-mine-seen", onSeen as any);
    };
  }, []);

  const isRoadmap = pathname?.startsWith("/app/roadmap");

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 border-t border-[rgba(52,211,153,0.15)] bg-[#022c1e]/92 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[480px] items-center gap-2 px-3 py-3">
        {BOTTOM_TABS.map((t) => {
          const active = pathname === t.href || pathname?.startsWith(t.href + "/");
          const isRoad = t.href === "/app/roadmap";
          return (
            <a key={t.href} href={t.href}
              className={`relative flex flex-1 items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition ${
                active
                  ? "bg-[#34d399] text-[#022c1e] shadow-lg shadow-[rgba(52,211,153,0.18)]"
                  : "border border-[rgba(52,211,153,0.15)] bg-[#1a5f48]/70 text-[rgba(240,253,244,0.80)] hover:bg-[#1a5f48] hover:text-[#f0fdf4]"
              }`}
            >
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                active ? "bg-[#022c1e] text-[#34d399]" : "bg-[#022c1e]/40 text-[#f0fdf4] border border-[rgba(52,211,153,0.15)]"
              }`}>{t.short}</span>
              {t.label}
              {isRoad && mineDot && (
                <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-[#fbbf24] ring-2 ring-[#022c1e] animate-pulse" />
              )}
            </a>
          );
        })}
      </div>
      {isRoadmap && (
        <p className="pb-2 text-center font-mono text-[11px] text-[rgba(240,253,244,0.50)]">
          Map · List inside — tap nodes to verify
        </p>
      )}
      <div className="h-[env(safe-area-inset-bottom)] bg-[#022c1e]" />
    </nav>
  );
}
