"use client";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { listFeatures } from "@/lib/adapters/features";
import "@/lib/adapters";

const ALL_TABS = listFeatures().filter((f) => f.nav && f.id !== "profile").map((f) => f.nav!);
const BOTTOM_TABS = listFeatures().filter((f) => f.id === "roadmap" || f.id === "timetable").map((f) => f.nav!).filter(Boolean) as { href: string; label: string; short: string }[];

const GAME_LABELS: Record<string, string> = { "/app/roadmap": "Road", "/app/timetable": "Feed" };
const GAME_ICONS: Record<string, string> = { "/app/roadmap": "⬢", "/app/timetable": "≡" };
const LABELS: Record<string, string> = { timetable: "Feed", verify: "Verify", mining: "Check-in", roadmap: "Road", profile: "Profile" };

function Breadcrumb({ pathname }: { pathname: string | null }) {
  const seg = (pathname ?? "").split("/").filter(Boolean);
  const page = seg[seg.indexOf("app") + 1];
  const title = page ? LABELS[page] ?? page : "Dashboard";
  return (
    <div className="mx-auto flex max-w-[1280px] items-center justify-between px-4 py-2.5 sm:px-6 lg:px-8">
      <div className="flex items-center gap-2">
        <a href="/app/roadmap" className="font-mono text-xs text-slate-400 hover:text-white transition">Home</a>
        <span className="text-slate-600">›</span>
        <span className="text-sm font-medium text-white">{title}</span>
      </div>
      <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.03] px-2.5 py-1 font-mono text-[11px] text-slate-400">advisory only</span>
    </div>
  );
}

function BottomNav({ pathname }: { pathname: string | null }) {
  const isRoadmap = pathname?.startsWith("/app/roadmap");
  const [mineDot, setMineDot] = useState(false);
  useEffect(() => {
    let cancelled=false;
    async function check(){
      try{
        const raw = localStorage.getItem("physi_profile"); if(!raw) return;
        const uid = JSON.parse(raw)?.id; if(!uid) return;
        if(localStorage.getItem("physi_mine_has_new")==="1"){ setMineDot(true); return; }
        const r = await fetch("/api/timetable?limit=200",{ cache:"no-store"}); const j = await r.json().catch(()=>({} as any));
        const mine = (j.events ?? []).filter((e:any)=> String(e.created_by)===String(uid));
        if(cancelled) return;
        const totalAp = mine.reduce((s:any,e:any)=> s+ Number(e.authority_points||0),0);
        const last = Number(localStorage.getItem(`physi_mine_seen_${uid}`) || "0");
        if(last>0 && totalAp>last) setMineDot(true);
      }catch{}
    }
    check();
    const iv=setInterval(check,30000);
    const onSeen=()=> setMineDot(false);
    window.addEventListener("physi-mine-seen", onSeen as any);
    return ()=>{ cancelled=true; clearInterval(iv); window.removeEventListener("physi-mine-seen", onSeen as any); };
  }, [pathname]);

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 border-t border-white/[0.07] bg-[#0c1222]/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[480px] items-center gap-2 px-3 py-3">
        {BOTTOM_TABS.map((t) => {
          const active = pathname === t.href || pathname?.startsWith(t.href + "/");
          const label = GAME_LABELS[t.href] ?? t.label;
          const icon = GAME_ICONS[t.href] ?? "●";
          const isRoad = t.href==="/app/roadmap";
          return (
            <a key={t.href} href={t.href}
              className={`relative flex flex-1 items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition ${active ? "bg-white text-[#070a12] shadow-lg" : "border border-white/10 bg-white/[0.05] text-slate-300 hover:bg-white/[0.08] hover:text-white"}`}>
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${active ? "bg-[#070a12] text-white" : "bg-white/10 text-white"}`}>{icon}</span>
              {label}
              {isRoad && mineDot && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-[#0c1222] animate-pulse" />}
            </a>
          );
        })}
      </div>
      {isRoadmap && <p className="pb-2 text-center font-mono text-[11px] text-slate-500">Map · List inside — tap nodes to verify</p>}
      <div className="h-[env(safe-area-inset-bottom)] bg-[#0c1222]" />
    </nav>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => { import("@/lib/pwa").then(m=> m.registerPWA()).catch(()=>{}); }, []);
  useEffect(() => { const on = () => setScrolled(window.scrollY > 8); window.addEventListener("scroll", on, { passive: true }); return () => window.removeEventListener("scroll", on); }, []);
  useEffect(() => { setMobileOpen(false); }, [pathname]);
  const isProfile = pathname?.startsWith("/app/profile");
  const isRoadmap = pathname?.startsWith("/app/roadmap");

  return (
    <div className="min-h-screen bg-[#070a12] text-slate-200 selection:bg-white selection:text-[#070a12]">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[#070a12]" />
        <div className="absolute -top-32 left-1/2 h-[400px] w-[800px] -translate-x-1/2 rounded-full bg-white/[0.02] blur-[60px]" />
      </div>

      <header className={`sticky top-0 z-40 border-b transition ${scrolled ? "border-white/[0.07] bg-[#070a12]/90 backdrop-blur-xl shadow-lg" : "border-white/[0.06] bg-[#070a12]/70 backdrop-blur-xl"}`}>
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-3 px-4 py-2.5 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button aria-label="Toggle navigation" aria-expanded={mobileOpen} onClick={() => setMobileOpen(v=>!v)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.04] text-slate-400 hover:text-white sm:hidden">
              {mobileOpen ? "✕" : "☰"}
            </button>
            <a href="/" className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-[10px] font-black tracking-tight text-[#070a12]">PHYSI</a>
            <span className="hidden sm:inline text-sm font-semibold tracking-tight text-white">PHYSI</span>
            <span className="hidden sm:inline-flex rounded-full border border-white/[0.06] bg-white/[0.04] px-2.5 py-1 font-mono text-[11px] text-slate-400">inside</span>
          </div>
          <a href="/app/profile" className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition ${isProfile ? "border-white bg-white text-[#070a12]" : "border-white/10 bg-white/[0.05] text-slate-300 hover:bg-white/[0.08] hover:text-white"}`}>
            <span className="hidden sm:inline">{isProfile ? "Profile · active" : "Profile"}</span>
            <span className="sm:hidden">Profile</span>
            <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${isProfile ? "bg-[#070a12] text-white" : "bg-white text-[#070a12]"}`}>◯</span>
          </a>
        </div>
        {mobileOpen && (
          <div className="border-t border-white/[0.06] bg-[#070a12]/95 px-4 py-3 backdrop-blur sm:hidden">
            <nav className="grid grid-cols-2 gap-2">
              {ALL_TABS.map((t) => {
                const active = pathname === t.href || pathname?.startsWith(t.href + "/");
                return <a key={t.href} href={t.href} className={`min-h-[44px] rounded-xl border px-3 py-2.5 text-center text-sm font-medium flex items-center justify-center ${active ? "border-white bg-white text-[#070a12]" : "border-white/10 bg-white/[0.04] text-slate-300"}`}>{GAME_LABELS[t.href] ?? t.label}</a>;
              })}
            </nav>
          </div>
        )}
        {/* Advisory strip — compact, single line */}
        <div className="border-t border-amber-500/10 bg-amber-500/[0.03]">
          <div className="mx-auto max-w-[1280px] px-4 py-1.5 text-center font-mono text-[11px] leading-none text-amber-200/60">
            <a href="/terms" className="hover:text-amber-200 transition">advisory feed — green tick = confirmed · Terms →</a>
          </div>
        </div>
      </header>

      {!isRoadmap && <div className="border-b border-white/[0.04] bg-white/[0.01]"><Breadcrumb pathname={pathname} /></div>}
      <main className={`${isRoadmap ? "w-full" : "mx-auto max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8"} pb-[88px] overflow-x-hidden`}>{children}</main>
      <BottomNav pathname={pathname} />
      <footer className="mx-auto max-w-[1280px] border-t border-white/[0.04] px-4 py-6 text-center font-mono text-xs text-slate-600 sm:px-6 lg:px-8">
        PHYSI · built by students · <a href="/terms" className="underline decoration-white/15 hover:text-slate-400">Terms →</a>
      </footer>
    </div>
  );
}
