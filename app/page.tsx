"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { LayoutDashboard, Pickaxe, Map, CalendarCheck, ShieldCheck, ArrowUpRight, Users, Radio, BadgeCheck, LogIn } from "lucide-react";
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

 // Timetable-first ordering: tool tabs first, marketing (Overview→About) last
const TABS: { id: TabId; label: string; Icon: React.ComponentType<any> }[] = [
  { id: "timetable", label: "Timetable", Icon: CalendarCheck },
  { id: "verify", label: "Verify", Icon: ShieldCheck },
  { id: "mining", label: "Check-in", Icon: Pickaxe },
  { id: "roadmap", label: "Roadmap", Icon: Map },
  { id: "overview", label: "About", Icon: LayoutDashboard },
];

const VALID_TABS = new Set<string>(TABS.map((t) => t.id));
function parseTab(raw: string | null): TabId {
  if (raw && VALID_TABS.has(raw)) return raw as TabId;
  return "timetable";
}

const MODULES = [
  { idx: "01", title: "Profile", desc: "Your student identity. Programme, level, and nickname — one profile each.", meta: "Ready", dot: "bg-emerald-400" },
  { idx: "02", title: "Roadmap", desc: "From “someone posted it” to “many confirmed it.” See how a lecture becomes trusted.", meta: "Live", dot: "bg-blue-400" },
  { idx: "03", title: "Live Timetable", desc: "The shared calendar. Every posted lecture with how many students confirmed it. Advisory — not official.", meta: "Live", dot: "bg-blue-400" },
  { idx: "04", title: "Daily Check-in", desc: "Pop in once a day. Earn TEST-PHYSI test points (no cash value) — more useful as more students join.", meta: "Live", dot: "bg-emerald-400" },
  { idx: "05", title: "Confirm", desc: "Simple Yes / No / Skip. When many students agree, a lecture shows as confirmed.", meta: "Live", dot: "bg-blue-400" },
  { idx: "06", title: "History", desc: "See who posted what, who confirmed, and what changed — all traceable.", meta: "Planned", dot: "bg-white/40" },
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

function HeaderLoginButton({ onLoginClick }: { onLoginClick: () => void }) {
  const { auth } = useAuth();
  if (auth?.nickname) return <AuthBadge />;
  // Ghost, not dominant white pill — value before login
  return (
    <div className="flex items-center gap-2">
      <a
        href="#profile"
        onClick={(e) => {
          e.preventDefault();
          onLoginClick();
        }}
        className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-2 text-[13px] font-medium text-slate-200 hover:bg-white hover:text-slate-900 hover:border-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
      >
        <LogIn size={14} strokeWidth={2} />
        Login
      </a>
      <a href="/api/profile" className="sr-only">API profile</a>
    </div>
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
    const qs = `?tab=${next}`;
    router.push(`/${qs}`, { scroll: false });
  }, [router]);

  const scrollToProfile = useCallback(() => {
    // Profile lives inside timetable/about now — ensure timetable or about visible then scroll
    const targetTab: TabId = tab === "timetable" || tab === "overview" ? tab : "timetable";
    if (tab !== targetTab) setTab(targetTab);
    requestAnimationFrame(() => {
      setTimeout(() => {
        document.getElementById("profile")?.scrollIntoView({ behavior: "smooth", block: "start" });
        try { history.replaceState(null, "", `?tab=${targetTab}#profile`); } catch {}
      }, 80);
    });
  }, [setTab, tab]);

  // Handle #profile hash on load
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash === "#profile") {
      setTimeout(() => document.getElementById("profile")?.scrollIntoView({ behavior: "smooth" }), 250);
    }
  }, []);

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
      {/* header — timetable-first, login de-emphasized */}
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#070a12]/80 backdrop-blur-[12px]">
        <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-6 px-6 py-3.5 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-white text-[10px] font-black tracking-[-0.04em] text-slate-900">PHYSI</div>
            <div className="hidden sm:block leading-none">
              <p className="font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-slate-500">Live timetable — advisory</p>
              <p className="mt-0.5 text-[12.5px] font-medium tracking-tight text-slate-300">Built by students · TEST-PHYSI no cash value</p>
            </div>
            <span className="hidden lg:inline-flex items-center gap-1.5 rounded-full border border-emerald-400/15 bg-emerald-400/10 px-2.5 py-1 font-mono text-[10.5px] font-medium tracking-wide text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live
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
            <HeaderLoginButton onLoginClick={scrollToProfile} />
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

      <main className="mx-auto max-w-[1240px] px-6 pb-10 pt-6 lg:px-8 lg:pt-8">
        <div key={tab} id={`tabpanel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} tabIndex={0} className="animate-[in_0.28s_ease] focus-visible:outline-none">
          {tab === "timetable" && (
            <div className="space-y-6">
              {/* ── TIMETABLE-FIRST: compact utility header — no essay ── */}
              <section className="rounded-[20px] border border-white/[0.06] bg-white/[0.02] px-5 py-4 sm:px-6 sm:py-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="text-[20px] font-[700] leading-none tracking-[-0.02em] text-white sm:text-[22px]">Live timetable</h1>
                      <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 font-mono text-[10px] font-semibold tracking-wide text-emerald-300">Advisory · Green check = real</span>
                      <span className="font-mono text-[11px] tracking-wide text-slate-500">Pilot — not official</span>
                    </div>
                    <p className="mt-2 max-w-[640px] text-[13.5px] leading-5 text-slate-400">
                      Next lectures straight from students. <span className="text-slate-300">Share what you hear, confirm what you see</span> — the more who use it, the more accurate it gets.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 lg:shrink-0">
                    <a href="#timetable-feed" className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-slate-900 hover:bg-slate-100 transition">
                      Today <ArrowUpRight size={14} className="opacity-60" />
                    </a>
                    <button onClick={scrollToProfile} className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[13px] font-medium text-slate-200 hover:bg-white/[0.08] transition">
                      {userCount === 0 && !statsLoading ? "Create profile" : "Log in to confirm"}
                    </button>
                  </div>
                </div>
                {/* micro-stats — inline, not hero billboard */}
                <div className="mt-4 flex flex-wrap gap-2 border-t border-white/[0.04] pt-3 font-mono text-[11px] tracking-wide text-slate-500">
                  <span>{statsLoading ? "…" : `${String(verifiedCount).padStart(2,"0")} confirmed`}</span>
                  <span className="text-slate-700">·</span>
                  <span>{statsLoading ? "…" : `${String(userCount).padStart(2,"0")} students`}</span>
                  <span className="text-slate-700">·</span>
                  <span>{statsLoading ? "…" : `${String(stats?.checks ?? 0).padStart(2,"0")} confirmations`}</span>
                  <span className="hidden sm:inline text-slate-600">— TEST-PHYSI has no cash value · Advisory only</span>
                </div>
              </section>

              {/* ── THE TOOL — timetable feed is first interactive element ── */}
              <div id="timetable-feed" className="scroll-mt-28">
                <TimetableFeed />
              </div>

              {/* ── SECONDARY: why it exists — collapsed to one row, below tool ── */}
              <section className="grid gap-3 sm:grid-cols-3">
                {[
                  { Icon: Radio, k: "Real-time, not official", v: "Anyone can pitch a lecture — it lands instantly, marked advisory." },
                  { Icon: Users, k: "Verified by cohort", v: "Yes / No / Skip. Many agrees → green check." },
                  { Icon: BadgeCheck, k: "Always double-check", v: "Green is strongest signal — still confirm exams with dept." },
                ].map((c) => (
                  <div key={c.k} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                    <div className="flex items-center gap-2">
                      <c.Icon size={13} strokeWidth={1.8} className="text-slate-400" />
                      <p className="text-[12.5px] font-semibold tracking-tight text-white">{c.k}</p>
                    </div>
                    <p className="mt-1 text-[12.5px] leading-5 text-slate-400">{c.v}</p>
                  </div>
                ))}
              </section>

              {/* ── LOGIN — deferred, below tool, not a wall before it ── */}
              <div id="profile" className="scroll-mt-28">
                <div className="flex items-center justify-between gap-3 px-1">
                  <p className="font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-slate-500">Profile — log in to post & confirm</p>
                  <span className="font-mono text-[11px] tracking-wide text-slate-600">Programme · Level · Handle</span>
                </div>
                <div className="mt-3 rounded-[20px] border border-white/[0.06] bg-white/[0.02] p-1">
                  <ProfilePilotForm />
                </div>
                <p className="mt-2 text-center font-mono text-[11px] leading-4 text-slate-600">
                  Already have a handle? Re-enter it — we&apos;ll log you back in. No password in pilot.
                </p>
              </div>

              {/* ── DETAILS — collapsed strip for curiosity, not wall ── */}
              <details className="group rounded-2xl border border-white/[0.06] bg-white/[0.02] px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                  <span className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">How it works — 4 steps</span>
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 font-mono text-[11px] tracking-wide text-slate-400 group-open:hidden">Show</span>
                  <span className="hidden rounded-full border border-white/10 bg-white px-3 py-1 font-mono text-[11px] font-semibold tracking-wide text-slate-900 group-open:inline-flex">Hide</span>
                </summary>
                <div className="mt-4 grid gap-3 sm:grid-cols-4">
                  {[
                    ["01", "Join", "Create profile — programme, level, nickname."],
                    ["02", "Share", "Post venue, time, course you heard about."],
                    ["03", "Confirm", "Tap Yes / No / Skip — together we sort it."],
                    ["04", "Check in", "Daily pop-in → TEST-PHYSI (no value, 24h)."],
                  ].map(([n, t, d]) => (
                    <div key={n} className="rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-3">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-white font-mono text-[11px] font-bold text-slate-900">{n}</span>
                      <p className="mt-2 text-[13px] font-semibold text-white">{t}</p>
                      <p className="mt-1 font-mono text-[11px] leading-4 text-slate-500">{d}</p>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}

          {tab === "overview" && (
            <div className="space-y-6">
              {/* ── ABOUT: also timetable-first — no disorientation even if linked here ── */}
              <section className="rounded-[20px] border border-white/[0.06] bg-white/[0.02] px-5 py-4 sm:px-6 sm:py-5">
                <div className="flex flex-col gap-2">
                  <div className="inline-flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                    <span className="font-mono text-[10.5px] font-medium uppercase tracking-[0.12em] text-slate-400">About PHYSI — pilot, advisory, not official</span>
                  </div>
                  <h1 className="text-[22px] font-[700] leading-tight tracking-[-0.025em] text-white sm:text-[24px]">A live timetable, built by the students who use it.</h1>
                  <p className="max-w-[640px] text-[13.5px] leading-5 text-slate-400">
                    No one knows next week&apos;s lectures and venues — especially freshers finding their way around. PHYSI is a student real-time calendar: share what you hear, confirm what you see. <button onClick={() => setTab("timetable")} className="font-semibold text-white underline decoration-white/20 underline-offset-4 hover:text-slate-200">Open timetable →</button>
                  </p>
                </div>
              </section>

              <div id="timetable-feed-about" className="scroll-mt-28">
                <TimetableFeed />
              </div>

              <section id="value" className="scroll-mt-24">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-slate-500">Why PHYSI exists</p>
                  <button onClick={() => setTab("timetable")} className="font-mono text-[11px] tracking-wide text-slate-500 hover:text-white">Go to timetable →</button>
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  {[
                    { idx: "§01", Icon: Radio, title: "Real-time, not official", desc: "Anyone in the pilot can pitch an event — guest lecture, room change, workshop. It appears instantly in the advisory feed.", accent: "text-emerald-400" },
                    { idx: "§02", Icon: Users, title: "Verified by the cohort", desc: "Classmates vote YES / NO / Skip. When consensus tips, the event gets a green-check. Only those who were there decide.", accent: "text-blue-400" },
                    { idx: "§03", Icon: BadgeCheck, title: "Advisory, not canonical", desc: "Green-check is the strongest signal we have — but always check the official source before you travel.", accent: "text-slate-300" },
                  ].map((c) => (
                    <div key={c.title} className="physi-index-card group">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[10px] font-bold tracking-[0.14em] text-slate-500">{c.idx}</span>
                        <c.Icon size={14} strokeWidth={1.8} className={c.accent} />
                      </div>
                      <h3 className="mt-3 text-[14px] font-semibold tracking-tight text-white">{c.title}</h3>
                      <div className="physi-rule my-3" />
                      <p className="text-[13.5px] leading-6 text-slate-400">{c.desc}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 flex flex-wrap items-center gap-2 text-[12.5px] leading-5 text-slate-400">
                  <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400/70" />
                  <span className="font-medium text-slate-300">Confidence signal on every event</span>
                  <span className="text-slate-600">— high / medium / low based on verification weight. Low doesn&apos;t mean false, just unverified yet.</span>
                </div>
              </section>

              <section id="how" className="scroll-mt-24">
                <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
                  <div>
                    <p className="font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-slate-500">How it works</p>
                    <h2 className="mt-3 text-[22px] font-semibold leading-tight tracking-[-0.02em] text-white sm:text-[26px]">Four steps. No shortcuts.</h2>
                    <p className="mt-3 text-[14px] leading-6 text-slate-400">
                      Freshers get lost. Venues change. This calendar stays live because students keep it live — and the more who join, the better it works. Daily check-in earns TEST-PHYSI (test points only, no cash value, 24h cooldown).
                    </p>
                    <ol className="mt-6 space-y-3">
                      {[
                        ["01", "Join", "Create your profile — programme, level, and a nickname. One profile per person."],
                        ["02", "Share", "Heard about a lecture? Post the venue, time, and course so others know."],
                        ["03", "Confirm", "See a lecture posted? Tap Yes, No, or Skip — together we sort what&apos;s real."],
                        ["04", "Check in daily", "Pop in once a day to stay synced. Earn TEST-PHYSI test points (no value, 24h cooldown)."],
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
                    <div className="mt-6 grid grid-cols-3 gap-2 max-w-[360px]">
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
                  <div className="space-y-4">
                    <div className="physi-index-card">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white text-[10px] font-black tracking-tighter text-slate-900">PHYSI</div>
                        <div>
                          <p className="text-[13px] font-semibold tracking-tight text-white">PHYSI Protocol</p>
                          <p className="font-mono text-[10px] tracking-wide text-slate-500">Event-driven · Green-check canonical · Advisory</p>
                        </div>
                      </div>
                      <div className="physi-rule my-3" />
                      <p className="text-[13px] leading-5 text-slate-400">
                        Every event is traceable — who pitched it, who verified it, when consensus was reached. The audit trail is the feature.
                      </p>
                    </div>
                    <div id="profile" className="physi-panel scroll-mt-28 p-6 lg:p-7">
                      <div className="mb-5 flex items-center justify-between gap-3">
                        <p className="font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-slate-500">Pilot access · Login</p>
                        <span className="font-mono text-[10.5px] tracking-wide text-slate-600">Programme · Level · Handle</span>
                      </div>
                      <ProfilePilotForm />
                      <p className="mt-4 text-center font-mono text-[11px] leading-4 text-slate-600">
                        Existing handle? Just re-enter it — we&apos;ll log you back in. No password in pilot.
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              <section>
                <div className="flex items-baseline justify-between gap-4">
                  <h2 className="font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-slate-500">Modules · PHYSI index</h2>
                  <span className="font-mono text-[11px] tracking-wide text-slate-600">06 · rule + mono</span>
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {MODULES.map((mod) => (
                    <div key={mod.title} className="physi-index-card group transition hover:border-white/10">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-mono text-[11px] font-bold tracking-[0.12em] text-slate-500">{mod.idx} — {mod.title}</span>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.04] px-2 py-1 font-mono text-[10px] font-medium tracking-wide text-slate-400">
                          <span className={`h-1.5 w-1.5 rounded-full ${mod.dot}`} /> {mod.meta}
                        </span>
                      </div>
                      <div className="physi-rule my-3" />
                      <p className="text-[13.5px] leading-6 text-slate-400">{mod.desc}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section id="cta" aria-label="Final call to action" className="scroll-mt-24 rounded-[24px] border border-white/[0.07] bg-gradient-to-b from-white/[0.05] to-white/[0.02] p-8 lg:p-10 shadow-card text-center" style={{ borderRadius: "24px" }}>
                <div className="mx-auto max-w-[640px]">
                  <p className="font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-slate-500">Ready to join?</p>
                  <h2 className="mt-3 text-[24px] font-semibold tracking-[-0.02em] text-white sm:text-[28px]">Be part of the live calendar.</h2>
                  <p className="mx-auto mt-3 max-w-[520px] text-[14.5px] leading-6 text-slate-400">
                    Create your pilot profile in 20 seconds — handle, programme, level. Or log in if you already have one. The timetable gets better the more students are in it.
                  </p>
                  <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
                    <a
                      href="#profile"
                      onClick={(e) => { e.preventDefault(); scrollToProfile(); }}
                      className="inline-flex items-center gap-1.5 rounded-full bg-white px-6 py-3 text-[14px] font-semibold text-slate-900 shadow-soft hover:bg-slate-100 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                    >
                      <LogIn size={16} strokeWidth={2} />
                      Login — go to profile
                    </a>
                    <button
                      onClick={() => setTab("timetable")}
                      className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-6 py-3 text-[14px] font-medium text-white hover:bg-white/[0.08] transition"
                    >
                      Open timetable
                      <ArrowUpRight size={16} strokeWidth={2} className="opacity-60" />
                    </button>
                  </div>
                  <p className="mt-4 font-mono text-[11px] tracking-wide text-slate-600">
                    Pilot only · Advisory · No cash value · <a href="/api/profile" className="underline decoration-white/20 underline-offset-4 hover:text-slate-400">API: /api/profile</a>
                  </p>
                </div>
              </section>
            </div>
          )}

          {tab === "mining" && (
            <div className="mx-auto max-w-[720px] space-y-4">
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 font-mono text-[11px] font-medium tracking-wide text-slate-300">Check-in</span>
                <span className="font-mono text-[11px] tracking-wide text-slate-500">10 base · × level · 24h · cap ~12/day</span>
              </div>
              <MiningPanel />
            </div>
          )}
          {tab === "roadmap" && <EventRoadmap />}
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
          PHYSI · Live timetable — advisory · Not official · TEST-PHYSI — test points only, no cash value · Always confirm official venues with your department
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
