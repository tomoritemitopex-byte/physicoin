"use client";
import { useState } from "react";

type Level = {
  n: number;
  title: string;
  subtitle: string;
  blurb: string;
  reward: string;
  color: string;
};

const LEVELS: Level[] = [
  { n: 1, title: "First Gist", subtitle: "you heard something", blurb: "Someone whispered LT changed. You post it — advisory, waiting for eyes.", reward: "+1 signal", color: "#94a3b8" },
  { n: 2, title: "Hall Whisper", subtitle: "venue chatter", blurb: "Two coursemates saw the same notice. Gist starts to rhyme.", reward: "scope tagged", color: "#a78bfa" },
  { n: 3, title: "Posted", subtitle: "live on the feed", blurb: "It’s on the timetable now — amber dot. Everyone can see your gist.", reward: "on feed", color: "#f59e0b" },
  { n: 4, title: "First Yes", subtitle: "someone was there", blurb: "One Yes lands. Not gist anymore — someone actually showed up and confirmed.", reward: "trust +1", color: "#34d399" },
  { n: 5, title: "Gathering Crowd", subtitle: "coursemates weigh in", blurb: "Yes and No taps pile up. The crowd is sorting truth from stale broadcast.", reward: "momentum", color: "#60a5fa" },
  { n: 6, title: "Cross-Checked", subtitle: "majority leans yes", blurb: "Most taps are Yes. Latecomers still trek to the wrong hall — this saves them.", reward: "almost green", color: "#38bdf8" },
  { n: 7, title: "Approaching Green", subtitle: "threshold near", blurb: "Authority points nearly there. One or two more Yes and it flips.", reward: "99% there", color: "#fbbf24" },
  { n: 8, title: "Verified Timetable", subtitle: "green tick ✓", blurb: "Green tick. Your gist is now the timetable freshers trust. You built that.", reward: "✓ canonical", color: "#10b981" },
];

// candy-crush winding: alternate x, steady y
const NODES = [
  { x: 180, y: 84 },
  { x: 320, y: 148 },
  { x: 150, y: 218 },
  { x: 330, y: 286 },
  { x: 170, y: 358 },
  { x: 310, y: 430 },
  { x: 145, y: 502 },
  { x: 250, y: 585 },
];

export default function RoadmapPage() {
  const [active, setActive] = useState<number>(8);
  const [done, setDone] = useState<Set<number>>(new Set([1, 2, 3]));
  const a = LEVELS.find((l) => l.n === active) ?? LEVELS[0];

  function toggleDone(n: number) {
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  }

  // SVG road path winding through nodes
  const roadD = `M ${NODES[0].x} ${NODES[0].y} C ${NODES[0].x + 110} ${NODES[0].y + 30}, ${NODES[1].x + 80} ${NODES[1].y - 20}, ${NODES[1].x} ${NODES[1].y} C ${NODES[1].x - 110} ${NODES[1].y + 30}, ${NODES[2].x - 80} ${NODES[2].y - 30}, ${NODES[2].x} ${NODES[2].y} C ${NODES[2].x + 120} ${NODES[2].y + 35}, ${NODES[3].x + 80} ${NODES[3].y - 30}, ${NODES[3].x} ${NODES[3].y} C ${NODES[3].x - 110} ${NODES[3].y + 35}, ${NODES[4].x - 80} ${NODES[4].y - 30}, ${NODES[4].x} ${NODES[4].y} C ${NODES[4].x + 100} ${NODES[4].y + 35}, ${NODES[5].x + 80} ${NODES[5].y - 35}, ${NODES[5].x} ${NODES[5].y} C ${NODES[5].x - 120} ${NODES[5].y + 40}, ${NODES[6].x - 80} ${NODES[6].y - 30}, ${NODES[6].x} ${NODES[6].y} C ${NODES[6].x + 110} ${NODES[6].y + 40}, ${NODES[7].x + 50} ${NODES[7].y - 30}, ${NODES[7].x} ${NODES[7].y}`;

  return (
    <div className="space-y-4">
      <div>
        <p className="font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-slate-500">roadmap · from gist to green tick</p>
        <h1 className="mt-1 text-[22px] font-bold tracking-[-0.025em] text-white sm:text-[26px]">8 steps — gist becomes timetable</h1>
        <p className="mt-1 max-w-[640px] text-[13.5px] leading-5 text-slate-400">
          Tap any level on the winding road. Your post starts as gist, your coursemates turn it into truth. Green tick isn&apos;t magic — it&apos;s enough <span className="text-slate-200">Yes, I was there</span> to cross the line.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
        {/* winding path card */}
        <div className="relative overflow-hidden rounded-[20px] border border-white/[0.07] bg-[#0a0f1e] p-0">
          {/* subtle grid */}
          <div className="pointer-events-none absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
          <div className="relative">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="font-mono text-[11px] tracking-wide text-slate-500">TAP A LEVEL — SEE WHAT IT MEANS</span>
              <span className="rounded-full bg-white px-2.5 py-1 font-mono text-[11px] font-bold text-[#0a0f1e]">{done.size}/8 touched</span>
            </div>

            <div className="relative mx-auto w-full max-w-[420px]">
              <svg viewBox="0 0 500 680" className="h-[640px] w-full sm:h-[650px]" role="img" aria-label="roadmap winding path">
                <defs>
                  <linearGradient id="roadGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#1e293b" />
                    <stop offset="50%" stopColor="#334155" />
                    <stop offset="100%" stopColor="#1e293b" />
                  </linearGradient>
                  <filter id="glow">
                    <feDropShadow dx="0" dy="2" stdDeviation="6" floodColor="rgba(255,255,255,0.12)" />
                  </filter>
                </defs>

                {/* road casing */}
                <path d={roadD} fill="none" stroke="#0f172a" strokeWidth={38} strokeLinecap="round" strokeLinejoin="round" opacity={0.95} />
                {/* road */}
                <path d={roadD} fill="none" stroke="url(#roadGrad)" strokeWidth={26} strokeLinecap="round" strokeLinejoin="round" />
                {/* dashed centre line */}
                <path d={roadD} fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeDasharray="10 14" opacity={0.28} />
                {/* soft inner highlight */}
                <path d={roadD} fill="none" stroke="white" strokeWidth={1} opacity={0.06} />

                {/* nodes */}
                {LEVELS.map((lvl, i) => {
                  const p = NODES[i];
                  const isActive = active === lvl.n;
                  const isDone = done.has(lvl.n);
                  const isLast = lvl.n === 8;
                  return (
                    <g key={lvl.n} onClick={() => setActive(lvl.n)} style={{ cursor: "pointer" }}>
                      {/* halo for active */}
                      {isActive && <circle cx={p.x} cy={p.y} r={42} fill="white" opacity={0.09} />}
                      {/* shadow */}
                      <circle cx={p.x} cy={p.y + 4} r={isLast ? 30 : 26} fill="black" opacity={0.25} />
                      {/* outer ring */}
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r={isLast ? 30 : 26}
                        fill={isActive ? "white" : isDone ? "#10b981" : "#0f172a"}
                        stroke={isActive ? "white" : isDone ? "#34d399" : "rgba(255,255,255,0.18)"}
                        strokeWidth={isActive ? 3 : 2.5}
                        filter="url(#glow)"
                      />
                      {/* inner */}
                      <circle cx={p.x} cy={p.y} r={isLast ? 22 : 19} fill={isDone && !isActive ? "#065f46" : isActive ? "#0a0f1e" : "#1e293b"} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
                      {/* number / tick */}
                      <text x={p.x} y={p.y + 5} textAnchor="middle" fontSize={isLast ? 15 : 13} fontWeight={800} fill={isActive ? "white" : isDone ? "#6ee7b7" : "#cbd5e1"} style={{ fontFamily: "ui-monospace, monospace" }}>
                        {isLast ? "✓" : isDone ? "✓" : lvl.n}
                      </text>
                      {/* label pill */}
                      <g>
                        <rect
                          x={p.x < 250 ? p.x + 34 : p.x - 134}
                          y={p.y - 14}
                          width={100}
                          height={28}
                          rx={14}
                          fill={isActive ? "white" : "rgba(255,255,255,0.08)"}
                          stroke={isActive ? "white" : "rgba(255,255,255,0.12)"}
                        />
                        <text x={p.x < 250 ? p.x + 84 : p.x - 84} y={p.y + 4} textAnchor="middle" fontSize={10} fontWeight={700} fill={isActive ? "#0a0f1e" : "white"}>
                          {lvl.title}
                        </text>
                      </g>
                      {/* step number badge */}
                      <circle cx={p.x < 250 ? p.x + 28 : p.x - 28} cy={p.y - 18} r={9} fill={isActive ? "#0a0f1e" : "#334155"} />
                      <text x={p.x < 250 ? p.x + 28 : p.x - 28} y={p.y - 14} textAnchor="middle" fontSize={8} fontWeight={800} fill="white">
                        {lvl.n}
                      </text>
                    </g>
                  );
                })}
              </svg>

              {/* floating hint */}
              <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-[#0f172a]/90 px-3 py-1 font-mono text-[10.5px] text-slate-400 backdrop-blur">
                winding road · tap any node
              </div>
            </div>
          </div>
        </div>

        {/* detail panel */}
        <div className="space-y-3">
          <div className="rounded-[20px] border border-white/[0.07] bg-white/[0.03] p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-black text-white shadow"
                  style={{ background: a.color }}
                >
                  {a.n === 8 ? "✓" : a.n}
                </span>
                <div>
                  <h2 className="text-[16px] font-bold leading-tight text-white">{a.title}</h2>
                  <p className="font-mono text-[11px] tracking-wide text-slate-500">{a.subtitle} · level {a.n} of 8</p>
                </div>
              </div>
              <span className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 font-mono text-[11px] text-slate-300">{a.reward}</span>
            </div>
            <p className="mt-3 text-[14px] leading-6 text-slate-300">{a.blurb}</p>
            <p className="mt-3 rounded-xl bg-white/[0.04] px-3 py-2 font-mono text-[11px] leading-4 text-slate-400">
              {a.n <= 3 && "You post, it shows instantly — advisory. No waiting for admin approval."}
              {a.n === 4 && "One coursemate tapped Yes after being in that hall. That’s the first real signal."}
              {a.n === 5 && "More taps = more trust. The levels where gist fights gist and truth wins."}
              {a.n === 6 && "Majority Yes. If you trekked yesterday to the wrong hall, this level is why you won’t tomorrow."}
              {a.n === 7 && "So close — needs one or two more confirmations. Tell your group chat."}
              {a.n === 8 && "Green tick. Freshers check this and go to the right hall first time. You made the timetable honest."}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => toggleDone(a.n)}
                className={`rounded-full px-4 py-2 text-[13px] font-semibold transition ${done.has(a.n) ? "bg-emerald-500 text-white" : "bg-white text-[#0a0f1e] hover:bg-slate-100"}`}
              >
                {done.has(a.n) ? "✓ touched" : "Mark as touched"}
              </button>
              <button
                onClick={() => setActive((n) => Math.min(8, n + 1))}
                className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[13px] font-medium text-slate-200 hover:bg-white/[0.08]"
              >
                Next → {Math.min(8, a.n + 1) === a.n ? "" : LEVELS.find((l) => l.n === a.n + 1)?.title}
              </button>
            </div>
          </div>

          {/* progress strip */}
          <div className="rounded-[20px] border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[11px] font-medium uppercase tracking-wide text-slate-500">Your walk</p>
              <p className="font-mono text-[11px] text-slate-500">{done.size} / 8</p>
            </div>
            <div className="mt-3 flex gap-1.5">
              {LEVELS.map((l) => (
                <button
                  key={l.n}
                  onClick={() => setActive(l.n)}
                  className={`h-2 flex-1 rounded-full transition ${done.has(l.n) ? "bg-emerald-400" : active === l.n ? "bg-white" : "bg-white/15"}`}
                  aria-label={`go to ${l.title}`}
                />
              ))}
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
              {LEVELS.map((l) => (
                <button
                  key={l.n}
                  onClick={() => setActive(l.n)}
                  className={`rounded-xl border px-2 py-2 text-center transition ${active === l.n ? "border-white bg-white text-[#0a0f1e]" : done.has(l.n) ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : "border-white/10 bg-white/[0.03] text-slate-400 hover:text-white"}`}
                >
                  <span className="block font-mono text-[10px]">{l.n}</span>
                  <span className="block truncate text-[11px] font-medium leading-tight">{l.title.split(" ")[0]}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
            <p className="text-[13px] font-semibold text-white">How green tick really works</p>
            <p className="mt-1 text-[12.5px] leading-5 text-slate-400">
              Every post starts with <span className="text-amber-200">advisory</span>. When your coursemates tap Yes, they add authority points. Hit the required number and the row flips to <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[11px] font-bold text-white">✓ green</span>. No admin magic — just enough people saying “I was there.”
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a href="/app/timetable" className="rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-[#0a0f1e]">Open timetable →</a>
              <a href="/app/verify" className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[13px] font-medium text-slate-200">Go verify</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
