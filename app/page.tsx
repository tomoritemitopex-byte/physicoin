import { ArrowRight, ShieldCheck, Clock3, Users, Sparkles, MapPin } from 'lucide-react';
import CampusPreview from '@/components/road/CampusPreview';
import { getStatsData, getTimetableFeed } from '@/lib/data';

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function StatsAndTicker() {
  const stats = await getStatsData();
  const timetable = await getTimetableFeed();
  const totalEvents = stats.metrics?.events ?? timetable.events.length;
  const verifiedCount = stats.metrics?.events_by_status?.verified ?? 0;

  const fallbackTicker = [
    "PHYS · built by students",
    "green tick = confirmed",
    "8 departments · live feed",
  ];

  const recentItems: string[] = (stats.ok && Array.isArray(stats.recent) && stats.recent.length > 0)
    ? stats.recent.slice(0, 5).map((x: any) => `${String(x.handle || x.name || "someone")} verified ${String(x.title || "event")} · now`)
    : [];

  const tickerItems = recentItems.length > 0 ? recentItems : fallbackTicker;
  const doubled = [...tickerItems, ...tickerItems];

  return (
    <>
      <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5" style={{ borderColor: 'var(--physi-sky)', backgroundColor: 'var(--physi-card)' }}>
        <span className="h-2 w-2 rounded-full bg-green animate-pulse" />
        <span className="font-mono text-xs font-medium" style={{ color: 'var(--physi-ink)' }}>student-powered · live</span>
      </span>

      <section className="mt-6 rounded-2xl border px-5 py-4" style={{ borderColor: 'var(--physi-sky)', backgroundColor: 'var(--physi-card)', boxShadow: 'var(--physi-shadow)' }}>
        <span className="inline-flex items-center gap-2 rounded-full border border-amber/30 bg-amber/10 px-3 py-1.5 font-mono text-xs font-semibold" style={{ color: 'var(--physi-amber)' }}>
          <span className="h-2 w-2 rounded-full animate-pulse" style={{ backgroundColor: 'var(--physi-amber)' }} />
          Live proof
        </span>
        <span className="ml-2 rounded-full border px-3 py-1.5 font-mono text-xs" style={{ borderColor: 'var(--physi-sky)', color: 'var(--physi-sky)', backgroundColor: 'rgba(3, 105, 161, 0.1)' }}>
          {totalEvents} events
        </span>
        <span className="ml-2 rounded-full border border-green/30 bg-green/10 px-3 py-1.5 font-mono text-xs" style={{ color: 'var(--physi-green-bright)' }}>
          {verifiedCount} verified
        </span>
        <span className="ml-auto hidden sm:inline font-mono text-xs" style={{ color: 'var(--physi-stone)' }}>updates every 30s</span>
        <a href="/app/roadmap" className="rounded-full px-4 py-1.5 text-xs font-bold text-white hover:opacity-90 transition" style={{ backgroundColor: 'var(--physi-sky)' }}>See timetable →</a>
      </section>

      <div className="mt-3 overflow-hidden rounded-full border" style={{ borderColor: 'var(--physi-sky)', backgroundColor: 'var(--physi-card)' }}>
        <div className="flex animate-ticker items-center gap-6 whitespace-nowrap px-4 py-2.5">
          {doubled.map((t, i) => (
            <span key={i} className="inline-flex items-center gap-1.5 font-mono text-xs" style={{ color: 'var(--physi-ink-70)' }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--physi-green)' }} />{t}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen selection:text-white" style={{ backgroundColor: 'var(--physi-paper)', color: 'var(--physi-ink)',  }}>
      {/* Soft gradient backdrop */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0" style={{ backgroundColor: 'var(--physi-paper)' }} />
        <div className="absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full opacity-10" style={{ background: 'radial-gradient(ellipse at center, var(--physi-sky), transparent 70%)' }} />
        <div className="absolute top-[32%] right-[-4%] h-[380px] w-[380px] rounded-full opacity-5" style={{ background: 'radial-gradient(ellipse at center, var(--physi-green), transparent 70%)' }} />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-20 border-b" style={{ borderColor: 'var(--physi-sky)', backgroundColor: 'rgba(255, 255, 255, 0.8)', backdropFilter: 'blur(12px)' }}>
        <div className="mx-auto flex max-w-[1120px] items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg text-white font-black tracking-tight" style={{ backgroundColor: 'var(--physi-accent)' }}>PHYSI</div>
            <span className="hidden sm:inline text-sm font-semibold tracking-tight" style={{ color: 'var(--physi-ink)' }}>PHYSI</span>
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px]" style={{ borderColor: 'var(--physi-sky)', color: 'var(--physi-ink-60)' }}>advisory · not official</span>
          </div>
          <nav className="flex items-center gap-2">
            <a href="/app/roadmap" className="hidden sm:inline-flex text-sm font-medium transition px-3 py-1.5">See live timetable</a>
            <a href="/app/roadmap" className="primary-cta inline-flex items-center gap-1.5 px-5 py-2 text-sm font-semibold">See live timetable <ArrowRight className="h-4 w-4" /></a>
          </nav>
        </div>
      </header>

      <main className="relative mx-auto max-w-[1120px] px-6">
        {/* Hero */}
        <section className="grid gap-10 pt-10 pb-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:pt-16 lg:pb-12">
          <div>
            <StatsAndTicker />

            <h1 className="mt-6 text-[34px] font-bold leading-[0.95] tracking-[-0.04em] sm:text-[44px] lg:text-[52px]" style={{ color: 'var(--physi-ink)' }}>
              <span>
                Never trek to
                <br />
                <span style={{ color: 'var(--physi-ink-70)' }}>the wrong hall </span>
                <br />
                again.
              </span>
            </h1>

            <p className="mt-5 max-w-[520px] text-[16px] leading-7" style={{ color: 'var(--physi-ink-70)' }}>
              Lecturer moved class to Hall B and nobody told you? PHYSI is a live timetable built by students — post what you hear, tap Yes if you were there. Green tick means your coursemates confirmed it.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a href="/app/roadmap" className="primary-cta px-7 py-3.5 text-[15px]">
                See live timetable <ArrowRight className="h-4 w-4" />
              </a>
              <span className="inline-flex items-center gap-1.5 font-mono text-xs" style={{ color: 'var(--physi-ink-60)' }}><Clock3 className="h-3.5 w-3.5" /> 30s setup · no signup wall to preview</span>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-2 font-mono text-xs" style={{ color: 'var(--physi-ink-60)' }}>
              <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5" style={{ borderColor: 'var(--physi-amber)', backgroundColor: 'rgba(217, 119, 6, 0.05)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.45), 0 1px 8px rgba(0,0,0,0.12)' }}>⚡ 8 departments live</span>
              <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5" style={{ borderColor: 'var(--physi-green)', backgroundColor: 'rgba(21, 128, 61, 0.05)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.45), 0 1px 8px rgba(0,0,0,0.12)' }}>✓ student-verified</span>
              <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5" style={{ borderColor: 'var(--physi-accent)', backgroundColor: 'rgba(255, 107, 107, 0.05)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.45), 0 1px 8px rgba(0,0,0,0.12)' }}>↻ real-time updates</span>
            </div>
          </div>

          {/* Hero card */}
          <div className="relative">
            <div className="absolute -inset-6 -z-10 rounded-[28px] blur-xl opacity-20" style={{ backgroundColor: 'var(--physi-accent)' }} />
            <div className="overflow-hidden rounded-[20px] border" style={{ borderColor: 'var(--physi-sky)', backgroundColor: 'var(--physi-card)', boxShadow: 'var(--physi-shadow)', backdropFilter: 'blur(12px)' }}>
              <div className="p-2">
                <CampusPreview />
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="mt-10">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--physi-ink)' }}>How it works</h2>
            <span className="hidden sm:inline font-mono text-xs" style={{ color: 'var(--physi-stone)' }}>3 steps · 10 seconds</span>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {["01", "02", "03"].map((n, i) => (
              <div key={n} className="rounded-[20px] border p-6" style={{ borderColor: 'var(--physi-sky)', backgroundColor: 'var(--physi-card)', boxShadow: 'var(--physi-shadow)' }}>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-medium tracking-[0.14em]" style={{ color: 'var(--physi-stone)' }}>{n}</span>
                  <span className="flex h-8 w-8 items-center justify-center rounded-full border" style={{ borderColor: 'var(--physi-sky)', backgroundColor: 'rgba(3, 105, 161, 0.1)', color: 'var(--physi-green)' }}>
                    {i === 0 ? <Sparkles className="h-4 w-4" /> : i === 1 ? <Users className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                  </span>
                </div>
                <p className="mt-4 text-[15px] font-semibold" style={{ color: 'var(--physi-ink)' }}>
                  {[
                    ['Hear gist', 'Lecturer says "we moved to Hall B". Post it — shows instantly as advisory.'],
                    ['Coursemates confirm', 'Were you there? Tap Yes / No. Enough Yes turns it gold.'],
                    ['Everyone knows', 'Gold tick = trust it. No tick = double-check. No more wrong hall.'],
                  ][i][0]}
                </p>
                <p className="mt-2 text-sm" style={{ color: 'var(--physi-ink-70)' }}>
                  {[
                    ['Hear gist', 'Lecturer says "we moved to Hall B". Post it — shows instantly as advisory.'],
                    ['Coursemates confirm', 'Were you there? Tap Yes / No. Enough Yes turns it gold.'],
                    ['Everyone knows', 'Gold tick = trust it. No tick = double-check. No more wrong hall.'],
                  ][i][1]}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Why students built this */}
        <section className="mt-10 grid gap-4 sm:grid-cols-3">
          {[
            ['For freshers', 'Trek to the right hall on day one. No "sorry, we moved" after three floors.'],
            ['For class reps', 'You hear it first. Post before the broadcast chaos — votes do the rest.'],
            ['For everyone', 'One post helps ten coursemates. Ten confirms help the whole department.'],
          ].map(([t, d]) => (
            <div key={t} className="rounded-2xl border px-5 py-4" style={{ borderColor: 'var(--physi-sky)', backgroundColor: 'rgba(255, 255, 255, 0.5)' }}>
              <p className="text-sm font-semibold" style={{ color: 'var(--physi-ink)' }}>{t}</p>
              <p className="mt-1.5 text-sm leading-5" style={{ color: 'var(--physi-ink-70)' }}>{d}</p>
            </div>
          ))}
        </section>

        {/* Final CTA */}
        <section className="mt-10 overflow-hidden rounded-[20px] border px-6 py-10 text-center sm:px-10" style={{ borderColor: 'var(--physi-sky)', background: 'linear-gradient(135deg, var(--physi-card) 0%, rgba(3, 105, 161, 0.05) 100%)', boxShadow: 'var(--physi-shadow)' }}>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber/30 bg-amber/10 px-3 py-1 font-mono text-xs" style={{ color: 'var(--physi-amber)' }}><ShieldCheck className="h-3 w-3" /> Advisory</span>
          <h2 className="mx-auto mt-4 max-w-[520px] text-2xl font-bold tracking-tight sm:text-[26px]" style={{ color: 'var(--physi-ink)' }}>Don't miss the next venue change.</h2>
          <p className="mx-auto mt-2 max-w-[480px] text-sm leading-5" style={{ color: 'var(--physi-ink-70)' }}>Join your coursemates — post once, check once a day.</p>
          <div className="mt-6 flex justify-center">
            <a href="/app/roadmap" className="primary-cta px-7 py-3.5 text-[15px]">See live timetable <ArrowRight className="h-4 w-4" /></a>
          </div>
          <p className="mt-4 font-mono text-xs" style={{ color: 'var(--physi-ink-60)' }}><a href="/terms" className="underline hover:opacity-70" style={{ textDecorationColor: 'var(--physi-sky)' }}>Terms · PHYSI points have no cash value →</a></p>
        </section>
        <footer className="py-8 text-center font-mono text-xs" style={{ color: 'var(--physi-ink-60)' }}>PHYSI · built by students, for students</footer>
      </main>
    </div>
  );
}
