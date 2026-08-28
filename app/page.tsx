import { ProfilePilotForm } from '@/components/profile-pilot-form';
import { MiningPanel } from '@/components/mining-panel';
import { EventRoadmap } from '@/components/event-roadmap';
import { TimetableFeed } from '@/components/timetable-feed';
import { VerificationEngine } from '@/components/verification-engine';

const metrics = [
  { label: 'Pilot schools', value: '01', note: 'FUHSI-first rollout' },
  { label: 'Verified events', value: '128', note: 'Scoped, reviewed, canonical' },
  { label: 'Active testers', value: '42', note: 'Students, reps, and admins' },
  { label: 'Authority-weighted yes', value: '94%', note: 'Real verification signal' },
];

const modules = [
  { title: 'Identity & Access', detail: 'Profile setup, role scopes, and enterprise-ready user access.', status: 'Ready for pilot' },
  { title: 'Event Roadmap', detail: 'Personal roadmap bubbles, canonical promotion, duplicate prevention.', status: 'In testing' },
  { title: 'Timetable Feed', detail: 'Live timetable sync with green, yellow, and red confidence states.', status: 'Ready' },
  { title: 'Mining Engine', detail: 'Daily tap-to-mine loop with authority-weighted rewards.', status: 'Ready' },
  { title: 'Verification Engine', detail: 'Random in-app popups with yes / no / cancel decisions.', status: 'Testing now' },
  { title: 'Analytics & Audit', detail: 'Track authority changes, event promotion, and suspicious patterns.', status: 'Planned' },
];

const readiness = [
  'Brand the front page as PHYSI Enterprise Pilot',
  'Begin testing with a small user group first',
  'Keep Neon as the database layer for live records',
  'Deploy through Vercel for fast iteration and previews',
  'Use your profile as the actor and LangSmith Fleet as the workspace label',
];

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-6 lg:px-10">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-white/10 bg-white/5 px-5 py-4 shadow-2xl backdrop-blur">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-500 text-3xl font-black text-slate-900 shadow-lg">
              $
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.35em] text-amber-300">PHYSI Enterprise</p>
              <h1 className="text-2xl font-black leading-tight">Campus truth infrastructure</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 font-semibold text-emerald-300">
              Pilot testing mode
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 font-semibold text-slate-200">
              physi.vercel.app
            </span>
          </div>
        </header>

        <ProfilePilotForm />

        <div className="mt-8 grid gap-6">
          <MiningPanel />
          <EventRoadmap />
          <TimetableFeed />
          <VerificationEngine />
        </div>

        <section className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[2rem] border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur">
            <div className="inline-flex rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-1 text-xs font-bold uppercase tracking-[0.3em] text-emerald-300">
              Enterprise-ready test build
            </div>
            <h2 className="mt-5 max-w-2xl text-4xl font-black leading-tight sm:text-5xl">
              A production-style PHYSI dashboard for testing, verification, and rollout.
            </h2>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-300">
              This version looks and feels like an enterprise pilot: clean dashboard cards,
              metrics, module readiness, audit focus, and a strong front page for onboarding testers.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a className="rounded-full bg-white px-6 py-3 text-sm font-black text-slate-950 shadow-lg shadow-black/20" href="#modules">
                Review modules
              </a>
              <a className="rounded-full border border-white/15 bg-transparent px-6 py-3 text-sm font-black text-white" href="#testing">
                Start testing checklist
              </a>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {metrics.map((metric) => (
                <div key={metric.label} className="rounded-3xl border border-white/10 bg-slate-900/60 p-4">
                  <p className="text-sm font-semibold text-slate-400">{metric.label}</p>
                  <p className="mt-2 text-4xl font-black text-white">{metric.value}</p>
                  <p className="mt-2 text-xs uppercase tracking-[0.22em] text-emerald-300">{metric.note}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-slate-900 to-slate-800 p-6 shadow-2xl">
            <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5">
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-amber-300">Front page coin sign</p>
              <div className="mt-4 flex items-center gap-4">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-500 text-4xl font-black text-slate-900 shadow-lg">
                  $
                </div>
                <div>
                  <p className="text-3xl font-black">PHYSI</p>
                  <p className="mt-1 text-sm leading-6 text-slate-300">
                    Event-driven truth coin for campus life.
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-5 rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-5">
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-sky-300">Enterprise controls</p>
              <div className="mt-4 space-y-3 text-sm leading-7 text-slate-300">
                <p>• Scoped event promotion with duplicate prevention</p>
                <p>• Authority-weighted verification and mining</p>
                <p>• Neon-backed data storage and Vercel deployment</p>
                <p>• Testing-first UX for small pilot groups</p>
              </div>
            </div>
          </div>
        </section>

        <section id="modules" className="mt-8 grid gap-4 lg:grid-cols-3">
          {modules.map((module) => (
            <article key={module.title} className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5 shadow-xl backdrop-blur">
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-xl font-black text-white">{module.title}</h3>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-emerald-300">
                  {module.status}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-300">{module.detail}</p>
            </article>
          ))}
        </section>

        <section id="testing" className="mt-8 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-[2rem] border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur">
            <h3 className="text-2xl font-black">Testing checklist</h3>
            <div className="mt-6 space-y-4">
              {readiness.map((item, index) => (
                <div key={item} className="flex gap-4 rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-400 text-sm font-black text-slate-950">
                    {index + 1}
                  </div>
                  <p className="text-sm leading-6 text-slate-200">{item}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-emerald-400/15 via-sky-400/10 to-violet-400/15 p-8 shadow-2xl backdrop-blur">
            <h3 className="text-2xl font-black">Pilot workflow</h3>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {[
                ['Step 1', 'Create accounts and pick programme, level, courses, and status scopes.'],
                ['Step 2', 'Push sample events into the roadmap and test canonical promotion.'],
                ['Step 3', 'Test random in-app verification and authority changes.'],
                ['Step 4', 'Connect Neon records and deploy the preview to Vercel.'],
              ].map(([title, copy]) => (
                <div key={title} className="rounded-3xl border border-white/10 bg-slate-950/55 p-5">
                  <p className="text-xs font-bold uppercase tracking-[0.28em] text-amber-300">{title}</p>
                  <p className="mt-3 text-sm leading-6 text-slate-300">{copy}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <footer className="mt-8 rounded-[2rem] border border-white/10 bg-white/5 px-6 py-5 text-sm text-slate-300 shadow-2xl backdrop-blur">
          Enterprise-ready PHYSI pilot build. Next step: wire auth, Neon reads/writes, and the event roadmap screen.
        </footer>
      </div>
    </main>
  );
}
