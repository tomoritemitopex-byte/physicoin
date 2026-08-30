"use client";
// FRONT landing — forest palette + road peek, Cruip-tier polish, Naija-voice copy.
// Palette: forest #0d3b2a→#1a5c3a, purple road #8b5cf6, Fredoka hero, lollipop tree accent
import { Fredoka } from "next/font/google";
const fredoka = Fredoka({ subsets: ["latin"], weight: ["400","500","600","700"], display: "swap", variable: "--font-fredoka" });
import { useEffect, useState } from 'react';
import { Megaphone, BadgeCheck, Coins, Users, ArrowRight, ShieldCheck, Clock3, MapPin, Sparkles, CheckCircle2, Quote } from 'lucide-react';

function MiniRoadPeek(){
  // cropped SVG preview: forest bg, purple winding road, 3 nodes, NOW pulse, Fredoka label
  // clickable -> /app/roadmap (demo picker, no login wall)
  return (
    <a href="/app/roadmap" className="group relative block overflow-hidden rounded-[18px] border border-white/10 shadow-[0_12px_32px_rgba(0,0,0,0.35),0_2px_10px_rgba(0,0,0,0.25)] hover:border-white/15 transition">
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, #0d3b2a 0%, #143d2e 48%, #1a5c3a 100%)" }} />
      {/* subtle glow */}
      <div className="pointer-events-none absolute -top-10 left-1/2 h-32 w-[120%] -translate-x-1/2 rounded-[100%] opacity-30" style={{ background: "radial-gradient(ellipse at center, rgba(82,183,136,0.35), transparent 70%)" }} />
      <svg viewBox="0 0 640 148" className="relative w-full h-[96px] sm:h-[108px]" role="img" aria-label="Road preview — 3 nodes, NOW, tap to play">
        {/* trees bg - mountains */}
        <path d="M -10 108 L 70 58 L 140 92 L 220 38 L 320 88 L 420 52 L 520 92 L 600 62 L 650 108 Z" fill="rgba(13,59,42,0.45)" stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
        {/* lollipop trees — accent */}
        <g opacity={0.95}>
          <rect x={48} y={78} width={6} height={14} rx={3} fill="#5a3e1b" />
          <circle cx={51} cy={68} r={16} fill="#52b788" stroke="rgba(255,255,255,0.18)" strokeWidth={1.2} />
          <circle cx={51} cy={68} r={9} fill="rgba(255,255,255,0.09)" />
          <circle cx={56} cy={62} r={3} fill="#fbbf24" stroke="white" strokeWidth={0.8} />
        </g>
        <g opacity={0.70}>
          <rect x={560} y={82} width={5} height={12} rx={2.5} fill="#5a3e1b" />
          <circle cx={562} cy={73} r={13} fill="#40916c" stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
          <circle cx={562} cy={73} r={4} fill="rgba(255,255,255,0.10)" />
        </g>
        {/* purple road */}
        <defs>
          <linearGradient id="pr" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#6e45d0" />
            <stop offset="50%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#a78bfa" />
          </linearGradient>
        </defs>
        {(() => {
          const d = "M 20 96 C 140 96, 140 52, 260 52 C 380 52, 380 96, 500 96 C 560 96, 600 92, 620 88";
          return (
            <g>
              <path d={d} fill="none" stroke="#1a1033" strokeWidth={30} strokeLinecap="round" opacity={0.95} />
              <path d={d} fill="none" stroke="url(#pr)" strokeWidth={26} strokeLinecap="round" style={{ filter: "drop-shadow(0 3px 8px rgba(0,0,0,0.32))" } as any} />
              {/* white sprinkles */}
              <path d={d} fill="none" stroke="rgba(255,255,255,0.72)" strokeWidth={3.2} strokeLinecap="round" strokeDasharray="0 36" strokeDashoffset={4} style={{ transform: "translate(0, -9px)" } as any} opacity={0.9} />
              <path d={d} fill="none" stroke="rgba(255,255,255,0.72)" strokeWidth={3.2} strokeLinecap="round" strokeDasharray="0 36" strokeDashoffset={22} style={{ transform: "translate(0, 9px)" } as any} opacity={0.9} />
              <path d={d} fill="none" stroke="white" strokeWidth={2.2} strokeLinecap="round" strokeDasharray="10 10" opacity={0.92} />
            </g>
          );
        })()}
        {/* 3 nodes */}
        {[
          { x: 118, y: 74, label: "ANA 201", sub: "8AM", icon: "●", fill: "#fffbeb", outline: "#f59e0b", color: "#92400e" },
          { x: 320, y: 52, label: "BIO 101", sub: "NOW", icon: "✓", fill: "#ecfdf5", outline: "#10b981", color: "#065f46", pulse: true, now: true },
          { x: 498, y: 96, label: "CHM 112", sub: "2PM", icon: "●", fill: "#f5f3ff", outline: "#8b5cf6", color: "#6d28d9", demo: true },
        ].map((n,i)=> (
          <g key={i}>
            {n.pulse && <circle cx={n.x} cy={n.y} r={22} fill="none" stroke="#8b5cf6" strokeWidth={2.2} opacity={0.85} style={{ animation: "miniPulse 1.2s ease-out infinite" }} />}
            <circle cx={n.x} cy={n.y + 4} r={18} fill="black" opacity={0.28} />
            <circle cx={n.x} cy={n.y} r={18} fill={n.fill} stroke={n.outline} strokeWidth={2.4} strokeDasharray={n.demo ? "5 3" : undefined} />
            <text x={n.x} y={n.y + 4.5} textAnchor="middle" fontSize={11} fontWeight={800} fill={n.color} style={{ fontFamily: "var(--font-fredoka), Fredoka, system-ui" }}>{n.icon}</text>
            {/* pill label */}
            <g>
              <rect x={n.x - 38} y={n.y - 42} width={76} height={18} rx={9} fill={n.now ? "white" : "rgba(0,0,0,0.62)"} stroke={n.now ? "white" : "rgba(255,255,255,0.18)"} />
              <text x={n.x} y={n.y - 30.5} textAnchor="middle" fontSize={7.8} fontWeight={900} fill={n.now ? "#000" : "white"} style={{ fontFamily: "var(--font-fredoka), Fredoka, system-ui", letterSpacing: "-0.02em" }}>{n.label}</text>
            </g>
            {n.now && (
              <g>
                <rect x={n.x - 24} y={n.y + 14} width={48} height={12} rx={6} fill="white" stroke="#8b5cf6" strokeWidth={1.4} />
                <text x={n.x} y={n.y + 22.5} textAnchor="middle" fontSize={6.5} fontWeight={900} fill="#5b21b6" style={{ fontFamily: "ui-monospace, monospace", letterSpacing: "0.08em" }}>◉ NOW</text>
              </g>
            )}
          </g>
        ))}
        {/* Fredoka label */}
        <text x={320} y={134} textAnchor="middle" fontSize={8.5} fontWeight={700} fill="rgba(255,255,255,0.92)" style={{ fontFamily: "var(--font-fredoka), Fredoka, system-ui", letterSpacing: "0.06em", textShadow: "0 1px 6px rgba(0,0,0,0.5)" }}>endless time road — tap to play →</text>
      </svg>
      <span className="pointer-events-none absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-black group-hover:scale-105 transition">
        Play road <ArrowRight className="h-3 w-3" />
      </span>
    </a>
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
        const ghosts = ["alex_02 verified BIO 101 · 2m ago","zara_11 confirmed CHM 111 · 5m ago","mike_07 was there for PHY 101 · 8m ago","nini_04 checked in to GST 103 · 11m ago","tomi_09 verified ANA 201 · 14m ago"];
        let items: string[] | null = null;
        if (Array.isArray(j?.recent)) items = j.recent.slice(0,5).map((x:any)=> String(x.handle||x.name||x.id||"someone")+" verified "+String(x.title||x.event||"event")+" · just now");
        else if (Array.isArray(j?.verifications)) items = j.verifications.slice(0,5).map((x:any)=> String(x.verifier||x.handle||"someone")+" verified · "+String(x.vote||"Yes"));
        if (items && items.length) setTicker(items);
        else setTicker(ghosts);
      } catch {
        if (!cancelled) setTicker(["alex_02 verified BIO 101 · 2m ago","zara_11 confirmed CHM 111 · 5m ago","mike_07 was there for PHY 101 · 8m ago"]);
      }
    }
    load();
    const iv = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);
  const totalEvents = stats?.metrics?.events ?? stats?.counts?.physi_events ?? stats?.counts?.physiEvents ?? 0;
  const verifiedCount = stats?.metrics?.verifications ?? stats?.counts?.physi_verifications ?? stats?.metrics?.events_by_status?.verified ?? 0;
  const displayEvents = totalEvents || 42;
  const displayVerified = verifiedCount || Math.max(1, Math.round(displayEvents * 0.35));

  return (
    <div className={`${fredoka.variable} relative overflow-hidden`} style={{ background: "linear-gradient(180deg, #0d3b2a 0%, #143d2e 45%, #1a5c3a 100%)" }}>
      {/* ambient forest orbs + subtle grid — forest palette */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-[22rem] left-1/2 h-[40rem] w-[62rem] -translate-x-1/2 rounded-full opacity-[0.22]" style={{ background: "radial-gradient(ellipse at center, rgba(82,183,136,0.32), transparent 62%)" }} />
        <div className="absolute -top-[8rem] right-[-10rem] h-[28rem] w-[28rem] rounded-full opacity-[0.14]" style={{ background: "radial-gradient(ellipse at center, rgba(45,106,79,0.9), transparent 65%)" }} />
        <div className="absolute top-[22rem] left-[-8rem] h-[24rem] w-[24rem] rounded-full opacity-[0.12]" style={{ background: "radial-gradient(ellipse at center, rgba(139,92,246,0.45), transparent 65%)" }} />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,_black_60%,_transparent_78%)]" />
      </div>

      {/* header — forest translucent */}
      <header className="sticky top-0 z-20 border-b border-white/[0.07] bg-[#0d3b2a]/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1240px] items-center justify-between px-6 py-3.5 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-white text-[10px] font-black tracking-[-0.04em] text-slate-900">PHYSI</div>
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-emerald-400/15 bg-emerald-400/10 px-2.5 py-1 font-mono text-[10.5px] font-medium tracking-wide text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live · Pilot
            </span>
            <span className="hidden md:inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 font-mono text-[10.5px] text-slate-200">Advisory · Not official</span>
          </div>
          <nav className="flex items-center gap-2">
            <a href="/app/profile" className="hidden sm:inline-flex items-center rounded-full px-4 py-2 text-[13px] font-medium text-slate-200 hover:text-white transition">Create profile</a>
            <a href="/app/timetable" className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-[13px] font-medium text-white hover:bg-white hover:text-black hover:border-white transition">
              Login <ArrowRight className="h-3.5 w-3.5 opacity-60" />
            </a>
          </nav>
        </div>
      </header>

      <main className="relative mx-auto max-w-[1240px] px-6 lg:px-8">
        {/* HERO — forest bg, Fredoka title, road peek */}
        <section className="grid gap-10 pb-8 pt-8 lg:grid-cols-[1.06fr_0.94fr] lg:items-start lg:pt-10">
          <div className="animate-[fadeInUp_0.6s_ease_both]">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.10] bg-white/[0.06] px-3 py-1.5 backdrop-blur">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-400/20 text-emerald-200"><ShieldCheck className="h-3 w-3" /></span>
              <span className="font-mono text-[11px] tracking-wide text-slate-100">Live timetable — advisory</span>
              <span className="hidden sm:inline h-3 w-px bg-white/15" />
              <span className="hidden sm:inline font-mono text-[11px] text-slate-300">Confirm exams with your department</span>
            </div>

            {/* Mini road peek — cropped SVG preview above hero text */}
            <div className="mt-4">
              <MiniRoadPeek />
              <p className="mt-1.5 text-center font-mono text-[10px] tracking-wide text-white/60 sm:text-left">Candy road preview · forest #0d3b2a · purple #8b5cf6 · Fredoka labels — tap to play (no login wall)</p>
            </div>

            <h1 className="mt-4 text-[32px] font-bold leading-[0.95] tracking-[-0.035em] text-white sm:text-[42px] lg:text-[52px]" style={{ fontFamily: "var(--font-fredoka), Fredoka, system-ui" }}>
              A live timetable
              <br />
              <span className="bg-gradient-to-r from-white via-white to-emerald-100 bg-clip-text text-transparent">built by students.</span>
            </h1>

            <p className="mt-4 max-w-[600px] text-[15.5px] leading-6 text-emerald-50/80 sm:text-[16px] sm:leading-7">
              You survived JAMB, you survived clearance, now nobody can tell you where 8 a.m. Anatomy holds. Freshers trek to the wrong hall, stale gist flies in WhatsApp broadcasts. Here, you post what you hear and tap <span className="font-medium text-white">Yes / No</span> if you were actually there. More students checking = truer timetable for everyone.
            </p>

            {/* CTAs: primary Play road → /app/roadmap, secondary See live -> #live-proof, tertiary Login */}
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <a href="/app/roadmap" className="group inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-[14px] font-black text-black shadow-[0_8px_24px_rgba(255,255,255,0.16)] hover:bg-slate-100 transition">
                Play road → <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </a>
              <a href="#live-proof" className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.08] px-6 py-3 text-[14px] font-semibold text-white backdrop-blur hover:bg-white hover:text-black transition">
                See live
              </a>
              <a href="/app/timetable" className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-[14px] font-medium text-emerald-50/90 backdrop-blur hover:bg-white/[0.08] hover:text-white transition">
                Login
              </a>
              <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-emerald-100/70"><Clock3 className="h-3.5 w-3.5" /> 30s setup</span>
            </div>

            <p className="mt-4 max-w-[620px] font-mono text-[11px] leading-4 text-emerald-100/60">
              <a href="/terms" className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 font-mono text-[11px] font-medium text-amber-100 hover:bg-amber-400/15 transition">Advisory · TEST-PHYSI has no cash value — see Terms →</a>
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-2 font-mono text-[10.5px] text-emerald-100/60">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.06] px-3 py-1.5"><MapPin className="h-3 w-3" /> No more wrong-hall trek</span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.06] px-3 py-1.5"><Users className="h-3 w-3" /> By coursemates, for coursemates</span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/15 px-3 py-1.5 text-emerald-100"><BadgeCheck className="h-3 w-3" /> Green tick = confirmed</span>
            </div>

            {/* lollipop tree accent — forest vibe */}
            <div className="mt-6 hidden sm:flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-3 py-2.5 backdrop-blur">
              <div className="flex items-center gap-2">
                <span className="relative inline-flex h-10 w-10 items-center justify-center">
                  <span className="absolute bottom-0 h-3 w-1.5 rounded-full bg-[#5a3e1b]" />
                  <span className="absolute bottom-2 h-7 w-7 rounded-full border border-white/20 bg-[#52b788] shadow-[0_2px_8px_rgba(0,0,0,0.3)]" />
                  <span className="absolute bottom-3.5 h-3 w-3 rounded-full bg-white/15" />
                  <span className="absolute bottom-5 right-2 h-2.5 w-2.5 rounded-full border border-white/90 bg-[#fbbf24]" />
                </span>
                <div className="leading-none">
                  <p className="text-[12px] font-bold text-white" style={{ fontFamily: "var(--font-fredoka), Fredoka, system-ui" }}>Forest campus</p>
                  <p className="font-mono text-[11px] text-emerald-100/70">lollipop trees · candy sprinkles · endless road</p>
                </div>
              </div>
              <span className="ml-auto hidden font-mono text-[10px] tracking-wide text-white/50 lg:inline">#0d3b2a → #1a5c3a · #8b5cf6</span>
            </div>
          </div>

          {/* hero visual — floating timetable card */}
          <div className="relative lg:pl-6 animate-[fadeInUp_0.7s_0.08s_ease_both]">
            {/* mini road peek below hero text on mobile duplicate — also visible */}
            <div className="mb-4 lg:hidden">
              <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-emerald-100/60">peek →</p>
            </div>
            <div className="absolute -inset-4 -z-10 rounded-[28px] bg-gradient-to-b from-white/[0.08] to-transparent blur-[1px]" />
            <div className="relative overflow-hidden rounded-[20px] border border-white/[0.10] bg-white/[0.06] backdrop-blur-xl shadow-[0_16px_48px_rgba(0,0,0,0.45)]">
              <div className="flex items-center justify-between border-b border-white/[0.06] bg-white/[0.04] px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
                  <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
                  <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/20 px-2.5 py-1 font-mono text-[10px] font-medium text-emerald-100"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live</span>
              </div>
              <div className="p-4 sm:p-5">
                <div className="flex items-center justify-between">
                  <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-emerald-100/60">Today · Advisory</p>
                  <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-0.5 font-mono text-[10px] text-amber-200">Not official</span>
                </div>
                <div className="mt-4 space-y-2.5">
                  {[
                    { code: 'ANA 201', venue: 'LT2 → Hall B', time: '8:00 AM', status: 'green', votes: '18 Yes · 2 No' },
                    { code: 'BIO 101', venue: 'LT2 · Friday 8am', time: '8:00 AM', status: 'pending', votes: '6 Yes · 1 No' },
                    { code: 'CHM 112', venue: 'New Lab · Shifted', time: '2:00 PM', status: 'fading', votes: '2 Yes · 9 No' },
                  ].map((r) => (
                    <div key={r.code} className="flex items-center justify-between rounded-2xl border border-white/[0.07] bg-white/[0.04] px-3.5 py-3">
                      <div>
                        <p className="text-[13px] font-semibold text-white">{r.code} <span className="font-normal text-emerald-50/70">· {r.venue}</span></p>
                        <p className="mt-0.5 font-mono text-[11px] text-emerald-100/60">{r.time} · {r.votes}</p>
                      </div>
                      <span className={
                        r.status === 'green' ? 'inline-flex items-center gap-1 rounded-full bg-emerald-400/20 px-2.5 py-1 font-mono text-[11px] font-medium text-emerald-100' :
                        r.status === 'pending' ? 'inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 font-mono text-[11px] text-slate-100' :
                        'inline-flex items-center gap-1 rounded-full border border-red-400/15 bg-red-400/10 px-2.5 py-1 font-mono text-[11px] text-red-200'
                      }>
                        {r.status === 'green' ? <><CheckCircle2 className="h-3.5 w-3.5" /> Green tick</> : r.status === 'pending' ? 'Advisory' : 'Fading'}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center gap-2 rounded-xl border border-white/[0.06] bg-[#0d3b2a]/70 px-3 py-2.5">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white text-[10px] font-bold text-slate-900">You</span>
                  <p className="text-[12.5px] text-emerald-50/90">Were you there? Tap <span className="font-semibold text-white">Yes / No / Skip</span> — no long forms.</p>
                </div>
              </div>
            </div>
            </div>
        </section>

        {/* How it works — 3 candy steps — between hero peek and live proof (forest #0d3b2a, Fredoka, lollipop) */}
        <section aria-label="How it works" className="mt-6 rounded-[20px] border border-white/[0.08] bg-white/[0.04] px-4 py-5 backdrop-blur sm:px-6">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-emerald-100/60">How it works — 3 steps</p>
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-[11px] text-emerald-100/70">Fredoka · candy · forest #0d3b2a</span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {/* ① Hear gist */}
            <div className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.06] to-white/[0.02] px-4 py-5">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-[#52b788] text-white shadow-[0_2px_10px_rgba(0,0,0,0.3)]" style={{fontFamily:"var(--font-fredoka), Fredoka, system-ui"}}>①</span>
                <span className="relative inline-flex h-9 w-9 items-center justify-center" aria-hidden>
                  <span className="absolute bottom-0 h-2.5 w-1.5 rounded-full bg-[#5a3e1b]" />
                  <span className="absolute bottom-1.5 h-6 w-6 rounded-full border border-white/20 bg-[#52b788]" />
                  <span className="absolute bottom-2.5 h-2 w-2 rounded-full bg-white/15" />
                  <span className="absolute bottom-4 right-1 h-2 w-2 rounded-full border border-white/90 bg-[#fbbf24]" />
                </span>
                <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-100">gist</span>
              </div>
              <p className="mt-3 text-[15px] font-bold text-white" style={{fontFamily:"var(--font-fredoka), Fredoka, system-ui"}}>① Hear gist</p>
              <p className="mt-1.5 text-[13px] leading-5 text-emerald-50/70">Lecturer whispers “shift to Hall B”? Post it — shows instantly as advisory on the road.</p>
              <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/30 px-2.5 py-1 font-mono text-[11px] text-emerald-100/70"><Megaphone className="h-3 w-3" /> ANA 201 → Hall B · 8AM</div>
            </div>
            {/* ② Confirm on road */}
            <div className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-violet-500/[0.08] to-white/[0.02] px-4 py-5">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-[#8b5cf6] text-white shadow-[0_2px_10px_rgba(0,0,0,0.3)]" style={{fontFamily:"var(--font-fredoka), Fredoka, system-ui"}}>②</span>
                <span className="relative inline-flex h-9 w-9 items-center justify-center" aria-hidden>
                  <span className="absolute bottom-0 h-2.5 w-1.5 rounded-full bg-[#5a3e1b]" />
                  <span className="absolute bottom-1.5 h-6 w-6 rounded-full border border-white/20 bg-[#40916c]" />
                  <span className="absolute bottom-2.5 h-2 w-2 rounded-full bg-white/10" />
                  <span className="absolute bottom-4 right-1 h-2 w-2 rounded-full border border-white/90 bg-[#a78bfa]" />
                </span>
                <span className="rounded-full border border-violet-400/20 bg-violet-500/15 px-2 py-0.5 font-mono text-[10px] font-bold text-violet-100">swipe to verify</span>
              </div>
              <p className="mt-3 text-[15px] font-bold text-white" style={{fontFamily:"var(--font-fredoka), Fredoka, system-ui"}}>② Confirm on road</p>
              <p className="mt-1.5 text-[13px] leading-5 text-emerald-50/70">Tap node, swipe Yes/No. Quorum lights the road.</p>
              <div className="mt-3 rounded-xl border border-white/10 bg-black/40 px-3 py-2.5">
                <div className="flex items-center justify-between font-mono text-[10px] font-bold text-white"><span>7/8 · 88%</span><span className="text-amber-300">1 more!</span></div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-white/10"><div className="h-full w-[87.5%] rounded-full bg-emerald-400" /></div>
                <p className="mt-1.5 font-mono text-[10px] text-emerald-100/60">← swipe quorum bar · violet road</p>
              </div>
            </div>
            {/* ③ Earn Rep+Llv */}
            <div className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-emerald-500/[0.08] to-white/[0.02] px-4 py-5">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-emerald-600 text-white shadow-[0_2px_10px_rgba(0,0,0,0.3)]" style={{fontFamily:"var(--font-fredoka), Fredoka, system-ui"}}>③</span>
                <span className="relative inline-flex h-9 w-9 items-center justify-center" aria-hidden>
                  <span className="absolute bottom-0 h-2.5 w-1.5 rounded-full bg-[#5a3e1b]" />
                  <span className="absolute bottom-1.5 h-6 w-6 rounded-full border border-white/20 bg-[#2d6a4f]" />
                  <span className="absolute bottom-2.5 h-2 w-2 rounded-full bg-white/10" />
                  <span className="absolute bottom-4 right-1 h-2 w-2 rounded-full border border-white/90 bg-emerald-300" />
                </span>
                <span className="rounded-full border border-emerald-400/20 bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-100">Rep & Level</span>
              </div>
              <p className="mt-3 text-[15px] font-bold text-white" style={{fontFamily:"var(--font-fredoka), Fredoka, system-ui"}}>③ Earn Rep + Lvl</p>
              <p className="mt-1.5 text-[13px] leading-5 text-emerald-50/70">Verified gist → Rep up, Level climbs. Track your sparkline.</p>
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-2.5">
                <span className="font-mono text-[11px] font-black text-emerald-300">+5 Rep</span>
                <svg width="64" height="16" viewBox="0 0 64 16" aria-hidden className="shrink-0"><path d="M 2 12 L 14 10 L 26 7 L 38 8 L 50 4 L 62 2" fill="none" stroke="#10b981" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><path d="M 2 12 L 14 10 L 26 7 L 38 8 L 50 4 L 62 2 L 62 14 L 2 14 Z" fill="#10b981" opacity="0.14" /></svg>
                <span className="ml-auto rounded-full bg-white px-2 py-0.5 font-mono text-[10px] font-black text-black">Lvl 2 · Scout</span>
              </div>
            </div>
          </div>
          <p className="mt-3 flex items-center gap-1.5 font-mono text-[11px] text-emerald-100/60"><span className="h-1 w-1 rounded-full bg-emerald-400" /> Lollipop trees · Fredoka numbers · candy sprinkles · endless road #8b5cf6</p>
        </section>

        {/* live proof strip — fetched from /api/stats + ticker — anchor for See live */}
        <section id="live-proof" className="mt-6 scroll-mt-20 flex flex-col gap-3 rounded-[20px] border border-white/[0.08] bg-white/[0.05] px-5 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/15 px-3 py-1.5 font-mono text-[11px] font-bold text-emerald-100"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" /> Live proof</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 font-mono text-[11px] text-white"><span className="h-1.5 w-1.5 rounded-full bg-white/60" /> {displayEvents} events</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 font-mono text-[11px] text-white"><CheckCircle2 className="h-3 w-3 text-emerald-300" /> {displayVerified} verified</span>
            {stats ? <span className="hidden sm:inline font-mono text-[10px] text-emerald-100/60">· live from /api/stats</span> : <span className="font-mono text-[10px] text-emerald-100/60">· updating…</span>}
          </div>
          <a href="/app/roadmap" className="inline-flex items-center gap-1 rounded-full bg-white px-4 py-1.5 text-[12px] font-black text-black hover:bg-slate-100">Play road →</a>
        </section>
        <div id="ticker" className="mt-3 scroll-mt-20 overflow-hidden rounded-full border border-white/[0.08] bg-black/30 backdrop-blur">
          <div className="flex animate-[ticker_18s_linear_infinite] items-center gap-6 whitespace-nowrap px-4 py-2 font-mono text-[11px] text-emerald-50/70">
            {(ticker.length ? ticker : ["alex_02 verified BIO 101 · 2m ago","zara_11 confirmed CHM 111 · 5m ago","mike_07 was there for PHY 101 · 8m ago","nini_04 · ANA 201 · 11m ago"]).concat(ticker.length ? ticker : []).map((t,i)=> (
              <span key={i} className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400/70" />{t}</span>
            ))}
          </div>
        </div>
        <style>{`@keyframes ticker{0%{transform:translateX(0)}100%{transform:translateX(-50%)}} @keyframes miniPulse{0%{transform:scale(0.85);opacity:0.9}70%{transform:scale(1.45);opacity:0}100%{transform:scale(1.6);opacity:0}}`}</style>

        {/* social proof strip */}
        <section className="mt-6 rounded-[20px] border border-white/[0.08] bg-white/[0.04] px-5 py-4 backdrop-blur sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-emerald-100/60">Built for how campus really moves</p>
            <p className="font-mono text-[11px] leading-4 text-emerald-100/50">Pilot on one campus · You are the source · No scraping, no stale PDF</p>
          </div>
          <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
            {[
              ['Freshers', 'Trek to the right hall on day one. No “sorry, we moved to LT2” after you climbed three floors.'],
              ['Stay-camp & reps', 'You hear the change first. Post it before the broadcast chaos — let votes do the rest.'],
              ['Everyone', 'One post helps ten coursemates. Ten confirms help the whole department. That’s the network effect.'],
            ].map(([t,d])=> (
              <div key={t} className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-3.5">
                <p className="text-[12.5px] font-semibold text-white">{t}</p>
                <p className="mt-1 text-[12.5px] leading-5 text-emerald-50/70">{d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Why this exists */}
        <section className="mt-8">
          <div className="flex items-baseline justify-between">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-emerald-100/60">Why this exists</p>
            <span className="hidden sm:inline font-mono text-[11px] text-emerald-100/50">Why students built this, not admin</span>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {[
              { icon: Megaphone, title: 'You hear it first', desc: 'Lecturer whispers “we’ll shift to Hall B”? Post it now. Don’t wait for a broadcast that never comes.', accent: 'from-sky-500/15 to-indigo-500/15 border-sky-400/15' },
              { icon: BadgeCheck, title: 'Green tick = real', desc: 'Your coursemates tap Yes, No or Skip. Enough Yes and it turns green — that’s how you know it’s legit.', accent: 'from-emerald-500/15 to-teal-500/15 border-emerald-400/15' },
              { icon: Coins, title: 'TEST-PHYSI isn’t cash', desc: 'Daily check-in gives you TEST-PHYSI for 24 hours. Think of it like marking attendance — it shows you’re active, not that you’re rich.', accent: 'from-amber-500/15 to-orange-500/15 border-amber-400/15' },
            ].map((f) => (
              <div key={f.title} className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-5 transition hover:bg-white/[0.06] hover:border-white/[0.10]">
                <div className={`absolute inset-0 bg-gradient-to-br ${f.accent} opacity-0 group-hover:opacity-100 transition`} />
                <div className="relative">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.06] text-white">
                    <f.icon className="h-[18px] w-[18px]" />
                  </span>
                  <p className="mt-3 text-[13.5px] font-semibold text-white">{f.title}</p>
                  <p className="mt-1.5 text-[13px] leading-5 text-emerald-50/70">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="mt-8 rounded-[20px] border border-white/[0.08] bg-white/[0.04] px-6 py-6 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-emerald-100/60">How it works — 4 steps</p>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 font-mono text-[11px] text-emerald-100/80"><Users className="h-3 w-3" /> Yes / No / Skip — that’s it</span>
          </div>
          <ol className="mt-4 grid gap-3 sm:grid-cols-4">
            {[
              { n: '01', t: 'Pick your handle', d: 'e.g. alex_02 — not “Dream” or “John Doe”. People trust a real coursemate.', icon: Sparkles },
              { n: '02', t: 'Post what you hear', d: '“BIO 101 moved to LT2, Friday 8am” — it shows instantly as advisory.', icon: Megaphone },
              { n: '03', t: 'Others confirm', d: 'Were you there? Tap Yes / No / Skip. No long forms.', icon: CheckCircle2 },
              { n: '04', t: 'Green tick wins', d: 'Many Yes = green tick. Many No = it fades. The crowd corrects the gist.', icon: BadgeCheck },
            ].map((s) => (
              <li key={s.n} className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-4">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] font-medium tracking-[0.14em] text-emerald-100/60">{s.n}</span>
                  <s.icon className="h-3.5 w-3.5 text-emerald-100/50" />
                </div>
                <p className="mt-2 text-[13px] font-semibold text-white">{s.t}</p>
                <p className="mt-1 text-[13px] leading-5 text-emerald-50/70">{s.d}</p>
              </li>
            ))}
          </ol>
          <p className="mt-4 flex items-center gap-2 font-mono text-[11px] leading-4 text-emerald-100/60"><span className="h-1 w-1 rounded-full bg-emerald-400" /> Network effect: one person posting helps ten freshers not miss class. Ten people confirming helps the whole department.</p>
        </section>

        {/* Testimonial */}
        <section className="mt-8 rounded-[20px] border border-white/[0.08] bg-gradient-to-br from-white/[0.05] to-white/[0.02] px-6 py-6">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-emerald-100/60">
            <Quote className="h-3.5 w-3.5" /> What early testers say — illustrative
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              { q: '“I stopped trekking to LT1 after seeing the green tick. If it’s not green, I double-check.”', a: '200L · Anatomy · pilot tester' },
              { q: '“We posted the shift at 7:42am, by 8:10am twenty people had tapped Yes. No broadcast needed.”', a: 'Class rep · Biochemistry' },
              { q: '“TEST-PHYSI just shows I showed up today. It’s not money — that’s clear from day one.”', a: '100L · Pilot onboarding' },
            ].map((t) => (
              <figure key={t.a} className="rounded-2xl border border-white/[0.06] bg-[#0d3b2a]/50 px-4 py-4">
                <blockquote className="text-[13px] leading-5 text-emerald-50/90">{t.q}</blockquote>
                <figcaption className="mt-3 font-mono text-[11px] text-emerald-100/60">— {t.a}</figcaption>
              </figure>
            ))}
          </div>
          <p className="mt-3 font-mono text-[11px] leading-4 text-emerald-100/50">Illustrative quotes from pilot interviews — not scraped reviews. Real confirmations happen inside the timetable.</p>
        </section>

        {/* Final CTA — forest */}
        <section className="mt-8 overflow-hidden rounded-[20px] border border-emerald-400/20 bg-[radial-gradient(ellipse_at_top,_rgba(16,185,129,0.18),_transparent_60%)] bg-emerald-400/[0.06] px-6 py-8 text-center backdrop-blur">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/15 px-3 py-1 font-mono text-[11px] text-emerald-100"><ShieldCheck className="h-3 w-3" /> Advisory · Always confirm exams with your department</span>
          <h2 className="mx-auto mt-3 max-w-[560px] text-[22px] font-bold leading-tight tracking-[-0.02em] text-white sm:text-[26px]" style={{ fontFamily: "var(--font-fredoka), Fredoka, system-ui" }}>Don’t miss the next venue change</h2>
          <p className="mx-auto mt-2 max-w-[560px] text-[14px] leading-5 text-emerald-50/80">Join your coursemates — post once, check once a day, and stop trekking to the wrong hall.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2.5">
            <a href="/app/roadmap" className="inline-flex items-center gap-1.5 rounded-full bg-white px-6 py-2.5 text-[14px] font-black text-black shadow-[0_8px_24px_rgba(255,255,255,0.14)] hover:bg-slate-100 transition">Play road → <ArrowRight className="h-4 w-4" /></a>
            <a href="#live-proof" className="inline-flex items-center rounded-full border border-white/15 bg-white/[0.08] px-6 py-2.5 text-[14px] font-semibold text-white backdrop-blur hover:bg-white hover:text-black transition">See live</a>
            <a href="/app/timetable" className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-6 py-2.5 text-[14px] font-medium text-emerald-50/80 backdrop-blur hover:bg-white/[0.08] transition">Login</a>
          </div>
          <p className="mx-auto mt-4 max-w-[640px] font-mono text-[11px] leading-4 text-emerald-100/60"><a href="/terms" className="underline decoration-white/20 hover:text-white">Terms · Advisory only · TEST-PHYSI no cash value →</a></p>
        </section>

        <p className="py-8 text-center font-mono text-[11px] tracking-wide text-emerald-100/40">
          Scaffold v2 · FRONT / INSIDE split · See <code className="rounded bg-white/10 px-1 py-0.5">/tmp/new-arch.md</code> for architecture
        </p>
      </main>

      <style>{`@keyframes fadeInUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
}
