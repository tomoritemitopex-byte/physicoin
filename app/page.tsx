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

const METRICS = [
  { label: "Pilot schools", value: "01", sub: "FUHSI-first", tint: "text-amber-300" },
  { label: "Verified events", value: "128", sub: "canonical", tint: "text-emerald-300" },
  { label: "Active testers", value: "42", sub: "students + admins", tint: "text-sky-300" },
  { label: "Authority yes", value: "94%", sub: "weighted signal", tint: "text-violet-300" },
];

const MODULES = [
  { title: "Identity & Access", detail: "Profile setup, role scopes, enterprise access.", status: "Ready", dot: "bg-emerald-400" },
  { title: "Event Roadmap", detail: "Personal bubbles, canonical promo, duplicate guard.", status: "Testing", dot: "bg-amber-400" },
  { title: "Timetable Feed", detail: "Live sync with green / yellow / red confidence.", status: "Ready", dot: "bg-emerald-400" },
  { title: "Mining Engine", detail: "Daily tap loop with authority-weighted rewards.", status: "Ready", dot: "bg-emerald-400" },
  { title: "Verification", detail: "Random yes / no / cancel with weighted votes.", status: "Testing", dot: "bg-amber-400" },
  { title: "Analytics & Audit", detail: "Track authority drift and suspicious patterns.", status: "Planned", dot: "bg-slate-500" },
];

export default function Home() {
  const [tab, setTab] = useState<TabId>("overview");
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#020610] text-white">
      {/* mesh background - fixed */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[#020610]" />
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/[0.07] via-transparent to-emerald-500/[0.07]" />
        <div className="absolute left-1/2 top-0 h-[560px] w-[880px] -translate-x-1/2 rounded-full bg-gradient-to-r from-amber-400/12 to-emerald-400/10 blur-[110px]" />
        <div className="absolute left-1/2 top-[18%] h-[420px] w-[520px] -translate-x-[85%] rounded-full bg-violet-500/[0.06] blur-[90px]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.022)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.022)_1px,transparent_1px)] bg-[size:36px_36px] [mask-image:radial-gradient(ellipse_at_center,black_55%,transparent_78%)]" />
      </div>

      {/* STICKY GLASS HEADER */}
      <header className="sticky top-0 z-40 border-b border-white/[0.07] bg-[#020610]/60 backdrop-blur-2xl supports-[backdrop-filter]:bg-[#020610]/55">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-8">
          {/* logo block */}
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-500 text-[18px] font-black text-slate-900 shadow-lg shadow-amber-500/20 ring-1 ring-white/20">
              $
            </div>
            <div className="min-w-0 leading-none">
              <p className="truncate text-[11px] font-bold uppercase tracking-[0.28em] text-amber-300">PHYSI Enterprise</p>
              <p className="truncate text-[14.5px] font-black tracking-tight text-white">Campus truth infrastructure</p>
            </div>
            <span className="ml-1 hidden items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-bold tracking-wide text-emerald-300 lg:inline-flex">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              PILOT LIVE
            </span>
          </div>

          {/* desktop pill nav */}
          <nav className="hidden items-center gap-1 rounded-full border border-white/10 bg-white/[0.05] p-1.5 backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_8px_24px_rgba(0,0,0,0.35)] lg:flex">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`rounded-full px-4 py-2 text-[13px] font-bold transition-all ${
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

          {/* right */}
          <div className="flex items-center gap-2">
            <span className="hidden rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300 sm:inline-flex">
              physi.vercel.app
            </span>
            <button
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Toggle menu"
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white backdrop-blur transition hover:bg-white/10 lg:hidden"
            >
              <span className="text-lg leading-none">{mobileOpen ? "✕" : "☰"}</span>
            </button>
          </div>
        </div>

        {/* mobile dropdown grid */}
        {mobileOpen && (
          <div className="border-t border-white/10 bg-slate-950/80 px-4 py-3 backdrop-blur-xl lg:hidden">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setTab(t.id);
                    setMobileOpen(false);
                  }}
                  className={`rounded-2xl border px-3 py-3 text-center transition ${
                    tab === t.id ? "border-white bg-white text-slate-900 shadow" : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
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

      {/* secondary sticky horizontal scroll for mobile - stays under header */}
      <div className="sticky top-[58px] z-30 border-b border-white/[0.04] bg-[#020610]/45 backdrop-blur-xl lg:hidden">
        <div className="mx-auto max-w-[1400px] px-2">
          <div className="flex gap-1.5 overflow-x-auto p-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-black transition ${
                  tab === t.id ? "bg-white text-slate-900 shadow" : "border border-white/10 bg-white/5 text-slate-300"
                }`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* MAIN - native app spacing */}
      <main className="mx-auto max-w-[1400px] px-4 pb-6 pt-6 sm:px-6 lg:px-8 lg:py-8">
        <div key={tab} className="animate-[in_0.34s_ease]">
          {tab === "overview" && (
            <div className="space-y-6">
              {/* hero */}
              <div className="grid gap-6 lg:grid-cols-[1.38fr_0.72fr]">
                <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-white/[0.08] to-white/[0.02] p-6 shadow-2xl backdrop-blur-xl sm:p-8">
                  <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-gradient-to-br from-amber-400/20 to-emerald-400/20 blur-3xl" />
                  <div className="pointer-events-none absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-violet-500/10 blur-3xl" />
                  <div className="relative">
                    <span className="inline-flex rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-300">
                      Enterprise-ready test build
                    </span>
                    <h1 className="mt-4 max-w-[22ch] text-3xl font-black leading-[0.92] tracking-tight sm:text-4xl lg:text-[2.95rem]">
                      A production-style
                      <br />
                      <span className="bg-gradient-to-r from-amber-300 via-yellow-300 to-amber-400 bg-clip-text text-transparent">
                        PHYSI dashboard
                      </span>
                      <br />
                      for testing &amp; rollout.
                    </h1>
                    <p className="mt-4 max-w-xl text-sm leading-6 text-slate-300 sm:text-[15px]">
                      Not a paper wall — a tappable native app. Switch tabs above to mine, push roadmap events, sync timetables,
                      and verify with authority-weighted voting. Built for FUHSI pilot cohorts.
                    </p>
                    <div className="mt-6 flex flex-wrap gap-3">
                      <button
                        onClick={() => setTab("mining")}
                        className="rounded-full bg-white px-6 py-3 text-sm font-black text-slate-900 shadow-lg shadow-black/20 transition hover:scale-[1.02] active:scale-[0.99]"
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
                        <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" /> Neon • Vercel • Fleet
                      </span>
                    </div>
                  </div>

                  <div className="relative mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {METRICS.map((m) => (
                      <div
                        key={m.label}
                        className="group rounded-2xl border border-white/10 bg-slate-900/60 p-4 backdrop-blur transition hover:scale-[1.015] hover:bg-slate-900/80"
                      >
                        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">{m.label}</p>
                        <p className="mt-1 text-3xl font-black tabular-nums text-white">{m.value}</p>
                        <p className={`text-xs font-bold uppercase tracking-wide ${m.tint}`}>{m.sub}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* right stack */}
                <div className="grid gap-6">
                  <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-2xl backdrop-blur-xl">
                    <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-amber-300">Coin identity</p>
                    <div className="mt-4 flex items-center gap-4">
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-500 text-3xl font-black text-slate-900 shadow-lg ring-1 ring-white/20">
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

              <ProfilePilotForm />

              <div>
                <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-400">Modules</h2>
                <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {MODULES.map((mod) => (
                    <div
                      key={mod.title}
                      className="group relative overflow-hidden rounded-[1.6rem] border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl transition hover:scale-[1.01] hover:bg-white/[0.07]"
                    >
                      <div className="absolute inset-0 opacity-0 transition group-hover:opacity-100 bg-gradient-to-br from-white/[0.05] to-transparent" />
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
              <div className="mb-4 flex flex-wrap items-center gap-3">
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

      {/* MOBILE BOTTOM NAV - native app feel */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-slate-950/90 backdrop-blur-2xl lg:hidden">
        <div className="mx-auto flex max-w-[1400px] items-center justify-around px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex flex-col items-center gap-0.5 rounded-2xl px-3.5 py-1.5 transition ${
                tab === t.id ? "bg-white text-slate-900 shadow" : "text-slate-400 hover:text-white"
              }`}
            >
              <span className="text-[16px] leading-none">{t.icon}</span>
              <span className="text-[10px] font-black uppercase tracking-wide">{t.label}</span>
            </button>
          ))}
        </div>
      </nav>

      <footer className="mx-auto max-w-[1400px] px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-8">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-center text-xs leading-6 text-slate-400 backdrop-blur">
          Enterprise PHYSI pilot • Dark amber/emerald mesh • Sticky glass header + app tabs •{" "}
          <span className="font-semibold text-slate-200">physicoin.vercel.app</span> • Neon • Vercel
        </div>
      </footer>
    </div>
  );
}
