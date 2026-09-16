import { ArrowUpRight, Check, Clock3, Radio, ShieldCheck, Users } from 'lucide-react';
import SignalRadar from '@/components/road/SignalRadar';
import { getStatsData, getTimetableFeed } from '@/lib/data';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function LiveStats() {
  const [stats, timetable] = await Promise.all([getStatsData(), getTimetableFeed()]);
  const events = stats.metrics?.events ?? timetable.events.length;
  const verified = stats.metrics?.events_by_status?.verified ?? 0;
  return (
    <div className="flex flex-wrap gap-2 font-mono text-xs text-slate-400">
      <span className="badge badge-info"><Radio className="h-3 w-3" /> live feed</span>
      <span className="badge badge-success"><Check className="h-3 w-3" /> {verified} verified</span>
      <span className="badge">{events} active events</span>
    </div>
  );
}

const steps = [
  ['01', 'Post the signal', 'A venue moves, a lecturer changes the time, or a class rep hears the update. Share it once.'],
  ['02', 'Let students verify', 'People who were there confirm or reject the update. The signal gets stronger with every response.'],
  ['03', 'Move with confidence', 'Green means verified. Advisory means check twice. The feed stays useful because trust is visible.'],
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[var(--physi-bg)] text-[var(--physi-text)] landing-glow">
      <header className="border-b landing-rule">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between px-5 py-4 sm:px-8">
          <a href="/" className="flex items-center gap-3" aria-label="PHYSI home">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--physi-cyan)] font-black tracking-tight text-[#07111f]">P</span>
            <span className="font-mono text-sm font-bold tracking-[.18em]">PHYSI</span>
            <span className="hidden border-l pl-3 font-mono text-[10px] uppercase tracking-[.12em] text-slate-500 sm:inline">campus signal layer</span>
          </a>
          <a href="/app/roadmap" className="inline-flex items-center gap-2 rounded-lg border border-[var(--physi-line)] px-3 py-2 font-mono text-xs text-slate-300 hover:border-[var(--physi-cyan)] hover:text-[var(--physi-cyan)]">Open live road <ArrowUpRight className="h-3.5 w-3.5" /></a>
        </div>
      </header>

      <main className="mx-auto max-w-[1180px] px-5 sm:px-8">
        <section className="grid gap-12 py-14 lg:grid-cols-[1.05fr_.95fr] lg:items-center lg:py-24">
          <div>
            <LiveStats />
            <p className="landing-kicker mt-10">Student-powered. Advisory by design.</p>
            <h1 className="landing-display mt-4 max-w-[650px] text-5xl font-bold leading-[.95] sm:text-7xl">Know the move<br /><span className="text-[var(--physi-cyan)]">before you move.</span></h1>
            <p className="mt-7 max-w-[560px] text-base leading-7 text-slate-400 sm:text-lg">PHYSI turns the small campus updates that usually get lost in group chats into a visible, verifiable live feed.</p>
            <div className="mt-8 flex flex-wrap items-center gap-4"><a href="/app/roadmap" className="primary-cta px-5 py-3.5 text-sm">View the live timetable <ArrowUpRight className="h-4 w-4" /></a><span className="flex items-center gap-2 font-mono text-xs text-slate-500"><Clock3 className="h-3.5 w-3.5" /> updated continuously</span></div>
            <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 font-mono text-xs text-slate-500"><span className="flex items-center gap-2"><ShieldCheck className="h-3.5 w-3.5 text-[var(--physi-lime)]" /> visible trust</span><span className="flex items-center gap-2"><Users className="h-3.5 w-3.5 text-[var(--physi-cyan)]" /> built by students</span><span>not official university communication</span></div>
          </div>
          <div><SignalRadar /><p className="mt-3 text-center font-mono text-[10px] uppercase tracking-[.12em] text-slate-500">confidence is a live property, not a badge</p></div>
        </section>

        <section className="border-y landing-rule py-10"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="landing-kicker">The protocol</p><h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">From rumour to signal.</h2></div><p className="max-w-sm text-sm leading-6 text-slate-400">No pretending the feed is official. No hiding uncertainty. PHYSI makes the strength of every update legible.</p></div><div className="mt-8 grid gap-3 md:grid-cols-3">{steps.map(([number, title, copy]) => <article key={number} className="landing-panel p-5"><span className="font-mono text-xs text-[var(--physi-cyan)]">/{number}</span><h3 className="mt-8 text-lg font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-400">{copy}</p></article>)}</div></section>

        <section className="grid gap-8 py-14 sm:grid-cols-[1fr_auto] sm:items-end"><div><p className="landing-kicker">For the whole campus</p><h2 className="mt-3 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">One calm place for the updates that matter right now.</h2></div><a href="/app/profile" className="font-mono text-sm text-[var(--physi-cyan)] hover:underline">Set up your profile →</a></section>
        <footer className="flex flex-wrap items-center justify-between gap-4 border-t landing-rule py-7 font-mono text-xs text-slate-500"><span>PHYSI / campus signal layer</span><span>points have no cash value · <a href="/terms" className="text-slate-300 underline">terms</a></span></footer>
      </main>
    </div>
  );
}
