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
      <span className="inline-flex items-center gap-2 rounded-full border border-sky/30 bg-white px-3 py-1.5">
        <span className="h-2 w-2 rounded-full bg-green animate-pulse" />
        <span className="font-mono text-xs font-medium text-ink">student-powered · live</span>
      </span>

      <section className="mt-6 rounded-2xl border border-sky/30 bg-white px-5 py-4">
        <span className="inline-flex items-center gap-2 rounded-full bg-amber/15 border border-amber/30 px-3 py-1.5 font-mono text-xs font-semibold text-amber">
          <span className="h-2 w-2 rounded-full bg-amber animate-pulse" />
          Live proof
        </span>
        <span className="rounded-full border border-sky/30 bg-sky/15 px-3 py-1.5 font-mono text-xs text-sky">{totalEvents} events</span>
        <span className="rounded-full border border-green/30 bg-green/10 px-3 py-1.5 font-mono text-xs text-green">{verifiedCount} verified</span>
        <span className="ml-auto hidden sm:inline font-mono text-xs text-stone">updates every 30s</span>
        <a href="/app/roadmap" className="rounded-full bg-sky px-4 py-1.5 text-xs font-bold text-white hover:bg-sky-2 transition">See timetable →</a>
      </section>

      <div className="mt-3 overflow-hidden rounded-full border border-sky/30 bg-white/60 backdrop-blur">
        <div className="flex animate-[ticker_22s_linear_infinite] items-center gap-6 whitespace-nowrap px-4 py-2.5">
          {doubled.map((t, i) => (
            <span key={i} className="inline-flex items-center gap-1.5 font-mono text-xs text-ink/70">
              <span className="h-1.5 w-1.5 rounded-full bg-green/70" />{t}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-sky-3 text-ink selection:bg-sky selection:text-white" style={{ fontFamily: 'var(--font-inter), system-ui, sans-serif' }}>
      {/* Campus sky depth */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-sky-3" />
        <div className="absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full opacity-[0.45]" style={{ background: "radial-gradient(ellipse at center, #7dd3fc, transparent 70%)" }} />
        <div className="absolute top-[32%] right-[-4%] h-[380px] w-[380px] rounded-full opacity-[0.15]" style={{ background: "radial-gradient(ellipse at center, #15803d, transparent 70%)" }} />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-sky/20 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1120px] items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky text-white font-black tracking-tight">PHYSI</div>
            <span className="hidden sm:inline text-sm font-semibold tracking-tight text-ink">PHYSI</span>
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-sky/30 bg-white px-2.5 py-1 font-mono text-[11px] text-ink/70">advisory · not official</span>
          </div>
          <nav className="flex items-center gap-2">
            <a href="/app/roadmap" className="hidden sm:inline-flex text-sm font-medium text-ink/70 hover:text-ink transition px-3 py-1.5">See live timetable</a>
            <a href="/app/roadmap" className="inline-flex items-center gap-1.5 rounded-full bg-sky px-5 py-2 text-sm font-semibold text-white hover:bg-sky-2 transition">See live timetable <ArrowRight className="h-3.5 w-3.5" /></a>
          </nav>
        </div>
      </header>

      <main className="relative mx-auto max-w-[1120px] px-6">
        {/* Hero */}
        <section className="grid gap-10 pt-10 pb-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:pt-16 lg:pb-12">
          <div>
            <StatsAndTicker />

            <h1 className="mt-6 text-[34px] font-bold leading-[0.95] tracking-[-0.04em] sm:text-[44px] lg:text-[52px] text-ink">
              <span>
                Never trek to
                <br />
                <span className="text-ink/70">the wrong hall </span>
                <br />
                again.
              </span>
            </h1>

            <p className="mt-5 max-w-[520px] text-[16px] leading-7 text-ink/70">
              Lecturer moved class to Hall B and nobody told you? PHYSI is a live timetable built by students — post what you hear, tap Yes if you were there. Green tick means your coursemates confirmed it.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a href="/app/roadmap" className="primary-cta inline-flex items-center gap-2 px-7 py-3.5 text-[15px]">
                See live timetable <ArrowRight className="h-4 w-4" />
              </a>
              <span className="inline-flex items-center gap-1.5 font-mono text-xs text-ink/60"><Clock3 className="h-3.5 w-3.5" /> 30s setup · no signup wall to preview</span>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-2 font-mono text-xs text-ink/60">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber/30 bg-white px-3 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_1px_8px_rgba(0,0,0,0.12)]"><Users className="h-3 w-3 text-amber" /> by coursemates</span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-green/30 bg-white px-3 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_1px_8px_rgba(0,0,0,0.12)]"><ShieldCheck className="h-3 w-3 text-green" /> green tick = confirmed</span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-brick/30 bg-white px-3 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_1px_8px_rgba(0,0,0,0.12)]"><MapPin className="h-3 w-3 text-brick" /> no wrong-hall trek</span>
            </div>
          </div>

          {/* Hero card — campus view */}
          <div className="relative">
            <div className="absolute -inset-6 -z-10 rounded-[28px] bg-sky/30 blur-xl" />
            <div className="overflow-hidden rounded-[20px] border border-sky/30 bg-white backdrop-blur-xl shadow-[0_16px_48px_rgba(12,30,58,0.35)]">
              <div className="p-2">
                <CampusPreview />
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="mt-10">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl font-semibold tracking-tight text-ink">How it works</h2>
            <span className="hidden sm:inline font-mono text-xs text-stone">3 steps · 10 seconds</span>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {["01", "02", "03"].map((n, i) => (
              <div key={n} className="rounded-[20px] border border-sky/30 bg-white p-6 shadow-[0_8px_24px_rgba(12,30,58,0.25)]">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-medium tracking-[0.14em] text-stone">{n}</span>
                  <span className="flex h-8 w-8 items-center justify-center rounded-full border border-sky/30 bg-sky/10 text-green">
                    {i === 0 ? <Sparkles className="h-4 w-4" /> : i === 1 ? <Users className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                  </span>
                </div>
                <p className="mt-4 text-[15px] font-semibold text-ink">
                  {[
                    ['Hear gist', 'Lecturer says "we moved to Hall B". Post it — shows instantly as advisory.'],
                    ['Coursemates confirm', 'Were you there? Tap Yes / No. Enough Yes turns it gold.'],
                    ['Everyone knows', 'Gold tick = trust it. No tick = double-check. No more wrong hall.'],
                  ][i]}
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
            <div key={t} className="rounded-2xl border border-sky/30 bg-white/50 px-5 py-4">
              <p className="text-sm font-semibold text-ink">{t}</p>
              <p className="mt-1.5 text-sm leading-5 text-ink/70">{d}</p>
            </div>
          ))}
        </section>

        {/* Final CTA */}
        <section className="mt-10 overflow-hidden rounded-[20px] border border-sky/30 bg-gradient-to-br from-white to-sky px-6 py-10 text-center sm:px-10 shadow-[0_12px_32px_rgba(12,30,58,0.35)]">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber/30 bg-amber/10 px-3 py-1 font-mono text-xs text-amber"><ShieldCheck className="h-3 w-3" /> Advisory · confirm exams with your department</span>
          <h2 className="mx-auto mt-4 max-w-[520px] text-2xl font-bold tracking-tight text-ink sm:text-[26px]">Don't miss the next venue change.</h2>
          <p className="mx-auto mt-2 max-w-[480px] text-sm leading-5 text-ink/70">Join your coursemates — post once, check once a day.</p>
          <div className="mt-6 flex justify-center">
            <a href="/app/roadmap" className="primary-cta inline-flex items-center gap-2 px-7 py-3.5 text-[15px]">See live timetable <ArrowRight className="h-4 w-4" /></a>
          </div>
          <p className="mt-4 font-mono text-xs text-ink/60"><a href="/terms" className="underline decoration-sky/30 hover:text-ink">Terms · PHYSI points have no cash value →</a></p>
        </section>
        <footer className="py-8 text-center font-mono text-xs text-ink/60">
          PHYSI · built by students, for students
        </footer>
      </main>
    </div>
  );
}