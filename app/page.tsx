const roadmapEvents = [
  {
    title: 'Orientation Week',
    badge: 'Canonical',
    tone: 'green',
    detail: 'Campus-wide verified event',
  },
  {
    title: 'Dept Townhall',
    badge: 'Personal',
    tone: 'yellow',
    detail: 'Shown only to your scope until verified',
  },
  {
    title: 'Career Sport',
    badge: 'Personal',
    tone: 'blue',
    detail: 'Visible to matching students only',
  },
  {
    title: 'SUG Week',
    badge: 'Locked',
    tone: 'purple',
    detail: 'High-authority event ready for promotion',
  },
];

const steps = [
  'Create profile with legal surname, legal first name, and nickname',
  'Pick programme, level, courses, and statuses from dropdowns',
  'See only events in your scope on your personal roadmap',
  'Tap to mine daily and earn more as your authority grows',
];

const roles = [
  ['Student', '1.0x'],
  ['Course Rep', '1.5x'],
  ['Class Rep', '1.6x'],
  ['Department Exec', '2.0x'],
  ['Faculty Rep', '2.2x'],
  ['SUG', '2.5x'],
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#fff7d6,white_38%,#effef0_100%)] text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-6 lg:px-10">
        <header className="flex items-center justify-between rounded-full border border-white/70 bg-white/75 px-5 py-3 shadow-sm backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-500 text-2xl shadow-md">
              $
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-700">PHYSI</p>
              <h1 className="text-lg font-black leading-tight">Canonical Events</h1>
            </div>
          </div>
          <div className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white">
            physi.vercel.app
          </div>
        </header>

        <section className="mt-8 grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[2rem] border border-white/70 bg-white/75 p-8 shadow-xl backdrop-blur">
            <p className="inline-flex rounded-full bg-emerald-100 px-4 py-1 text-xs font-bold uppercase tracking-[0.25em] text-emerald-800">
              Truth-backed campus network
            </p>
            <h2 className="mt-5 max-w-2xl text-4xl font-black leading-tight sm:text-5xl">
              A student-powered roadmap where events become canonical only after real verification.
            </h2>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
              PHYSI starts as a web-first app. Students create profiles, pick their programme and level,
              see only the events that match their scope, and mine PHYSI daily when the network is active.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <a className="rounded-full bg-slate-900 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-slate-900/20" href="#roadmap">
                View roadmap
              </a>
              <a className="rounded-full border border-slate-300 bg-white px-6 py-3 text-sm font-bold text-slate-900" href="#system">
                See how it works
              </a>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {[
                ['Web first', 'Built for Vercel deployment'],
                ['Neon DB', 'Postgres-ready backend storage'],
                ['Daily mining', 'Tap-to-mine network loop'],
              ].map(([title, copy]) => (
                <div key={title} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-black">{title}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{copy}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/70 bg-white/80 p-6 shadow-xl backdrop-blur">
            <div className="rounded-[1.5rem] bg-gradient-to-br from-lime-300 via-emerald-300 to-sky-200 p-5">
              <div className="rounded-[1.5rem] border border-white/70 bg-white/75 p-5 shadow-lg">
                <p className="text-xs font-bold uppercase tracking-[0.25em] text-slate-500">Front page coin sign</p>
                <div className="mt-4 flex items-center gap-4">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-500 text-4xl font-black shadow-md">
                    $
                  </div>
                  <div>
                    <p className="text-3xl font-black">PHYSI</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      Event-driven truth coin for campus life.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-[1.5rem] bg-slate-900 p-5 text-white">
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-emerald-300">Live loop</p>
              <div className="mt-4 space-y-3 text-sm leading-7 text-slate-200">
                <p>Submit event → suggest duplicates → verify → promote to canonical</p>
                <p>Personal roadmaps stay scoped until enough authority-weighted YES votes land</p>
                <p>Daily mining rewards rise with authority and verified truth</p>
              </div>
            </div>
          </div>
        </section>

        <section id="roadmap" className="mt-8 grid gap-4 lg:grid-cols-4">
          {roadmapEvents.map((event) => {
            const toneMap: Record<string, string> = {
              green: 'from-emerald-400 to-emerald-600 text-white',
              yellow: 'from-amber-300 to-amber-500 text-slate-900',
              blue: 'from-sky-300 to-sky-500 text-slate-900',
              purple: 'from-violet-300 to-violet-500 text-white',
            };
            return (
              <article key={event.title} className="rounded-[1.75rem] border border-white/70 bg-white/80 p-5 shadow-lg backdrop-blur">
                <div className={`inline-flex rounded-full bg-gradient-to-br px-4 py-1 text-xs font-black uppercase tracking-[0.22em] ${toneMap[event.tone]}`}>
                  {event.badge}
                </div>
                <h3 className="mt-4 text-2xl font-black">{event.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{event.detail}</p>
              </article>
            );
          })}
        </section>

        <section id="system" className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[2rem] border border-white/70 bg-white/75 p-8 shadow-xl backdrop-blur">
            <h3 className="text-2xl font-black">How the app works</h3>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {steps.map((step, index) => (
                <div key={step} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-black text-amber-700">0{index + 1}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{step}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/70 bg-white/75 p-8 shadow-xl backdrop-blur">
            <h3 className="text-2xl font-black">Authority market cap</h3>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              Higher authority means higher verification weight and stronger mining power.
            </p>
            <div className="mt-6 space-y-3">
              {roles.map(([name, rate]) => (
                <div key={name} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <span className="font-semibold">{name}</span>
                  <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-bold text-white">{rate}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <footer className="mt-8 rounded-[2rem] border border-white/70 bg-white/70 px-6 py-5 text-sm text-slate-600 shadow-lg backdrop-blur">
          Ready for Vercel + Neon. Add your Neon connection string as an environment variable, then deploy the repo from GitHub.
        </footer>
      </div>
    </main>
  );
}
