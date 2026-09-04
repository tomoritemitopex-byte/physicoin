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
        <a href="/app/roadmap" className="font-mono text-xs text-[rgba(240,253,244,0.60)] hover:text-[#f0fdf4] transition">Home</a>
        <span className="text-[rgba(240,253,244,0.30)]">›</span>
        <span className="text-sm font-medium text-[#f0fdf4]">{title}</span>
      </div>
      <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-[rgba(52,211,153,0.15)] bg-[#1a5f48]/60 px-2.5 py-1 font-mono text-[11px] text-[rgba(240,253,244,0.65)]">advisory only</span>
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
        const totalYes = mine.reduce((s:any,e:any)=> s+ Number(e.vote_weight_yes||0),0);
        const last = Number(localStorage.getItem(`physi_mine_seen_${uid}`) || "0");
        if(last>0 && totalYes>last) setMineDot(true);
      }catch{}
    }
    check();
    const iv=setInterval(check,30000);
    const onSeen=()=> setMineDot(false);
    window.addEventListener("physi-mine-seen", onSeen as any);
    return ()=>{ cancelled=true; clearInterval(iv); window.removeEventListener("physi-mine-seen", onSeen as any); };
  }, [pathname]);

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 border-t border-[rgba(52,211,153,0.15)] bg-[#022c1e]/92 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[480px] items-center gap-2 px-3 py-3">
        {BOTTOM_TABS.map((t) => {
          const active = pathname === t.href || pathname?.startsWith(t.href + "/");
          const label = GAME_LABELS[t.href] ?? t.label;
          const icon = GAME_ICONS[t.href] ?? "●";
          const isRoad = t.href==="/app/roadmap";
          return (
            <a key={t.href} href={t.href}
              className={`relative flex flex-1 items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition ${active ? "bg-[#34d399] text-[#022c1e] shadow-lg shadow-[rgba(52,211,153,0.18)]" : "border border-[rgba(52,211,153,0.15)] bg-[#1a5f48]/70 text-[rgba(240,253,244,0.80)] hover:bg-[#1a5f48] hover:text-[#f0fdf4]"}`}>
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${active ? "bg-[#022c1e] text-[#34d399]" : "bg-[#022c1e]/40 text-[#f0fdf4] border border-[rgba(52,211,153,0.15)]"}`}>{icon}</span>
              {label}
              {isRoad && mineDot && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-[#fbbf24] ring-2 ring-[#022c1e] animate-pulse" />}
            </a>
          );
        })}
      </div>
      {isRoadmap && <p className="pb-2 text-center font-mono text-[11px] text-[rgba(240,253,244,0.50)]">Map · List inside — tap nodes to verify</p>}
      <div className="h-[env(safe-area-inset-bottom)] bg-[#022c1e]" />
    </nav>
  );
}


function HeaderWallet({ isProfile }: { isProfile: boolean }){
  const [bal,setBal]=useState<string | null>(null);
  useEffect(()=>{
    function read(){ try{ const raw=localStorage.getItem("physi_profile"); if(raw){ const p=JSON.parse(raw); setBal(Number(p.mining_balance||0).toFixed(0)); } else setBal(null);}catch{ setBal(null);} }
    read();
    const on=()=>read();
    window.addEventListener("physi-earn",on as any);
    window.addEventListener("physi-spend",on as any);
    window.addEventListener("storage",on as any);
    const iv=setInterval(read,3000);
    return()=>{ window.removeEventListener("physi-earn",on as any); window.removeEventListener("physi-spend",on as any); window.removeEventListener("storage",on as any); clearInterval(iv); };
  },[]);
  return (
    <a href="/app/profile" className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition ${isProfile ? "border-[#34d399] bg-[#34d399] text-[#022c1e]" : "border-[rgba(52,211,153,0.15)] bg-[#1a5f48]/60 text-[rgba(240,253,244,0.80)] hover:bg-[#1a5f48] hover:text-[#f0fdf4]"}`}>
      <span className="hidden sm:inline-flex items-center gap-1">{isProfile ? "Profile · active" : "Profile"}{bal!==null && <span className={`ml-1 rounded-full px-2 py-0.5 font-mono text-xs font-black ${isProfile?"bg-[#022c1e] text-emerald-300":"bg-white text-[#022c1e]"}`}>{bal} $PHY</span>}</span>
      <span className="sm:hidden flex items-center gap-1">Profile{bal!==null && <span className="rounded-full bg-white px-1.5 py-0.5 font-mono text-[10px] font-black text-[#022c1e]">{bal}</span>}</span>
      <span className={`hidden sm:flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${isProfile ? "bg-[#022c1e] text-[#fbbf24]" : "bg-[#f0fdf4] text-[#022c1e]"}`}>◯</span>
    </a>
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
    <div className="min-h-screen bg-[#0d3b2a] text-[#f0fdf4] selection:bg-[#34d399] selection:text-[#022c1e]">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[#0d3b2a]" />
        <div className="absolute -top-32 left-1/2 h-[400px] w-[800px] -translate-x-1/2 rounded-full opacity-[0.28] blur-[60px]" style={{ background: "radial-gradient(ellipse at center, #1a5f48, transparent 70%)" }} />
      </div>

      <header className={`sticky top-0 z-40 border-b transition ${scrolled ? "border-[rgba(52,211,153,0.15)] bg-[#0d3b2a]/90 backdrop-blur-xl shadow-lg shadow-[rgba(2,44,30,0.35)]" : "border-[rgba(52,211,153,0.12)] bg-[#0d3b2a]/75 backdrop-blur-xl"}`}>
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-3 px-4 py-2.5 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button aria-label="Toggle navigation" aria-expanded={mobileOpen} onClick={() => setMobileOpen(v=>!v)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[rgba(52,211,153,0.15)] bg-[#1a5f48]/60 text-[rgba(240,253,244,0.70)] hover:text-[#f0fdf4] sm:hidden">
              {mobileOpen ? "✕" : "☰"}
            </button>
            <a href="/" className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f0fdf4] text-[10px] font-black tracking-tight text-[#022c1e]">PHYSI</a>
            <span className="hidden sm:inline text-sm font-semibold tracking-tight text-[#f0fdf4]">PHYSI</span>
            <span className="hidden sm:inline-flex rounded-full border border-[rgba(52,211,153,0.15)] bg-[#1a5f48]/60 px-2.5 py-1 font-mono text-[11px] text-[rgba(240,253,244,0.65)]">inside</span>
          </div>
          <HeaderWallet isProfile={isProfile} />
        </div>
        {mobileOpen && (
          <div className="border-t border-[rgba(52,211,153,0.12)] bg-[#022c1e]/95 px-4 py-3 backdrop-blur sm:hidden">
            <nav className="grid grid-cols-2 gap-2">
              {ALL_TABS.map((t) => {
                const active = pathname === t.href || pathname?.startsWith(t.href + "/");
                return <a key={t.href} href={t.href} className={`min-h-[44px] rounded-xl border px-3 py-2.5 text-center text-sm font-medium flex items-center justify-center ${active ? "border-[#34d399] bg-[#34d399] text-[#022c1e]" : "border-[rgba(52,211,153,0.15)] bg-[#1a5f48]/60 text-[rgba(240,253,244,0.80)]"}`}>{GAME_LABELS[t.href] ?? t.label}</a>;
              })}
            </nav>
          </div>
        )}
        {/* Advisory strip — gold highlight */}
        <div className="border-t border-[rgba(251,191,36,0.15)] bg-[rgba(251,191,36,0.06)]">
          <div className="mx-auto max-w-[1280px] px-4 py-1.5 text-center font-mono text-[11px] leading-none text-[#fbbf24]/70">
            <a href="/terms" className="hover:text-[#fbbf24] transition">advisory feed — gold tick = confirmed · Terms →</a>
          </div>
        </div>
      </header>

      {!isRoadmap && <div className="border-b border-[rgba(52,211,153,0.08)] bg-[#1a5f48]/20"><Breadcrumb pathname={pathname} /></div>}
      <main className={`${isRoadmap ? "w-full" : "mx-auto max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8"} pb-[88px] overflow-x-hidden`}>{children}</main>
      <BottomNav pathname={pathname} />
      <footer className="mx-auto max-w-[1280px] border-t border-[rgba(52,211,153,0.08)] px-4 py-6 text-center font-mono text-xs text-[rgba(240,253,244,0.45)] sm:px-6 lg:px-8">
        PHYSI · built by students · <a href="/terms" className="underline decoration-[rgba(52,211,153,0.20)] hover:text-[rgba(240,253,244,0.70)]">Terms →</a>
      </footer>
    </div>
  );
}
