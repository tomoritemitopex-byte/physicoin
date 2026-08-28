"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { LayoutDashboard, Pickaxe, Map, CalendarCheck, ShieldCheck, ArrowUpRight } from "lucide-react";
import { AuthProvider, useAuth } from "@/components/auth-context";
import { ProfilePilotForm } from "@/components/profile-pilot-form";

// ── Code-split heavy panels (ssr:false reduces initial JS, tabs load on demand) ──
const MiningPanel = dynamic(() => import("@/components/mining-panel").then((m) => m.MiningPanel), {
  ssr: false,
  loading: () => <PanelSkeleton label="Loading Mining…" />,
});
const EventRoadmap = dynamic(() => import("@/components/event-roadmap").then((m) => m.EventRoadmap), {
  ssr: false,
  loading: () => <PanelSkeleton label="Loading Roadmap…" />,
});
const TimetableFeed = dynamic(() => import("@/components/timetable-feed").then((m) => m.TimetableFeed), {
  ssr: false,
  loading: () => <PanelSkeleton label="Loading Timetable…" />,
});
const VerificationEngine = dynamic(() => import("@/components/verification-engine").then((m) => m.VerificationEngine), {
  ssr: false,
  loading: () => <PanelSkeleton label="Loading Verification…" />,
});

function PanelSkeleton({ label }: { label: string }) {
  return (
    <div className="animate-pulse rounded-[2rem] border border-white/10 bg-white/[0.03] p-8 text-center">
      <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
      <p className="mt-3 text-sm font-medium text-slate-400">{label}</p>
    </div>
  );
}

type TabId = "overview" | "mining" | "roadmap" | "timetable" | "verify";

const TABS: { id: TabId; label: string; Icon: React.ComponentType<any> }[] = [
  { id: "overview", label: "Overview", Icon: LayoutDashboard },
  { id: "mining", label: "Mining", Icon: Pickaxe },
  { id: "roadmap", label: "Roadmap", Icon: Map },
  { id: "timetable", label: "Timetable", Icon: CalendarCheck },
  { id: "verify", label: "Verify", Icon: ShieldCheck },
];

const VALID_TABS = new Set<string>(TABS.map((t) => t.id));
function parseTab(raw: string | null): TabId {
  if (raw && VALID_TABS.has(raw)) return raw as TabId;
  return "overview";
}

const MODULES = [
  { title: "Identity", desc: "Pilot profile, programme and level. One record per handle.", meta: "Ready", dot: "bg-emerald-400" },
  { title: "Roadmap", desc: "Six steps from pitch to green-check. Deterministic, no shortcuts.", meta: "Live", dot: "bg-blue-400" },
  { title: "Timetable", desc: "Advisory feed with confidence signal. Source of schedule truth.", meta: "Live", dot: "bg-blue-400" },
  { title: "Mining", desc: "Daily proof-of-presence. 10 base, level-weighted, 24h cooldown.", meta: "Live", dot: "bg-emerald-400" },
  { title: "Verification", desc: "YES / NO / Skip. Consensus weighted by authority. Green-check is final.", meta: "Live", dot: "bg-blue-400" },
  { title: "Audit", desc: "Activity, flags and history. Everything is traceable.", meta: "Planned", dot: "bg-white/40" },
];

function AuthBadge() {
  const { auth, setAuth } = useAuth();
  if (!auth?.nickname) return null;
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">
      <span className="font-mono text-[11px] font-medium tracking-wide text-slate-300">@{auth.nickname}</span>
      <button
        onClick={() => {
          setAuth(null);
          try { localStorage.removeItem("physi_nickname"); localStorage.removeItem("physi_fullname"); } catch {}
        }}
        className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-900 hover:bg-slate-100 transition"
      >
        Sign out
      </button>
    </span>
  );
}

function Banner({ error, onDismiss }: { error: { code?: string; message: string; hint?: string } | null; onDismiss: () => void }) {
  if (!error) return null;
  const isDb = error.code === "DB_NOT_CONFIGURED";
  return (
    <div
      role="alert"
      className={`mx-auto max-w-[1240px] px-6 lg:px-8 ${isDb ? "" : ""}`}
      style={{ marginTop: isDb ? 0 : undefined }}
    >
      <div
        className={`mt-4 flex flex-wrap items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-sm leading-6 shadow-lg ${
          isDb
            ? "border-amber-400/30 bg-amber-400/10 text-amber-200"
            : "border-red-400/30 bg-red-400/10 text-red-200"
        }`}
      >
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {isDb ? "API degraded — database not configured" : "API error"} · <span className="font-mono text-xs opacity-80">{error.code ?? "ERROR"}</span>
          </p>
          <p className="mt-0.5 text-[13px] leading-5 opacity-90">{error.message}</p>
          {error.hint && <p className="mt-1 font-mono text-[11px] leading-4 opacity-70">{error.hint}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isDb && (
            <a
              href="/api/health"
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-white/20 bg-white px-3 py-1.5 text-xs font-bold text-slate-900 hover:bg-slate-100"
            >
              Check /api/health
            </a>
          )}
          <button
            onClick={onDismiss}
            aria-label="Dismiss banner"
            className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

function HomeInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlTab = parseTab(searchParams.get("tab"));
  const [tab, setTabState] = useState<TabId>(urlTab);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [stats, setStats] = useState<{ users: number; events: number; checks: number } | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [apiError, setApiError] = useState<{ code?: string; message: string; hint?: string } | null>(null);

  // Sync when URL changes (back/forward, share link, refresh)
  useEffect(() => {
    setTabState(urlTab);
  }, [urlTab]);

  const setTab = useCallback((next: TabId) => {
    setTabState(next);
    const qs = next === "overview" ? "" : `?tab=${next}`;
    router.push(`/${qs}`, { scroll: false });
  }, [router]);

  useEffect(() => {
    let alive = true;
    fetch("/api/health")
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (j && j.db === false) {
          setApiError({
            code: "DB_NOT_CONFIGURED",
            message: j.hint ?? j.banner ?? "DATABASE_URL not configured — app is in preview/mock mode.",
            hint: "Set DATABASE_URL in Vercel Dashboard → Settings → Environment Variables and redeploy. See /tmp/vercel-env-steps.md or /api/health.",
          });
        }
      })
      .catch(() => {});
    fetch("/api/stats")
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (!alive) return;
        if (!r.ok || j?.ok === false) {
          const code = j?.code ?? (r.status === 503 ? "DB_NOT_CONFIGURED" : "STATS_ERROR");
          setApiError({
            code,
            message: j?.error ?? j?.banner ?? `Stats API returned ${r.status}`,
            hint: j?.hint ?? (code === "DB_NOT_CONFIGURED" ? "Add DATABASE_URL in Vercel env and redeploy." : undefined),
          });
          if (j?.counts) setStats({ users: Number(j.counts.physi_users ?? 0), events: Number(j.counts.physi_events ?? 0), checks: Number(j.counts.physi_verifications ?? 0) });
          return;
        }
        if (j?.metrics) setStats({ users: Number(j.metrics.users ?? 0), events: Number(j.metrics.events ?? 0), checks: Number(j.metrics.verifications ?? j.metrics.checks ?? 0) });
        else if (j?.counts) setStats({ users: Number(j.counts.physi_users ?? 0), events: Number(j.counts.physi_events ?? 0), checks: Number(j.counts.physi_verifications ?? 0) });
        setApiError(null);
      })
      .catch((e) => {
        if (!alive) return;
        setApiError({ code: "NETWORK_ERROR", message: e instanceof Error ? e.message : "Network error loading stats", hint: "Check /api/health and Vercel logs." });
      })
      .finally(() => {
        if (alive) setStatsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const verifiedCount = stats?.events ?? 0;
  const userCount = stats?.users ?? 0;

  const handleTabKeyDown = (e: React.KeyboardEvent, currentId: TabId) => {
    const idx = TABS.findIndex((t) => t.id === currentId);
    let nextIdx: number | null = null;
    if (e.key === "ArrowRight") nextIdx = (idx + 1) % TABS.length;
    else if (e.key === "ArrowLeft") nextIdx = (idx - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") nextIdx = 0;
    else if (e.key === "End") nextIdx = TABS.length - 1;
    if (nextIdx !== null) {
      e.preventDefault();
      const next = TABS[nextIdx].id;
      setTab(next);
      requestAnimationFrame(() => document.getElementById(`tab-${next}`)?.focus());
    }
  };

  return (
    <div className="min-h-screen bg-[#070a12] text-slate-100 selection:bg-[#3b82f6]/20">
      {/* mesh deduplicated — owned by layout.tsx only */}

      {/* header — Linear-tight, Vercel-precise */}
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#070a12]/80 backdrop-blur-[12px]">
        <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-6 px-6 py-3.5 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-white text-[10px] font-black tracking-[-0.04em] text-slate-900">PHYSI</div>
            <div className="hidden sm:block leading-none">
              <p className="font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-slate-500">Research Preview</p>
              <p className="mt-0.5 text-[12.5px] font-medium tracking-tight text-slate-300">FUHSI Lab · Not canonical</p>
            </div>
            <span className="hidden lg:inline-flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.03] px-2.5 py-1 font-mono text-[10.5px] font-medium tracking-wide text-slate-500">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/70" /> Preview
            </span>
          </div>

          <nav role="tablist" aria-label="Primary" className="hidden lg:flex items-center rounded-full border border-white/[0.06] bg-white/[0.03] p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                id={`tab-${t.id}`}
                role="tab"
                aria-selected={tab === t.id}
                aria-controls={`tabpanel-${t.id}`}
                tabIndex={tab === t.id ? 0 : -1}
                onClick={() => setTab(t.id)}
                onKeyDown={(e) => handleTabKeyDown(e, t.id)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${tab === t.id ? "bg-white text-slate-900 shadow-soft" : "text-slate-400 hover:text-white hover:bg-white/[0.06]"}`}
              >
                <t.Icon size={14} strokeWidth={1.7} className="shrink-0" /> {t.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <AuthBadge />
            <button
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Toggle menu"
              aria-expanded={mobileOpen}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-400 lg:hidden"
            >
              <span className="text-[13px] leading-none">{mobileOpen ? "✕" : "☰"}</span>
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="border-t border-white/[0.06] bg-[#070a12] px-6 py-3 lg:hidden">
            <div role="tablist" aria-label="Primary mobile" className="flex flex-wrap gap-1.5">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  id={`tab-${t.id}-mobile`}
                  role="tab"
                  aria-selected={tab === t.id}
                  aria-controls={`tabpanel-${t.id}`}
                  tabIndex={tab === t.id ? 0 : -1}
                  onClick={() => { setTab(t.id); setMobileOpen(false); }}
                  onKeyDown={(e) => handleTabKeyDown(e, t.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium ${tab === t.id ? "bg-white text-slate-900" : "border border-white/10 bg-white/[0.03] text-slate-300"}`}
                >
                  <t.Icon size={14} strokeWidth={1.7} /> {t.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      <Banner error={apiError} onDismiss={() => setApiError(null)} />

      <main className="mx-auto max-w-[1240px] px-6 pb-10 pt-10 lg:px-8 lg:pt-14">
        <div key={tab} id={`tabpanel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} tabIndex={0} className="animate-[in_0.28s_ease] focus-visible:outline-none">
          {tab === "overview" && (
            <div className="space-y-10">
              <section>
                <div className="max-w-[720px]">
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.06] bg-white/[0.03] px-3 py-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                    <span className="font-mono text-[10.5px] font-medium uppercase tracking-[0.12em] text-slate-400">Research Preview</span>
                    <span className="hidden sm:inline font-mono text-[10.5px] text-slate-600">— FUHSI Lab Pilot · Not canonical</span>
                  </div>

                  <h1 className="mt-6 text-[34px] font-[720] leading-[0.94] tracking-[-0.035em] text-white sm:text-[40px] lg:text-[44px]" style={{ fontFeatureSettings: '"cv01","ss03"' }}>
                    Event truth,
                    <br />
                    <span className="text-slate-400">verified by the cohort.</span>
                  </h1>

                  <p className="mt-4 max-w-[520px] text-[15px] leading-6 text-slate-400">
                    PHYSI is a pilot protocol for FUHSI — pitch events, verify, stay in sync. Advisory by design; green-check is canonical.
                  </p>

                  <div className="mt-7 flex flex-wrap items-center gap-3">
                    <button onClick={() => setTab("mining")} className="inline-flex items-center gap-1.5 rounded-full bg-white px-5 py-2.5 text-[13.5px] font-semibold text-slate-900 shadow-soft hover:bg-slate-100 transition">
                      {userCount === 0 && !statsLoading ? "Create profile" : "Open mining"} <ArrowUpRight size={14} strokeWidth={2} className="opacity-60" />
                    </button>
                    <button onClick={() => setTab("roadmap")} className="rounded-full border border-white/[0.08] bg-white/[0.04] px-5 py-2.5 text-[13.5px] font-medium text-white hover:bg-white/[0.07] transition">
                      Explore roadmap
                    </button>
                    <span className="font-mono text-[11px] tracking-wide text-slate-500">10 base · × level · 24h</span>
                  </div>
                </div>

                <div className="mt-10 grid grid-cols-2 gap-0 divide-x divide-white/[0.06] border-y border-white/[0.06] lg:grid-cols-4">
                  {[
                    { label: "Pilot cohort", value: "FUHSI", sub: "Lab · 1 school", loading: false },
                    { label: "Verified events", value: String(verifiedCount).padStart(2, "0"), sub: verifiedCount === 0 && !statsLoading ? "No canonical yet" : "Green-check", loading: statsLoading },
                    { label: "Testers", value: String(userCount).padStart(2, "0"), sub: userCount === 0 && !statsLoading ? "Be first" : "Pilot cohort", loading: statsLoading },
                    { label: "Verifications", value: String(stats?.checks ?? 0).padStart(2, "0"), sub: "Consensus votes", loading: statsLoading },
                  ].map((m) => (
                    <div key={m.label} className="px-5 py-5 first:pl-0 lg:px-6 lg:py-6">
                      <p className="font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-slate-500">{m.label}</p>
                      {m.loading ? (
                        <div className="mt-2 h-7 w-14 animate-pulse rounded bg-white/10" aria-hidden="true" />
                      ) : (
                        <p className="mt-2 font-mono text-[20px] font-semibold tracking-tight tabular-nums text-white">{m.value}</p>
                      )}
                      <p className="mt-0.5 text-xs text-slate-500">{m.loading ? <span className="inline-block h-3 w-24 animate-pulse rounded bg-white/5" aria-hidden="true" /> : m.sub}</p>
                    </div>
                  ))}
                </div>
              </section>

              <div className="grid gap-6 lg:grid-cols-[1.4fr_0.78fr]">
                <div className="rounded-card border border-white/[0.07] bg-white/[0.03] p-6 lg:p-7 shadow-card" style={{ borderRadius: "var(--radius-card)" }}>
                  <div className="mb-5 flex items-center justify-between">
                    <p className="font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-slate-500">Pilot access</p>
                    <span className="font-mono text-[10.5px] tracking-wide text-slate-600">Programme · Level · Handle</span>
                  </div>
                  <ProfilePilotForm />
                </div>

                <div className="space-y-6">
                  <div className="rounded-card border border-white/[0.07] bg-white/[0.03] p-6 shadow-card" style={{ borderRadius: "var(--radius-card)" }}>
                    <p className="font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-slate-500">Protocol</p>
                    <div className="mt-5 flex items-center gap-4">
                      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-[10px] font-black tracking-tighter text-slate-900">PHYSI</div>
                      <div>
                        <p className="text-[14px] font-semibold tracking-tight text-white">PHYSI</p>
                        <p className="font-mono text-xs tracking-wide text-slate-500">Event-driven · Green-check canonical</p>
                      </div>
                    </div>
                    <div className="mt-5 grid grid-cols-3 gap-2">
                      {[
                        { k: "Base", v: "10" },
                        { k: "Weight", v: "× level" },
                        { k: "Window", v: "24h" },
                      ].map((s) => (
                        <div key={s.k} className="rounded-xl border border-white/[0.06] bg-[#070a12] px-2 py-3 text-center">
                          <p className="font-mono text-[13px] font-semibold tabular-nums text-white">{s.v}</p>
                          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-slate-500">{s.k}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-card border border-white/[0.07] bg-white/[0.03] p-6 shadow-card" style={{ borderRadius: "var(--radius-card)" }}>
                    <p className="font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-slate-500">How it works</p>
                    <ol className="mt-4 space-y-3">
                      {[
                        ["01", "Create profile", "Handle + programme + level"],
                        ["02", "Pitch event", "Title · venue · time · scope"],
                        ["03", "Verify", "YES / NO / Skip — consensus"],
                        ["04", "Mine daily", "Proof-of-presence · 24h cooldown"],
                      ].map(([n, t, d]) => (
                        <li key={n} className="flex gap-3">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/[0.06] bg-white font-mono text-[11px] font-bold tracking-wide text-slate-900">{n}</span>
                          <div className="min-w-0 pt-0.5">
                            <p className="text-[13.5px] font-medium leading-none text-white">{t}</p>
                            <p className="mt-1 font-mono text-[11.5px] leading-4 text-slate-500">{d}</p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              </div>

              <section>
                <div className="flex items-baseline justify-between gap-4">
                  <h2 className="font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-slate-500">Modules</h2>
                  <span className="font-mono text-[11px] tracking-wide text-slate-600">6 · 3 × 2</span>
                </div>
                <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {MODULES.map((mod) => (
                    <div key={mod.title} className="rounded-module group border border-white/[0.06] bg-white/[0.03] p-6 shadow-soft transition hover:border-white/[0.09] hover:bg-white/[0.05]" style={{ borderRadius: "var(--radius-module)" }}>
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-[14px] font-semibold tracking-tight text-white">{mod.title}</h3>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.04] px-2.5 py-1 font-mono text-[10.5px] font-medium tracking-wide text-slate-400">
                          <span className={`h-1.5 w-1.5 rounded-full ${mod.dot}`} /> {mod.meta}
                        </span>
                      </div>
                      <p className="mt-3 text-[13.5px] leading-6 text-slate-400">{mod.desc}</p>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {tab === "mining" && (
            <div className="mx-auto max-w-[720px] space-y-4">
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 font-mono text-[11px] font-medium tracking-wide text-slate-300">Mining</span>
                <span className="font-mono text-[11px] tracking-wide text-slate-500">10 base · × level · 24h · cap ~12/day</span>
              </div>
              <MiningPanel />
            </div>
          )}
          {tab === "roadmap" && <EventRoadmap />}
          {tab === "timetable" && <TimetableFeed />}
          {tab === "verify" && <VerificationEngine />}
        </div>
      </main>

      <nav role="tablist" aria-label="Primary mobile bottom" className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.06] bg-[#070a12]/95 backdrop-blur-[12px] lg:hidden">
        <div className="mx-auto flex max-w-[1240px] items-center justify-around px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {TABS.map((t) => (
            <button
              key={t.id}
              id={`tab-${t.id}-bottom`}
              role="tab"
              aria-selected={tab === t.id}
              aria-controls={`tabpanel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => setTab(t.id)}
              onKeyDown={(e) => handleTabKeyDown(e, t.id)}
              className={`flex flex-col items-center gap-1 rounded-xl px-3 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 ${tab === t.id ? "bg-white text-slate-900" : "text-slate-500"}`}
            >
              <t.Icon size={16} strokeWidth={1.7} />
              <span className="font-mono text-[9.5px] font-semibold uppercase tracking-wide">{t.label}</span>
            </button>
          ))}
        </div>
      </nav>

      <footer className="mx-auto max-w-[1240px] px-6 pb-24 pt-8 lg:px-8 lg:pb-10">
        <div className="border-t border-white/[0.06] pt-6 text-center font-mono text-[11px] leading-6 tracking-wide text-slate-600">
          PHYSI · Research Preview · FUHSI Lab Pilot · Advisory · No cash value
        </div>
      </footer>
    </div>
  );
}

export default function Home() {
  return (
    <AuthProvider>
      <Suspense fallback={<div className="min-h-screen bg-[#070a12] flex items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/60" /></div>}>
        <HomeInner />
      </Suspense>
    </AuthProvider>
  );
}
