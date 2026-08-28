"use client";
import { useState } from "react";
import { MiningPanel } from "@/components/mining-panel";
import { EventRoadmap } from "@/components/event-roadmap";
import { TimetableFeed } from "@/components/timetable-feed";
import { VerificationEngine } from "@/components/verification-engine";
import { ProfilePilotForm } from "@/components/profile-pilot-form";

type TabId = "overview" | "mining" | "roadmap" | "timetable" | "verify";

const TABS: { id: TabId; label: string; icon: string; desc: string }[] = [
  { id: "overview", label: "Overview", icon: "◈", desc: "Pilot status" },
  { id: "mining", label: "Mining", icon: "◆", desc: "Daily tap" },
  { id: "roadmap", label: "Roadmap", icon: "⬢", desc: "12-step flow" },
  { id: "timetable", label: "Timetable", icon: "▦", desc: "Live sync" },
  { id: "verify", label: "Verify", icon: "◎", desc: "Authority vote" },
];

const metrics = [
  { label: "Pilot schools", value: "01", sub: "FUHSI-first", accent: "text-amber-300" },
  { label: "Verified events", value: "128", sub: "canonical", accent: "text-emerald-300" },
  { label: "Active testers", value: "42", sub: "students + admins", accent: "text-sky-300" },
  { label: "Authority yes", value: "94%", sub: "weighted signal", accent: "text-violet-300" },
];

const modules = [
  { title: "Identity & Access", detail: "Profile setup, role scopes, enterprise access.", status: "Ready", dot: "bg-emerald-400" },
  { title: "Event Roadmap", detail: "Personal bubbles, canonical promo, duplicate guard.", status: "Testing", dot: "bg-amber-400" },
  { title: "Timetable Feed", detail: "Live sync with green / yellow / red confidence.", status: "Ready", dot: "bg-emerald-400" },
  { title: "Mining Engine", detail: "Daily tap loop with authority-weighted rewards.", status: "Ready", dot: "bg-emerald-400" },
  { title: "Verification", detail: "Random yes / no / cancel with weighted votes.", status: "Testing", dot: "bg-amber-400" },
  { title: "Analytics & Audit", detail: "Track authority drift and suspicious patterns.", status: "Planned", dot: "bg-slate-500" },
];

export default function Home() {
  const [tab, setTab] = useState<TabId>("overview");
  const [mobileMenu, setMobileMenu] = useState(false);

  return (
    <div className="min-h-screen bg-[#020610] text-white selection:bg-amber-400/30">
      {/* background mesh */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[#020610]" />
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/[0.07] via-transparent to-emerald-500/[0.07]" />
        <div className="absolute top-0 left-1/2 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-gradient-to-r from-amber-400/10 to-emerald-400/10 blur-[120px]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:32px_32px]" />
      </div>

      {/* STICKY HEADER */}
      <header className="sticky top-0 z-40 border-b border-white/[0.07] bg-[#020610]/70 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          {/* logo */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-500 text-xl font-black text-slate-900 shadow-lg shadow-amber-500/20">
              $
            </div>
            <div className="leading-none">
              <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-amber-300">PHYSI Enterprise</p>
              <p className="text-[15px] font-black tracking-tight">Campus truth infrastructure</p>
            </div>
            <span className="ml-2 hidden items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-bold text-emerald-300 lg:inline-flex">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> PILOT LIVE
            </span>
          </div>

          {/* desktop nav */}
          <nav className="hidden items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1 backdrop-blur-xl lg:flex">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`relative rounded-full px-4 py-2 text-[13px] font-bold transition-all ${
                  tab === t.id
                    ? "bg-white text-slate-900 shadow-lg shadow-black/20"
                    : "text-slate-400 hover:bg-white/10 hover:text-white"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <span className="text-[11px] opacity-70">{t.icon}</span> {t.label}
                </span>
              </button>
            ))}
          </nav>

          {/* right actions */}
          <div className="flex items-center gap-2">
            <span className="hidden rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300 sm:inline-flex">
              physi.vercel.app
            </span>
            <button
              onClick={() => setMobileMenu(!mobileMenu)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white backdrop-blur lg:hidden"
              aria-label="Toggle menu"
            >
              <span className="text-lg">{mobileMenu ? "✕" : "☰"}</span>
            </button>
          </div>
        </div>

        {/* mobile tabs */}
        {mobileMenu && (
          <div className="border-t border-white/10 bg-slate-950/80 px-4 py-3 backdrop-blur-xl lg:hidden">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setTab(t.id);
                    setMobileMenu(false);
                  }}
                  className={`rounded-2xl border px-3 py-3 text-center transition ${
                    tab === t.id
                      ? "border-white bg-white text-slate-900"
                      : "border-white/10 bg-white/5 text-slate-300"
                  }`}
                >
                  <span className="block text-sm font-black">{t.icon}</span>
                  <span className="block text-[11px] font-bold leading-none">{t.label}</span>
                  <span className="block text-[10px] opacity-60">{t.desc}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      {/* secondary sticky tab bar desktop scroll hint + mobile swipe */}
      <div className="sticky top-[57px] z-30 border-b border-white/[0.04] bg-[#020610]/50 backdrop-blur-xl lg:hidden">
        <div className="mx-auto max-w-[1400px] px-2">
          <div className="flex gap-1 overflow-x-auto p-2 scrollbar-none">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-black transition ${
                  tab === t.id ? "bg-white text-slate-900" : "border border-white/10 bg-white/5 text-slate-300"
                }`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* MAIN */}
      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {/* tab content with animation */}
        <div key={tab} className="animate-[in_0.35s_ease]">
          {tab === "overview" && (
            <div className="space-y-6">
              {/* hero + metrics */}
              <div className="grid gap-6 lg:grid-cols-[1.35fr_0.75fr]">
                <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-white/[0.08] to-white/[0.02] p-6 shadow-2xl backdrop-blur-xl sm:p-8">
                  <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-gradient-to-br from-amber-400/20 to-emerald-400/20 blur-3xl" />
                  <div className="relative">
                    <span className="inline-flex rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-300">
                      Enterprise-ready test build
                    </span>
                    <h1 className="mt-4 max-w-2xl text-3xl font-black leading-[0.95] tracking-tight sm:text-4xl lg:text-5xl">
                      A production-style
                      <br />
                      <span className="bg-gradient-to-r from-amber-300 to-yellow-400 bg-clip-text text-transparent">PHYSI dashboard</span>
                      <br />
                      for testing & rollout.
                    </h1>
                    <p className="mt-4 max-w-xl text-sm leading-6 text-slate-300 sm:text-[15px]">
                      Not a paper wall — a tappable native app. Switch tabs above to mine, push roadmap events, sync
                      timetables, and verify with authority-weighted voting. Built for FUHSI pilot cohorts.
                    </p>
                    <div className="mt-6 flex flex-wrap gap-3">
                      <button
                        onClick={() => setTab("mining")}
                        className="rounded-full bg-white px-6 py-3 text-sm font-black text-slate-900 shadow-lg shadow-black/20 transition hover:scale-[1.02]"
                      >
                        Start mining →
                      </button>
                      <button
                        onClick={() => setTab("roadmap")}
                        className="rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-black text-white backdrop-blur hover:bg-white/10"
                      >
                        Push event
                      </button>
                      <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-900/60 px-4 py-2 text-xs font-semibold text-slate-300">
                        <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" /> Neon • Vercel • Fleet
                      </span>
                    </div>
                  </div>

                  {/* metrics */}
                  <div className="relative mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {metrics.map((m) => (
                      <div
                        key={m.label}
                        className="group rounded-2xl border border-white/10 bg-slate-900/60 p-4 backdrop-blur transition hover:bg-slate-900/80 hover:scale-[1.01]"
                      >
                        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">{m.label}</p>
                        <p className="mt-1 text-3xl font-black text-white">{m.value}</p>
                        <p className={`text-xs font-bold uppercase tracking-wide ${m.accent}`}>{m.sub}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* right stack */}
                <div className="grid gap-6">
                  <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-2xl backdrop-blur-xl">
                    <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-amber-300">Coin identity</p>
                    <div className="mt-4 flex items-center gap-4">
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-500 text-3xl font-black text-slate-900 shadow-lg">
                        $
                      </div>
                      <div>
                        <p className="text-2xl font-black">PHYSI</p>
                        <p className="text-sm text-slate-300">Event-driven truth coin.</p>
                        <p className="text-xs text-slate-500">Authority-weighted • scoped • verified</p>
                      </div>
                    </div>
                    <div className="mt-5 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-2xl border border-white/10 bg-slate-950/60 py-3">
                        <p className="text-lg font-black text-amber-300">10</p>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">base</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-slate-950/60 py-3">
                        <p className="text-lg font-black text-emerald-300">× auth</p>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">weight</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-slate-950/60 py-3">
                        <p className="text-lg font-black text-sky-300">24h</p>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">cooldown</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-emerald-500/10 via-sky-500/5 to-violet-500/10 p-6 backdrop-blur-xl">
                    <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-emerald-300">Pilot workflow</p>
                    <div className="mt-4 grid gap-3">
                      {[
                        ["01", "Create profile", "Programme, level, statuses"],
                        ["02", "Push event", "Test duplicate guard + promo"],
                        ["03", "Verify random", "Yes / No / Cancel weighted"],
                        ["04", "Tap to mine", "Daily loop + Neon persist"],
                      ].map(([n, t, d]) => (
                        <div key={n} className="flex gap-3 rounded-2xl border border-white/10 bg-slate-950/50 p-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-xs font-black text-slate-900">
                            {n}
                          </span>
                          <div>
                            <p className="text-sm font-black text-white">{t}</p>
                            <p className="text-xs text-slate-400">{d}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* profile form */}
              <ProfilePilotForm />

              {/* modules */}
              <div>
                <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-400">Modules</h2>
                <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {modules.map((mod) => (
                    <div
                      key={mod.title}
                      className="group relative overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl transition hover:bg-white/[0.07] hover:scale-[1.01]"
                    >
                      <div className="absolute inset-0 opacity-0 transition group-hover:opacity-100 bg-gradient-to-br from-white/[0.04] to-transparent" />
                      <div className="relative flex items-center justify-between">
                        <h3 className="text-[15px] font-black text-white">{mod.title}</h3>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-bold text-slate-200">
                          <span className={`h-2 w-2 rounded-full ${mod.dot}`} /> {mod.status}
                        </span>
                      </div>
                      <p className="relative mt-2 text-sm leading-6 text-slate-400">{mod.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === "mining" && (
            <div className="mx-auto max-w-3xl">
              <div className="mb-4 flex items-center gap-3">
                <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-300">
                  ◆ Mining Engine
                </span>
                <span className="text-xs text-slate-500">Daily tap • 10 × authority • 24h cooldown</span>
              </div>
              <MiningPanel />
            </div>
          )}

          {tab === "roadmap" && <EventRoadmap />}

          {tab === "timetable" && <TimetableFeed />}

          {tab === "verify" && <VerificationEngine />}
        </div>
      </main>

      {/* bottom nav for mobile - native app feel */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-slate-950/90 backdrop-blur-2xl lg:hidden">
        <div className="mx-auto flex max-w-[1400px] items-center justify-around px-2 py-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex flex-col items-center gap-0.5 rounded-2xl px-3 py-1.5 transition ${
                tab === t.id ? "bg-white text-slate-900" : "text-slate-400"
              }`}
            >
              <span className="text-base leading-none">{t.icon}</span>
              <span className="text-[10px] font-black uppercase tracking-wide">{t.label}</span>
            </button>
          ))}
        </div>
      </nav>

      <footer className="mx-auto max-w-[1400px] px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-8">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-center text-xs text-slate-400 backdrop-blur">
          Enterprise PHYSI pilot • Dark amber/emerald theme • Sticky header + tabbed app shell •{" "}
          <span className="text-slate-200">physicoin.vercel.app</span> • Neon • Vercel
        </div>
      </footer>

      <style>{`@keyframes in { from { opacity:0; transform: translateY(6px) } to { opacity:1; transform: translateY(0) } } .scrollbar-none::-webkit-scrollbar{display:none} .scrollbar-none{scrollbar-width:none}`}</style>
    </div>
  );
}
