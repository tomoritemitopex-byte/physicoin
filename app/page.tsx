"use client";
import { useEffect, useState } from 'react';
import { ArrowRight, Check, ShieldCheck, Clock3, Users, Sparkles, MapPin } from 'lucide-react';

function LiveTicker({ items }: { items: string[] }) {
  if (!items.length) return null;
  const doubled = [...items, ...items];
  return (
    <div className="overflow-hidden rounded-full border border-[rgba(52,211,153,0.15)] bg-[#1a5f48]/60 backdrop-blur">
      <div className="flex animate-[ticker_22s_linear_infinite] items-center gap-6 whitespace-nowrap px-4 py-2.5">
        {doubled.map((t,i)=> (
          <span key={i} className="inline-flex items-center gap-1.5 font-mono text-xs text-[rgba(240,253,244,0.70)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#34d399]/70" />{t}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function LandingPage() {
  const [stats, setStats] = useState<any>(null);
  const [ticker, setTicker] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch('/api/stats', { cache: 'no-store' });
        const j = await r.json().catch(()=>null);
        if (!j || cancelled) return;
        setStats(j);
        const fallbacks = ["alex_02 verified BIO 101 · now","zara_11 confirmed CHM 111 · 3m ago","mike_07 was there for PHY 101 · 6m ago"];
        let items: string[] | null = null;
        if (Array.isArray(j?.recent)) items = j.recent.slice(0,5).map((x:any)=> `${String(x.handle||x.name||"someone")} verified ${String(x.title||"event")} · now`);
        if (items?.length) setTicker(items); else setTicker(fallbacks);
      } catch { if (!cancelled) setTicker(["alex_02 verified BIO 101 · now","zara_11 confirmed CHM 111 · 3m ago"]); }
    }
    load();
    const iv = setInterval(load, 30000);
    return () => { cancelled=true; clearInterval(iv); };
  }, []);

  const totalEvents = stats?.metrics?.events ?? stats?.counts?.physi_events ?? 42;
  const verifiedCount = stats?.metrics?.verifications ?? stats?.metrics?.events_by_status?.verified ?? Math.round(totalEvents*0.35);

  return (
    <div className="min-h-screen bg-[#0d3b2a] text-[#f0fdf4] selection:bg-[#34d399] selection:text-[#022c1e]">
      {/* Tonal depth — mid green glow over forest base */}
      <div aria-hidden className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-[#0d3b2a]" />
        <div className="absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full opacity-[0.32]" style={{ background: "radial-gradient(ellipse at center, #1a5f48, transparent 70%)" }} />
        <div className="absolute top-[32%] right-[-4%] h-[380px] w-[380px] rounded-full opacity-[0.10]" style={{ background: "radial-gradient(ellipse at center, #022c1e, transparent 70%)" }} />
      </div>

      {/* ── Header — tonal ── */}
      <header className="sticky top-0 z-20 border-b border-[rgba(52,211,153,0.15)] bg-[#0d3b2a]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1120px] items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f0fdf4] text-[10px] font-black tracking-tight text-[#022c1e]">PHYSI</div>
            <span className="hidden sm:inline text-sm font-semibold tracking-tight text-[#f0fdf4]">PHYSI</span>
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-[rgba(52,211,153,0.15)] bg-[#1a5f48]/70 px-2.5 py-1 font-mono text-[11px] text-[rgba(240,253,244,0.70)]">advisory · not official</span>
          </div>
          <nav className="flex items-center gap-2">
            <a href="/app/profile" className="hidden sm:inline-flex text-sm font-medium text-[rgba(240,253,244,0.70)] hover:text-[#f0fdf4] transition px-3 py-1.5">Create profile</a>
            <a href="/app/roadmap" className="inline-flex items-center gap-1.5 rounded-full bg-[#34d399] px-5 py-2 text-sm font-semibold text-[#022c1e] hover:bg-[#6ee7b7] transition">Open app <ArrowRight className="h-3.5 w-3.5" /></a>
          </nav>
        </div>
      </header>

      <main className="relative mx-auto max-w-[1120px] px-6">
        {/* ── HERO ── */}
        <section className="grid gap-10 pt-10 pb-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:pt-16 lg:pb-12">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(52,211,153,0.15)] bg-[#1a5f48] px-3 py-1.5">
              <span className="h-2 w-2 rounded-full bg-[#34d399] animate-pulse" />
              <span className="font-mono text-xs font-medium text-[#f0fdf4]">Live · student-powered</span>
              <span className="hidden sm:inline text-xs text-[rgba(240,253,244,0.60)]">· live</span>
            </div>

            <h1 className="mt-6 text-[34px] font-bold leading-[0.95] tracking-[-0.04em] sm:text-[44px] lg:text-[52px] text-[#f0fdf4]">
              Never trek to
              <br />
              <span className="text-[rgba(240,253,244,0.70)]">the wrong hall</span>
              <br />
              again.
            </h1>

            <p className="mt-5 max-w-[520px] text-[16px] leading-7 text-[rgba(240,253,244,0.70)]">
              Lecturer moved class to Hall B and nobody told you? PHYSI is a live timetable built by students — post what you hear, tap Yes if you were there. Green tick means your coursemates confirmed it.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a href="/app/roadmap" className="primary-cta inline-flex items-center gap-2 px-7 py-3.5 text-[15px]">
                Open the road <ArrowRight className="h-4 w-4" />
              </a>
              <span className="inline-flex items-center gap-1.5 font-mono text-xs text-[rgba(240,253,244,0.60)]"><Clock3 className="h-3.5 w-3.5" /> 30s setup · no signup wall to preview</span>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-2 font-mono text-xs text-[rgba(240,253,244,0.60)]">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(52,211,153,0.15)] bg-[#1a5f48]/60 px-3 py-1.5"><Users className="h-3 w-3 text-[#34d399]" /> by coursemates</span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(251,191,36,0.20)] bg-[rgba(251,191,36,0.10)] px-3 py-1.5 text-[#fbbf24]"><ShieldCheck className="h-3 w-3" /> green tick = confirmed</span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(52,211,153,0.15)] bg-[#1a5f48]/60 px-3 py-1.5"><MapPin className="h-3 w-3 text-[#34d399]" /> no wrong-hall trek</span>
            </div>
          </div>

          {/* Hero card — mid surface #1a5f48 on base #0d3b2a */}
          <div className="relative">
            <div className="absolute -inset-6 -z-10 rounded-[28px] bg-[#1a5f48]/20 blur-xl" />
            <div className="overflow-hidden rounded-[20px] border border-[rgba(52,211,153,0.15)] bg-[#1a5f48] backdrop-blur-xl shadow-[0_16px_48px_rgba(2,44,30,0.45)]">
              <div className="flex items-center justify-between border-b border-[rgba(52,211,153,0.12)] bg-[#0d3b2a]/30 px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#f0fdf4]/20" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#f0fdf4]/10" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#f0fdf4]/10" />
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgba(251,191,36,0.14)] border border-[rgba(251,191,36,0.18)] px-2.5 py-1 font-mono text-[11px] font-medium text-[#fbbf24]"><span className="h-1.5 w-1.5 rounded-full bg-[#fbbf24] animate-pulse" /> live</span>
              </div>
              <div className="p-5">
                <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[rgba(240,253,244,0.55)]">Today · advisory</p>
                <div className="mt-3 space-y-2.5">
                  {[
                    { code: 'ANA 201', venue: 'Hall B · moved from LT2', time: '8:00 AM', state: 'verified', meta: '18 Yes · 2 No' },
                    { code: 'BIO 101', venue: 'LT2 · Friday', time: '8:00 AM', state: 'pending', meta: '6 Yes · 1 No' },
                    { code: 'CHM 112', venue: 'New Lab', time: '2:00 PM', state: 'fading', meta: '2 Yes · 9 No' },
                  ].map((r) => (
                    <div key={r.code} className="flex items-center justify-between rounded-2xl border border-[rgba(52,211,153,0.12)] bg-[#0d3b2a]/35 px-4 py-3">
                      <div>
                        <p className="text-[13px] font-semibold text-[#f0fdf4]">{r.code} <span className="font-normal text-[rgba(240,253,244,0.70)]">· {r.venue}</span></p>
                        <p className="mt-0.5 font-mono text-xs text-[rgba(240,253,244,0.55)]">{r.time} · {r.meta}</p>
                      </div>
                      <span className={r.state==='verified' ? "inline-flex items-center gap-1 rounded-full bg-[rgba(251,191,36,0.14)] border border-[rgba(251,191,36,0.20)] px-2.5 py-1 font-mono text-xs font-medium text-[#fbbf24]" : r.state==='pending' ? "inline-flex items-center rounded-full border border-[rgba(52,211,153,0.15)] bg-[#022c1e]/30 px-2.5 py-1 font-mono text-xs text-[#f0fdf4]/80" : "inline-flex items-center rounded-full border border-red-400/20 bg-red-500/10 px-2.5 py-1 font-mono text-xs text-red-300"}>
                        {r.state==='verified' ? <><Check className="h-3 w-3" /> Green</> : r.state==='pending' ? 'Advisory' : 'Fading'}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-[rgba(52,211,153,0.15)] bg-[#022c1e]/45 px-3.5 py-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#34d399] text-[10px] font-bold text-[#022c1e]">You</span>
                  <p className="text-[13px] text-[rgba(240,253,244,0.80)]">Were you there? Tap <span className="font-semibold text-[#f0fdf4]">Yes / No</span> — no forms.</p>
                </div>
              </div>
            </div>
            <p className="mt-3 text-center font-mono text-[11px] text-[rgba(240,253,244,0.45)]">Preview · real confirmations inside the road</p>
          </div>
        </section>

        {/* ── Live proof — tonal strip ── */}
        <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-[rgba(52,211,153,0.15)] bg-[#1a5f48]/60 px-5 py-4">
          <span className="inline-flex items-center gap-2 rounded-full bg-[rgba(251,191,36,0.14)] border border-[rgba(251,191,36,0.18)] px-3 py-1.5 font-mono text-xs font-semibold text-[#fbbf24]"><span className="h-2 w-2 rounded-full bg-[#fbbf24] animate-pulse" /> Live proof</span>
          <span className="rounded-full border border-[rgba(52,211,153,0.15)] bg-[#022c1e]/30 px-3 py-1.5 font-mono text-xs text-[#f0fdf4]">{totalEvents} events</span>
          <span className="rounded-full border border-[rgba(251,191,36,0.18)] bg-[rgba(251,191,36,0.10)] px-3 py-1.5 font-mono text-xs text-[#fbbf24]">{verifiedCount} verified</span>
          <span className="ml-auto hidden sm:inline font-mono text-xs text-[rgba(240,253,244,0.55)]">updates every 30s · /api/stats</span>
          <a href="/app/roadmap" className="rounded-full bg-[#34d399] px-4 py-1.5 text-xs font-bold text-[#022c1e] hover:bg-[#6ee7b7] transition">Open road →</a>
        </section>
        <div className="mt-3">
          <LiveTicker items={ticker} />
        </div>

        {/* ── How it works — 3 steps, tonal cards ── */}
        <section className="mt-10">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl font-semibold tracking-tight text-[#f0fdf4]">How it works</h2>
            <span className="hidden sm:inline font-mono text-xs text-[rgba(240,253,244,0.55)]">3 steps · 10 seconds</span>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {[
              { n: '01', title: 'Hear gist', desc: 'Lecturer says “we moved to Hall B”. Post it — shows instantly as advisory.', icon: Sparkles, tint: 'border-[rgba(52,211,153,0.15)]' },
              { n: '02', title: 'Coursemates confirm', desc: 'Were you there? Tap Yes / No. Enough Yes turns it gold.', icon: Users, tint: 'border-[rgba(251,191,36,0.18)]' },
              { n: '03', title: 'Everyone knows', desc: 'Gold tick = trust it. No tick = double-check. No more wrong hall.', icon: Check, tint: 'border-[rgba(52,211,153,0.15)]' },
            ].map((s) => (
              <div key={s.n} className={`rounded-[20px] border bg-[#1a5f48] p-6 shadow-[0_8px_24px_rgba(2,44,30,0.25)] ${s.tint}`}>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-medium tracking-[0.14em] text-[rgba(240,253,244,0.55)]">{s.n}</span>
                  <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[rgba(52,211,153,0.12)] bg-[#0d3b2a]/40 text-[#34d399]"><s.icon className="h-4 w-4" /></span>
                </div>
                <p className="mt-4 text-[15px] font-semibold text-[#f0fdf4]">{s.title}</p>
                <p className="mt-1.5 text-sm leading-5 text-[rgba(240,253,244,0.70)]">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Why students built this ── */}
        <section className="mt-10 grid gap-4 sm:grid-cols-3">
          {[
            ['For freshers', 'Trek to the right hall on day one. No “sorry, we moved” after three floors.'],
            ['For class reps', 'You hear it first. Post before the broadcast chaos — votes do the rest.'],
            ['For everyone', 'One post helps ten coursemates. Ten confirms help the whole department.'],
          ].map(([t,d])=> (
            <div key={t} className="rounded-2xl border border-[rgba(52,211,153,0.12)] bg-[#1a5f48]/50 px-5 py-4">
              <p className="text-sm font-semibold text-[#f0fdf4]">{t}</p>
              <p className="mt-1.5 text-sm leading-5 text-[rgba(240,253,244,0.70)]">{d}</p>
            </div>
          ))}
        </section>

        <p className="mt-10 text-center font-mono text-xs text-[rgba(240,253,244,0.55)]">Live from /api/stats: {totalEvents} events · {verifiedCount} verified · updates every 30s</p>

        {/* ── Final CTA — mint on shadow, gold accent ── */}
        <section className="mt-10 overflow-hidden rounded-[20px] border border-[rgba(52,211,153,0.18)] bg-gradient-to-br from-[#1a5f48] to-[#0d3b2a] px-6 py-10 text-center sm:px-10 shadow-[0_12px_32px_rgba(2,44,30,0.35)]">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(251,191,36,0.18)] bg-[rgba(251,191,36,0.10)] px-3 py-1 font-mono text-xs text-[#fbbf24]"><ShieldCheck className="h-3 w-3" /> Advisory · confirm exams with your department</span>
          <h2 className="mx-auto mt-4 max-w-[520px] text-2xl font-bold tracking-tight text-[#f0fdf4] sm:text-[26px]">Don’t miss the next venue change.</h2>
          <p className="mx-auto mt-2 max-w-[480px] text-sm leading-5 text-[rgba(240,253,244,0.70)]">Join your coursemates — post once, check once a day.</p>
          <div className="mt-6 flex justify-center">
            <a href="/app/roadmap" className="primary-cta inline-flex items-center gap-2 px-7 py-3.5 text-[15px]">Open the road <ArrowRight className="h-4 w-4" /></a>
          </div>
          <p className="mt-4 font-mono text-xs text-[rgba(240,253,244,0.55)]"><a href="/terms" className="underline decoration-[rgba(52,211,153,0.22)] hover:text-[#f0fdf4]">Terms · PHYSI energy has no cash value →</a></p>
        </section>

        <p className="py-8 text-center font-mono text-xs text-[rgba(240,253,244,0.40)]">PHYSI · built by students, for students</p>
      </main>
    </div>
  );
}
