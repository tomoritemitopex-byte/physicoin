// FRONT landing — RSC, no auth wall. Tool teaser before marketing.
// INSIDE lives at /app/* — keep this route fast, crawlable, value-first.
export default function LandingPage() {
  return (
    <main className="mx-auto max-w-[1240px] px-6 py-10 lg:px-8">
      {/* Minimal FRONT — full SRE.ai editorial ships in Phase 3 */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-white text-[10px] font-black tracking-[-0.04em] text-slate-900">
            PHYSI
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/15 bg-emerald-400/10 px-2.5 py-1 font-mono text-[10.5px] font-medium tracking-wide text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live · Pilot
          </span>
        </div>
        <a
          href="/app/timetable"
          className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[13px] font-medium text-slate-200 hover:bg-white/[0.08] transition"
        >
          Login
        </a>
      </header>

      <section className="mt-10 rounded-[20px] border border-white/[0.06] bg-white/[0.02] px-6 py-8">
        <p className="font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-slate-500">
          Live timetable — advisory
        </p>
        <h1 className="mt-2 text-[28px] font-bold leading-tight tracking-[-0.025em] text-white sm:text-[34px]">
          A live timetable
          <br />
          built by students.
        </h1>
        <p className="mt-3 max-w-[640px] text-[15px] leading-6 text-slate-400">
          You survived JAMB, you survived clearance, now nobody can tell you where 8 a.m. Anatomy holds.
          Freshers trek to the wrong hall, stale gist flies in WhatsApp broadcasts. Here, you post what you hear
          and tap Yes / No if you were actually there. More students checking = truer timetable for everyone.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <a
            href="/app/timetable"
            className="inline-flex items-center gap-1.5 rounded-full bg-white px-5 py-2.5 text-[14px] font-semibold text-slate-900 hover:bg-slate-100 transition"
          >
            Open timetable →
          </a>
          <a
            href="/app/profile"
            className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-5 py-2.5 text-[14px] font-medium text-slate-200 hover:bg-white/[0.08] transition"
          >
            Create profile
          </a>
        </div>
        <p className="mt-4 font-mono text-[11px] leading-4 text-slate-600">
          TEST-PHYSI is play energy — no cash value, expires in 24h. Advisory only — always confirm exams with your department. Green tick = your coursemates confirmed it.
        </p>
      </section>

      <section className="mt-8">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">Why this exists</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {[
            ['You hear it first', 'Lecturer whispers “we’ll shift to Hall B”? Post it now. Don’t wait for a broadcast that never comes.'],
            ['Green tick = real', 'Your coursemates tap Yes, No or Skip. Enough Yes and it turns green — that’s how you know it’s legit.'],
            ['TEST-PHYSI isn’t cash', 'Daily check-in gives you TEST-PHYSI for 24 hours. Think of it like marking attendance — it shows you’re active, not that you’re rich.'],
          ].map(([k, v]) => (
            <div key={k} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-4">
              <p className="text-[13px] font-semibold text-white">{k}</p>
              <p className="mt-1 text-[13px] leading-5 text-slate-400">{v}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8 rounded-[20px] border border-white/[0.06] bg-white/[0.02] px-6 py-6">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">How it works — 4 steps</p>
        <ol className="mt-4 grid gap-3 sm:grid-cols-4">
          {[
            ['1. Pick your handle', 'e.g. alex_02 — not “Dream” or “John Doe”. People trust a real coursemate.'],
            ['2. Post what you hear', '“BIO 101 moved to LT2, Friday 8am” — it shows instantly as advisory.'],
            ['3. Others confirm', 'Were you there? Tap Yes / No / Skip. No long forms.'],
            ['4. Green tick wins', 'Many Yes = green tick. Many No = it fades. The crowd corrects the gist.'],
          ].map(([k, v]) => (
            <li key={k} className="rounded-2xl border border-white/[0.06] bg-white/[0.015] px-4 py-4">
              <p className="text-[13px] font-semibold text-white">{k}</p>
              <p className="mt-1 text-[13px] leading-5 text-slate-400">{v}</p>
            </li>
          ))}
        </ol>
        <p className="mt-4 font-mono text-[11px] leading-4 text-slate-500">Network effect: one person posting helps ten freshers not miss class. Ten people confirming helps the whole department.</p>
      </section>

      <section className="mt-8 rounded-[20px] border border-emerald-400/15 bg-emerald-400/[0.06] px-6 py-6 text-center">
        <h2 className="text-[20px] font-bold tracking-[-0.02em] text-white">Don’t miss the next venue change</h2>
        <p className="mx-auto mt-2 max-w-[560px] text-[14px] leading-5 text-slate-300">Join your coursemates — post once, check once a day, and stop trekking to the wrong hall.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <a href="/app/timetable" className="inline-flex items-center gap-1.5 rounded-full bg-white px-6 py-2.5 text-[14px] font-semibold text-slate-900 hover:bg-slate-100 transition">Open timetable →</a>
          <a href="/app/profile" className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-6 py-2.5 text-[14px] font-medium text-slate-200 hover:bg-white/[0.08] transition">Create profile</a>
          <a href="/app/timetable" className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-6 py-2.5 text-[14px] font-medium text-slate-200 hover:bg-white/[0.08] transition">Login</a>
        </div>
        <p className="mt-3 font-mono text-[11px] leading-4 text-slate-500">TEST-PHYSI has no cash value — expires in 24h, just a health-style streak for being active. Advisory only — always confirm exams with your department.</p>
      </section>

      <p className="mt-8 text-center font-mono text-[11px] tracking-wide text-slate-600">
        Scaffold v2 · FRONT / INSIDE split · See <code className="rounded bg-white/10 px-1 py-0.5">/tmp/new-arch.md</code> for architecture
      </p>
    </main>
  );
}
