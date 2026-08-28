"use client";
import { useEffect, useState } from "react";
import { LayoutDashboard, Pickaxe, Map, CalendarCheck, ShieldCheck } from "lucide-react";
import { AuthProvider, useAuth } from "@/components/auth-context";
import { MiningPanel } from "@/components/mining-panel";
import { EventRoadmap } from "@/components/event-roadmap";
import { TimetableFeed } from "@/components/timetable-feed";
import { VerificationEngine } from "@/components/verification-engine";
import { ProfilePilotForm } from "@/components/profile-pilot-form";

type TabId = "overview" | "mining" | "roadmap" | "timetable" | "verify";

const TABS: { id: TabId; label: string; Icon: React.ComponentType<any> }[] = [
  { id: "overview", label: "Overview", Icon: LayoutDashboard },
  { id: "mining", label: "Mining", Icon: Pickaxe },
  { id: "roadmap", label: "Roadmap", Icon: Map },
  { id: "timetable", label: "Timetable", Icon: CalendarCheck },
  { id: "verify", label: "Verify", Icon: ShieldCheck },
];

const MODULES = [
  { title: "Identity & Access", detail: "Profile setup, role scopes and pilot access rules.", status: "Ready", dot: "bg-blue-500" },
  { title: "Event Roadmap", detail: "From pitch to green check — six clear steps.", status: "Testing", dot: "bg-slate-400" },
  { title: "Timetable Feed", detail: "Advisory sync — Green check = real, others need a quick check.", status: "Ready", dot: "bg-blue-500" },
  { title: "Mining Engine", detail: "Daily check-in · points for fun · cap ~12/day.", status: "Ready", dot: "bg-blue-500" },
  { title: "Check", detail: "Quick YES / NO / Skip — Verified helps everyone.", status: "Testing", dot: "bg-slate-400" },
  { title: "Analytics & Audit", detail: "Track activity and flag anything odd.", status: "Planned", dot: "bg-slate-600" },
];

function AuthBadge() {
  const { auth, setAuth } = useAuth();
  if (!auth?.nickname) return null;
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-slate-200">
      <span className="text-slate-400">@{auth.nickname}</span>
      <button
        onClick={() => {
          setAuth(null);
          try {
            localStorage.removeItem("physi_nickname");
            localStorage.removeItem("physi_fullname");
          } catch {}
        }}
        className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-900 hover:bg-slate-100"
      >
        Logout
      </button>
    </span>
  );
}

function HomeInner() {
  const [tab, setTab] = useState<TabId>("overview");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [stats, setStats] = useState<{ users: number; events: number; checks: number } | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch("/api/stats")
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (j?.ok && j.metrics) setStats({ users: Number(j.metrics.users ?? 0), events: Number(j.metrics.events ?? 0), checks: Number(j.metrics.verifications ?? j.metrics.checks ?? 0) });
        else if (j?.counts) setStats({ users: Number(j.counts.physi_users ?? 0), events: Number(j.counts.physi_events ?? 0), checks: Number(j.counts.physi_verifications ?? 0) });
      })
      .catch(() => {})
      .finally(() => alive && setStatsLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#020610] text-slate-100">
      {/* one subtle mesh */}
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[#020610]">
        <div className="page-mesh absolute inset-0 opacity-100" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
      </div>

      {/* header — clean, thin, one shadow */}
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#020610]/80 backdrop-blur-[10px]">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-6 px-6 py-3.5 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-[11px] font-black tracking-tighter text-slate-900 shadow-soft">
              PHYSI
            </div>
            <div className="min-w-0 leading-none">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Research Preview</p>
              <p className="mt-1 text-[13.5px] font-semibold tracking-tight text-white">FUHSI Lab Pilot · Not Canonical</p>
            </div>
            <span className="ml-2 hidden items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-slate-400 lg:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
              Research Preview · Not Canonical
            </span>
          </div>

          <nav className="hidden items-center gap-1 rounded-full border border-white/[0.06] bg-white/[0.03] p-1 lg:flex">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                  tab === t.id ? "bg-white text-slate-900 shadow-soft" : "text-slate-400 hover:text-white hover:bg-white/[0.06]"
                }`}
              >
                <t.Icon size={14} strokeWidth={1.75} className="shrink-0" />
                {t.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <AuthBadge />
            <span className="hidden rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-slate-400 sm:inline-flex">
              Research Preview · Testing
            </span>
            <button
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Toggle menu"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-slate-300 lg:hidden"
            >
              <span className="text-[14px] leading-none">{mobileOpen ? "✕" : "☰"}</span>
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="border-t border-white/[0.06] bg-[#020610] px-6 py-3 lg:hidden">
            <div className="flex flex-wrap gap-1.5">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setTab(t.id);
                    setMobileOpen(false);
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium ${
                    tab === t.id ? "bg-white text-slate-900" : "border border-white/10 bg-white/[0.03] text-slate-300"
                  }`}
                >
                  <t.Icon size={14} strokeWidth={1.75} /> {t.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-[1280px] px-6 pb-10 pt-10 lg:px-8 lg:pt-12">
        <div key={tab} className="animate-[in_0.28s_ease]">
          {tab === "overview" && (
            <div className="space-y-10">
              {/* SRE-like hero — one headline, one subline */}
              <section>
                <div className="max-w-[760px]">
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                    <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-300">Research Preview · Not Canonical</span>
                    <span className="text-[11px] text-slate-500">· FUHSI Lab Pilot</span>
                  </div>

                  <h1 className="mt-5 text-[32px] font-[800] leading-[0.95] tracking-[-0.03em] text-white sm:text-[38px] lg:text-[42px]">
                    PHYSI — Research Preview
                  </h1>
                  <p className="mt-4 max-w-[560px] text-[15px] leading-6 text-slate-400">
                    Testing with a small FUHSI cohort. Timetable is advisory only — Green check = real. Points have no cash value.
                  </p>

                  <div className="mt-6 flex flex-wrap items-center gap-3">
                    <button
                      onClick={() => setTab("mining")}
                      className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 shadow-soft transition hover:bg-slate-100"
                    >
                      {(stats?.users ?? 0) === 0 && !statsLoading ? "Be first — create profile" : "Start check-in"}
                    </button>
                    <button
                      onClick={() => setTab("roadmap")}
                      className="rounded-full border border-white/10 bg-white/[0.04] px-5 py-2.5 text-sm font-medium text-white hover:bg-white/[0.07]"
                    >
                      Push event
                    </button>
                    <span className="text-xs text-slate-500">Daily check-in · points · cap ~12/day · Green check = real</span>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-slate-500">
                    Green check = real · Others need a quick check · Daily cap visible in check-in. Points have no cash value.
                  </p>
                </div>

                {/* honest metric strip — raw counts only */}
                <div className="mt-10 grid grid-cols-2 gap-6 border-t border-white/[0.06] pt-6 lg:grid-cols-4">
                  {[
                    { label: "Pilot schools", value: "01", sub: "FUHSI-first · Lab" },
                    { label: "Verified events", value: statsLoading ? "—" : String(stats?.events ?? 0), sub: (stats?.events ?? 0) === 0 && !statsLoading ? "0 sown — be first" : "Green check = real" },
                    { label: "Active testers", value: statsLoading ? "—" : String(stats?.users ?? 0), sub: (stats?.users ?? 0) === 0 && !statsLoading ? "be first — invite cohort" : "students + admins" },
                    { label: "Verified", value: statsLoading ? "—" : String(stats?.checks ?? 0), sub: "Green check = real" },
                  ].map((m) => (
                    <div key={m.label} className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{m.label}</p>
                      <p className="mt-1 text-[22px] font-semibold tracking-tight tabular-nums text-white">{m.value}</p>
                      <p className="text-xs font-medium text-slate-500">{m.sub}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* two-column: profile + how it works — restrained cards */}
              <div className="grid gap-6 lg:grid-cols-[1.35fr_0.75fr]">
                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-6 shadow-soft lg:p-7">
                  <ProfilePilotForm />
                </div>

                <div className="space-y-6">
                  <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-6 shadow-soft">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Coin identity</p>
                    <div className="mt-4 flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-[11px] font-black tracking-tighter text-slate-900">
                        PHYSI
                      </div>
                      <div>
                        <p className="text-[15px] font-semibold text-white">PHYSI</p>
                        <p className="text-sm leading-5 text-slate-400">Event-driven truth coin.</p>
                        <p className="text-xs text-slate-500">Verified · Green check = real</p>
                      </div>
                    </div>
                    <div className="mt-5 grid grid-cols-3 gap-2 text-center">
                      {[
                        { k: "Base", v: "10" },
                        { k: "Bonus", v: "× level" },
                        { k: "Cooldown", v: "24h" },
                      ].map((s) => (
                        <div key={s.k} className="rounded-xl border border-white/10 bg-[#020610] px-2 py-3">
                          <p className="text-sm font-semibold text-white">{s.v}</p>
                          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{s.k}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-6 shadow-soft">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">How it works</p>
                    <ol className="mt-4 space-y-3">
                      {[
                        ["01", "Create profile", "Programme, level, statuses"],
                        ["02", "Push event", "Duplicate check + green check"],
                        ["03", "Check", "YES / NO / Skip — Green check = real"],
                        ["04", "Daily check-in", "Daily points · cap ~12/day · Green check = real"],
                      ].map(([n, t, d]) => (
                        <li key={n} className="flex gap-3">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white text-[11px] font-bold text-slate-900">
                            {n}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-white">{t}</p>
                            <p className="text-xs leading-4 text-slate-500">{d}</p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              </div>

              {/* 3×2 module grid — breathing space */}
              <section>
                <div className="flex items-baseline justify-between gap-4">
                  <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Modules</h2>
                  <span className="text-xs text-slate-600">6 modules · 3 × 2 grid</span>
                </div>
                <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {MODULES.map((mod) => (
                    <div
                      key={mod.title}
                      className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-6 shadow-soft transition-colors hover:bg-white/[0.05] hover:border-white/[0.09]"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-[14px] font-semibold tracking-tight text-white">{mod.title}</h3>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-slate-300">
                          <span className={`h-1.5 w-1.5 rounded-full ${mod.dot}`} />
                          {mod.status}
                        </span>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-400">{mod.detail}</p>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {tab === "mining" && (
            <div className="mx-auto max-w-[720px] space-y-4">
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-300">Daily check-in</span>
                <span className="text-xs text-slate-500">Points · cap ~12/day · Green check = real</span>
              </div>
              <MiningPanel />
            </div>
          )}
          {tab === "roadmap" && <EventRoadmap />}
          {tab === "timetable" && <TimetableFeed />}
          {tab === "verify" && <VerificationEngine />}
        </div>
      </main>

      {/* mobile bottom nav — minimal */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.06] bg-[#020610]/95 backdrop-blur-[10px] lg:hidden">
        <div className="mx-auto flex max-w-[1280px] items-center justify-around px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex flex-col items-center gap-1 rounded-xl px-3 py-1.5 ${tab === t.id ? "bg-white text-slate-900" : "text-slate-500"}`}
            >
              <t.Icon size={16} strokeWidth={1.75} />
              <span className="text-[10px] font-semibold uppercase tracking-wide">{t.label}</span>
            </button>
          ))}
        </div>
      </nav>

      <footer className="mx-auto max-w-[1280px] px-6 pb-24 pt-8 lg:px-8 lg:pb-10">
        <div className="border-t border-white/[0.06] pt-6 text-center text-xs leading-6 text-slate-500">
          © PHYSI — Research Preview · FUHSI Lab Pilot · Green check = real · Points have no cash value
        </div>
      </footer>
    </div>
  );
}

export default function Home() {
  return (
    <AuthProvider>
      <HomeInner />
    </AuthProvider>
  );
}
