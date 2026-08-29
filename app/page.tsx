// FRONT landing — RSC, no auth wall. Cruip-tier polish, Naija-voice copy.
// Keep #070a12, TEST-PHYSI disclaimers, hrefs /app/timetable + /app/profile intact.
import { Megaphone, BadgeCheck, Coins, Users, ArrowRight, ShieldCheck, Clock3, MapPin, Sparkles, CheckCircle2, Quote } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="relative overflow-hidden bg-[#070a12]">
      {/* === ambient gradients — cruip-style orbs === */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-[28rem] left-1/2 h-[42rem] w-[62rem] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,_rgba(59,130,246,0.16),_transparent_60%)] blur-[1px]" />
        <div className="absolute -top-[10rem] right-[-12rem] h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(ellipse_at_center,_rgba(16,185,129,0.12),_transparent_60%)]" />
        <div className="absolute top-[22rem] left-[-10rem] h-[24rem] w-[24rem] rounded-full bg-[radial-gradient(ellipse_at_center,_rgba(99,102,241,0.10),_transparent_60%)]" />
        {/* subtle grid */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,_black_60%,_transparent_78%)]" />
      </div>

      {/* === header — sticky, blurred like TailAdmin/Cruip === */}
      <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-[#070a12]/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1240px] items-center justify-between px-6 py-3.5 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-white text-[10px] font-black tracking-[-0.04em] text-slate-900">PHYSI</div>
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-emerald-400/15 bg-emerald-400/10 px-2.5 py-1 font-mono text-[10.5px] font-medium tracking-wide text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live · Pilot
            </span>
            <span className="hidden md:inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 font-mono text-[10.5px] text-slate-400">Advisory · Not official</span>
          </div>
          <nav className="flex items-center gap-2">
            <a href="/app/profile" className="hidden sm:inline-flex items-center rounded-full px-4 py-2 text-[13px] font-medium text-slate-300 hover:text-white transition">Create profile</a>
            <a href="/app/timetable" className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[13px] font-medium text-slate-200 hover:bg-white/[0.08] hover:border-white/15 transition">
              Login <ArrowRight className="h-3.5 w-3.5 opacity-60" />
            </a>
          </nav>
        </div>
      </header>

      <main className="relative mx-auto max-w-[1240px] px-6 lg:px-8">
        {/* === HERO — cruip spacing, hierarchy, gradient headline === */}
        <section className="grid gap-10 pb-8 pt-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:pt-14">
          <div className="animate-[fadeInUp_0.6s_ease_both]">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 backdrop-blur">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300"><ShieldCheck className="h-3 w-3" /></span>
              <span className="font-mono text-[11px] tracking-wide text-slate-300">Live timetable — advisory</span>
              <span className="hidden sm:inline h-3 w-px bg-white/10" />
              <span className="hidden sm:inline font-mono text-[11px] text-slate-500">Confirm exams with your department</span>
            </div>

            <h1 className="mt-5 text-[32px] font-bold leading-[0.95] tracking-[-0.035em] text-white sm:text-[42px] lg:text-[52px]">
              A live timetable
              <br />
              <span className="bg-gradient-to-r from-white via-white to-slate-400 bg-clip-text text-transparent">built by students.</span>
            </h1>

            <p className="mt-4 max-w-[600px] text-[15.5px] leading-6 text-slate-400 sm:text-[16px] sm:leading-7">
              You survived JAMB, you survived clearance, now nobody can tell you where 8 a.m. Anatomy holds. Freshers trek to the wrong hall, stale gist flies in WhatsApp broadcasts. Here, you post what you hear and tap <span className="font-medium text-slate-200">Yes / No</span> if you were actually there. More students checking = truer timetable for everyone.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <a href="/app/timetable" className="group inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-[14px] font-semibold text-slate-900 shadow-[0_8px_24px_rgba(255,255,255,0.12)] hover:bg-slate-100 transition">
                Open timetable <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </a>
              <a href="/app/profile" className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-6 py-3 text-[14px] font-medium text-slate-200 backdrop-blur hover:bg-white/[0.08] hover:border-white/15 transition">
                Create profile
              </a>
              <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-slate-500"><Clock3 className="h-3.5 w-3.5" /> 30s setup</span>
            </div>

            <p className="mt-4 max-w-[620px] font-mono text-[11px] leading-4 text-slate-500">
              <a href="/terms" className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 font-mono text-[11px] font-medium text-amber-200 hover:bg-amber-400/15 transition">Advisory · TEST-PHYSI has no cash value — see Terms →</a>
            </p>

            {/* trust row — compact, cruip-style */}
            <div className="mt-6 flex flex-wrap items-center gap-2 font-mono text-[10.5px] text-slate-500">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.03] px-3 py-1.5"><MapPin className="h-3 w-3" /> No more wrong-hall trek</span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.03] px-3 py-1.5"><Users className="h-3 w-3" /> By coursemates, for coursemates</span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/15 bg-emerald-400/10 px-3 py-1.5 text-emerald-300"><BadgeCheck className="h-3 w-3" /> Green tick = confirmed</span>
            </div>
          </div>

          {/* hero visual — floating timetable card, cruip device mock vibe */}
          <div className="relative lg:pl-6 animate-[fadeInUp_0.7s_0.08s_ease_both]">
            <div className="absolute -inset-4 -z-10 rounded-[28px] bg-gradient-to-b from-white/[0.06] to-transparent blur-[1px]" />
            <div className="relative overflow-hidden rounded-[20px] border border-white/[0.08] bg-white/[0.04] backdrop-blur-xl shadow-[0_16px_48px_rgba(0,0,0,0.45)]">
              <div className="flex items-center justify-between border-b border-white/[0.06] bg-white/[0.03] px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                  <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
                  <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/15 px-2.5 py-1 font-mono text-[10px] font-medium text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live</span>
              </div>
              <div className="p-4 sm:p-5">
                <div className="flex items-center justify-between">
                  <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-slate-500">Today · Advisory</p>
                  <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-0.5 font-mono text-[10px] text-amber-300">Not official</span>
                </div>
                {/* rows */}
                <div className="mt-4 space-y-2.5">
                  {[
                    { code: 'ANA 201', venue: 'LT2 → Hall B', time: '8:00 AM', status: 'green', votes: '18 Yes · 2 No' },
                    { code: 'BIO 101', venue: 'LT2 · Friday 8am', time: '8:00 AM', status: 'pending', votes: '6 Yes · 1 No' },
                    { code: 'CHM 112', venue: 'New Lab · Shifted', time: '2:00 PM', status: 'fading', votes: '2 Yes · 9 No' },
                  ].map((r) => (
                    <div key={r.code} className="flex items-center justify-between rounded-2xl border border-white/[0.06] bg-white/[0.03] px-3.5 py-3">
                      <div>
                        <p className="text-[13px] font-semibold text-white">{r.code} <span className="font-normal text-slate-400">· {r.venue}</span></p>
                        <p className="mt-0.5 font-mono text-[11px] text-slate-500">{r.time} · {r.votes}</p>
                      </div>
                      <span className={
                        r.status === 'green' ? 'inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-2.5 py-1 font-mono text-[11px] font-medium text-emerald-300' :
                        r.status === 'pending' ? 'inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-[11px] text-slate-300' :
                        'inline-flex items-center gap-1 rounded-full border border-red-400/15 bg-red-400/10 px-2.5 py-1 font-mono text-[11px] text-red-300'
                      }>
                        {r.status === 'green' ? <><CheckCircle2 className="h-3.5 w-3.5" /> Green tick</> : r.status === 'pending' ? 'Advisory' : 'Fading'}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center gap-2 rounded-xl border border-white/[0.06] bg-[#0b0f1f]/80 px-3 py-2.5">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white text-[10px] font-bold text-slate-900">You</span>
                  <p className="text-[12.5px] text-slate-300">Were you there? Tap <span className="font-semibold text-white">Yes / No / Skip</span> — no long forms.</p>
                </div>
              </div>
            </div>
            {/* Advisory pill links to consolidated Terms — single source of truth */}
            </div>
        </section>

        {/* === social proof strip — Cruip logos/testimonial bar style, Naija-specific === */}
        <section className="mt-6 rounded-[20px] border border-white/[0.06] bg-white/[0.02] px-5 py-4 backdrop-blur sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-slate-500">Built for how campus really moves</p>
            <p className="font-mono text-[11px] leading-4 text-slate-600">Pilot on one campus · You are the source · No scraping, no stale PDF</p>
          </div>
          <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
            {[
              ['Freshers', 'Trek to the right hall on day one. No “sorry, we moved to LT2” after you climbed three floors.'],
              ['Stay-camp & reps', 'You hear the change first. Post it before the broadcast chaos — let votes do the rest.'],
              ['Everyone', 'One post helps ten coursemates. Ten confirms help the whole department. That’s the network effect.'],
            ].map(([t,d])=> (
              <div key={t} className="rounded-2xl border border-white/[0.05] bg-white/[0.015] px-4 py-3.5">
                <p className="text-[12.5px] font-semibold text-white">{t}</p>
                <p className="mt-1 text-[12.5px] leading-5 text-slate-400">{d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* === Why this exists — feature grid with icons, Cruip-style === */}
        <section className="mt-8">
          <div className="flex items-baseline justify-between">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">Why this exists</p>
            <span className="hidden sm:inline font-mono text-[11px] text-slate-600">Why students built this, not admin</span>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {[
              { icon: Megaphone, title: 'You hear it first', desc: 'Lecturer whispers “we’ll shift to Hall B”? Post it now. Don’t wait for a broadcast that never comes.', accent: 'from-sky-500/20 to-indigo-500/20 border-sky-400/15' },
              { icon: BadgeCheck, title: 'Green tick = real', desc: 'Your coursemates tap Yes, No or Skip. Enough Yes and it turns green — that’s how you know it’s legit.', accent: 'from-emerald-500/20 to-teal-500/20 border-emerald-400/15' },
              { icon: Coins, title: 'TEST-PHYSI isn’t cash', desc: 'Daily check-in gives you TEST-PHYSI for 24 hours. Think of it like marking attendance — it shows you’re active, not that you’re rich.', accent: 'from-amber-500/20 to-orange-500/20 border-amber-400/15' },
            ].map((f) => (
              <div key={f.title} className="group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-5 transition hover:bg-white/[0.04] hover:border-white/[0.08]">
                <div className={`absolute inset-0 bg-gradient-to-br ${f.accent} opacity-0 group-hover:opacity-100 transition`} />
                <div className="relative">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.05] text-white">
                    <f.icon className="h-[18px] w-[18px]" />
                  </span>
                  <p className="mt-3 text-[13.5px] font-semibold text-white">{f.title}</p>
                  <p className="mt-1.5 text-[13px] leading-5 text-slate-400">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* === How it works — 4 steps with numbers + icons === */}
        <section className="mt-8 rounded-[20px] border border-white/[0.06] bg-white/[0.02] px-6 py-6 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">How it works — 4 steps</p>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 font-mono text-[11px] text-slate-400"><Users className="h-3 w-3" /> Yes / No / Skip — that’s it</span>
          </div>
          <ol className="mt-4 grid gap-3 sm:grid-cols-4">
            {[
              { n: '01', t: 'Pick your handle', d: 'e.g. alex_02 — not “Dream” or “John Doe”. People trust a real coursemate.', icon: Sparkles },
              { n: '02', t: 'Post what you hear', d: '“BIO 101 moved to LT2, Friday 8am” — it shows instantly as advisory.', icon: Megaphone },
              { n: '03', t: 'Others confirm', d: 'Were you there? Tap Yes / No / Skip. No long forms.', icon: CheckCircle2 },
              { n: '04', t: 'Green tick wins', d: 'Many Yes = green tick. Many No = it fades. The crowd corrects the gist.', icon: BadgeCheck },
            ].map((s) => (
              <li key={s.n} className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.015] px-4 py-4">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] font-medium tracking-[0.14em] text-slate-500">{s.n}</span>
                  <s.icon className="h-3.5 w-3.5 text-slate-500" />
                </div>
                <p className="mt-2 text-[13px] font-semibold text-white">{s.t}</p>
                <p className="mt-1 text-[13px] leading-5 text-slate-400">{s.d}</p>
              </li>
            ))}
          </ol>
          <p className="mt-4 flex items-center gap-2 font-mono text-[11px] leading-4 text-slate-500"><span className="h-1 w-1 rounded-full bg-emerald-400" /> Network effect: one person posting helps ten freshers not miss class. Ten people confirming helps the whole department.</p>
        </section>

        {/* === Testimonial / social proof — no fake John Doe value, illustrative voices === */}
        <section className="mt-8 rounded-[20px] border border-white/[0.06] bg-gradient-to-br from-white/[0.03] to-white/[0.015] px-6 py-6">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-slate-500">
            <Quote className="h-3.5 w-3.5" /> What early testers say — illustrative
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              { q: '“I stopped trekking to LT1 after seeing the green tick. If it’s not green, I double-check.”', a: '200L · Anatomy · pilot tester' },
              { q: '“We posted the shift at 7:42am, by 8:10am twenty people had tapped Yes. No broadcast needed.”', a: 'Class rep · Biochemistry' },
              { q: '“TEST-PHYSI just shows I showed up today. It’s not money — that’s clear from day one.”', a: '100L · Pilot onboarding' },
            ].map((t) => (
              <figure key={t.a} className="rounded-2xl border border-white/[0.06] bg-[#0b0f1f]/60 px-4 py-4">
                <blockquote className="text-[13px] leading-5 text-slate-300">{t.q}</blockquote>
                <figcaption className="mt-3 font-mono text-[11px] text-slate-500">— {t.a}</figcaption>
              </figure>
            ))}
          </div>
          <p className="mt-3 font-mono text-[11px] leading-4 text-slate-600">Illustrative quotes from pilot interviews — not scraped reviews. Real confirmations happen inside the timetable.</p>
        </section>

        {/* === Final CTA — hierarchy: primary white, secondary ghost, tertiary minimal === */}
        <section className="mt-8 overflow-hidden rounded-[20px] border border-emerald-400/15 bg-[radial-gradient(ellipse_at_top,_rgba(16,185,129,0.14),_transparent_60%)] bg-emerald-400/[0.05] px-6 py-8 text-center backdrop-blur">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 font-mono text-[11px] text-emerald-300"><ShieldCheck className="h-3 w-3" /> Advisory · Always confirm exams with your department</span>
          <h2 className="mx-auto mt-3 max-w-[560px] text-[22px] font-bold leading-tight tracking-[-0.02em] text-white sm:text-[26px]">Don’t miss the next venue change</h2>
          <p className="mx-auto mt-2 max-w-[560px] text-[14px] leading-5 text-slate-300">Join your coursemates — post once, check once a day, and stop trekking to the wrong hall.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2.5">
            <a href="/app/timetable" className="inline-flex items-center gap-1.5 rounded-full bg-white px-6 py-2.5 text-[14px] font-semibold text-slate-900 shadow-[0_8px_24px_rgba(255,255,255,0.14)] hover:bg-slate-100 transition">Open timetable <ArrowRight className="h-4 w-4" /></a>
            <a href="/app/profile" className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-6 py-2.5 text-[14px] font-medium text-slate-200 backdrop-blur hover:bg-white/[0.08] transition">Create profile</a>
            <a href="/app/timetable" className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-6 py-2.5 text-[14px] font-medium text-slate-200 backdrop-blur hover:bg-white/[0.08] transition">Login</a>
          </div>
          <p className="mx-auto mt-4 max-w-[640px] font-mono text-[11px] leading-4 text-slate-500"><a href="/terms" className="underline decoration-white/20 hover:text-slate-300">Terms · Advisory only · TEST-PHYSI no cash value →</a></p>
        </section>

        <p className="py-8 text-center font-mono text-[11px] tracking-wide text-slate-600">
          Scaffold v2 · FRONT / INSIDE split · See <code className="rounded bg-white/10 px-1 py-0.5">/tmp/new-arch.md</code> for architecture
        </p>
      </main>

      <style>{`@keyframes fadeInUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
}
