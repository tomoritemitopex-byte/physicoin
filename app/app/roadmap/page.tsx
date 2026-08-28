"use client";
import { useEffect, useState, useCallback, useMemo } from "react";

type EventRow = {
  id: string;
  title: string;
  venue: string;
  event_date: string;
  event_time: string;
  scope_type: string;
  scope_value: string | null;
  status: string;
  authority_points: number | string;
  required_points: number | string;
  created_at: string;
};

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
  { n: 3, title: "Posted", subtitle: "live on the feed", blurb: "It's on the timetable now — amber dot. Everyone can see your gist.", reward: "on feed", color: "#f59e0b" },
  { n: 4, title: "First Yes", subtitle: "someone was there", blurb: "One Yes lands. Not gist anymore — someone actually showed up and confirmed.", reward: "trust +1", color: "#34d399" },
  { n: 5, title: "Gathering Crowd", subtitle: "coursemates weigh in", blurb: "Yes and No taps pile up. The crowd is sorting truth from stale broadcast.", reward: "momentum", color: "#60a5fa" },
  { n: 6, title: "Cross-Checked", subtitle: "majority leans yes", blurb: "Most taps are Yes. Latecomers still trek to the wrong hall — this saves them.", reward: "almost green", color: "#38bdf8" },
  { n: 7, title: "Approaching Green", subtitle: "threshold near", blurb: "Authority points nearly there. One or two more Yes and it flips.", reward: "99% there", color: "#fbbf24" },
  { n: 8, title: "Verified Timetable", subtitle: "green tick ✓", blurb: "Green tick. Your gist is now the timetable freshers trust. You built that.", reward: "✓ canonical", color: "#10b981" },
];

function isVerified(ev: EventRow) {
  if (ev.status === "verified") return true;
  const ap = Number(ev.authority_points ?? 0);
  const rp = Number(ev.required_points ?? 0);
  return rp > 0 && ap >= rp;
}
function fmtDate(s: string) {
  if (!s) return "";
  try {
    const d = new Date(s);
    if (isNaN(d.getTime())) return String(s).slice(0, 10);
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  } catch {
    return String(s).slice(0, 10);
  }
}
function fmtTime(s: string) {
  return String(s ?? "").slice(0, 5);
}

export default function RoadmapPage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [voteBusy, setVoteBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [activeLevel, setActiveLevel] = useState<number>(8);
  const [done, setDone] = useState<Set<number>>(new Set([1, 2, 3]));
  const [sheetOpen, setSheetOpen] = useState(true);

  const fetchFeed = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/timetable?limit=100", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || j.ok === false) throw new Error(j.error || j.hint || "couldn't load timetable");
      const evs: EventRow[] = j.events ?? [];
      evs.sort((a, b) => String(a.event_date).localeCompare(String(b.event_date)) || String(a.event_time).localeCompare(String(b.event_time)));
      setEvents(evs);
      if (evs.length && !selectedId) {
        setSelectedId(evs[0].id);
        setSheetOpen(true);
      }
    } catch (e: any) {
      setErr(e.message || "feed failed");
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    fetchFeed();
  }, [fetchFeed]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const hasEvents = events.length > 0;
  const selectedEvent = useMemo(() => events.find((e) => e.id === selectedId) ?? null, [events, selectedId]);
  const verifiedCount = useMemo(() => events.filter(isVerified).length, [events]);
  const advisoryCount = useMemo(() => events.filter((e) => !isVerified(e) && e.status === "pending").length, [events]);

  const nodes = useMemo(() => {
    if (!hasEvents) {
      return [
        { x: 170, y: 110 },
        { x: 340, y: 200 },
        { x: 140, y: 290 },
        { x: 360, y: 390 },
        { x: 160, y: 490 },
        { x: 340, y: 590 },
        { x: 135, y: 690 },
        { x: 260, y: 790 },
      ];
    }
    const startY = 96;
    const stepY = 110;
    const leftX = 140;
    const rightX = 360;
    const midX = 250;
    return events.map((_, i) => {
      const y = startY + i * stepY;
      let x: number;
      if (events.length === 1) x = midX;
      else if (i % 2 === 0) x = leftX + (i % 4 === 0 ? 18 : 0);
      else x = rightX - (i % 4 === 1 ? 12 : 0);
      return { x, y };
    });
  }, [events, hasEvents]);

  const svgH = useMemo(() => {
    if (!hasEvents) return 900;
    return Math.max(560, nodes[nodes.length - 1].y + 120);
  }, [nodes, hasEvents]);

  const roadD = useMemo(() => {
    if (nodes.length === 0) return "";
    if (nodes.length === 1) return `M ${nodes[0].x} ${nodes[0].y} L ${nodes[0].x} ${nodes[0].y}`;
    let d = `M ${nodes[0].x} ${nodes[0].y}`;
    for (let i = 1; i < nodes.length; i++) {
      const a = nodes[i - 1];
      const b = nodes[i];
      const dx = b.x - a.x;
      const c1x = a.x + dx * 0.55 + (dx > 0 ? 70 : -70);
      const c1y = a.y + 36;
      const c2x = b.x - dx * 0.25 + (dx > 0 ? -44 : 44);
      const c2y = b.y - 28;
      d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${b.x} ${b.y}`;
    }
    return d;
  }, [nodes]);

  async function vote(id: string, v: "YES" | "NO" | "CANCEL") {
    let verifierId: string | null = null;
    try {
      const raw = localStorage.getItem("physi_profile");
      if (raw) verifierId = JSON.parse(raw)?.id ?? null;
    } catch {}
    if (!verifierId) {
      setToast("create a profile first — we need your handle to count the vote");
      return;
    }
    setVoteBusy(id + v);
    try {
      const r = await fetch("/api/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ verifier_id: verifierId, event_id: id, vote: v }),
      });
      const j = await r.json();
      if (!r.ok || j.ok === false) throw new Error(j.error || "vote failed");
      setToast(v === "YES" ? "you said you were there — thanks!" : v === "NO" ? "marked as not there" : "skipped — all good");
      fetchFeed();
    } catch (e: any) {
      setToast(e.message);
    } finally {
      setVoteBusy(null);
    }
  }

  function toggleDone(n: number) {
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  }

  const lvlActive = LEVELS.find((l) => l.n === activeLevel) ?? LEVELS[0];

  const milestones = useMemo(() => {
    if (!hasEvents || events.length < 3) return [];
    const picks = [LEVELS[1], LEVELS[3], LEVELS[6]];
    return picks.map((lvl, idx) => {
      const frac = (idx + 1) / (picks.length + 1);
      const evIdx = Math.floor(frac * events.length);
      const n = nodes[Math.min(evIdx, nodes.length - 1)];
      return { lvl, x: n.x > 250 ? n.x - 72 : n.x + 72, y: n.y + 22 };
    });
  }, [hasEvents, events.length, nodes]);

  // pill size helpers for immersive
  const handleSelectEvent = (id: string) => {
    setSelectedId(id);
    setSheetOpen(true);
  };
  const handleSelectLevel = (n: number) => {
    setActiveLevel(n);
    setSheetOpen(true);
  };

  return (
    <div className="relative -mx-4 -mt-5 w-[100vw] max-w-[100vw] sm:-mx-6 lg:-mx-8">
      {/* full-bleed candy map */}
      <div className="relative min-h-[calc(100vh-64px)] w-full overflow-hidden bg-[#070a12]">
        {/* subtle grid + ambient */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-[#070a12]" />
          <div className="absolute -top-[18vh] left-1/2 h-[52vh] w-[120vw] -translate-x-1/2 rounded-[100%] bg-white/[0.03] blur-[70px]" />
          <div className="absolute top-[22vh] left-[6%] h-72 w-72 rounded-full bg-emerald-500/10 blur-[90px]" />
          <div className="absolute top-[55vh] right-[8%] h-80 w-80 rounded-full bg-indigo-500/10 blur-[90px]" />
          <div className="absolute inset-0 opacity-[0.035]" style={{ backgroundImage: "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
        </div>

        {/* floating top bar */}
        <div className="pointer-events-none absolute left-0 right-0 top-0 z-20 flex justify-center px-3 pt-3 sm:px-6">
          <div className="pointer-events-auto flex w-full max-w-[860px] items-center justify-between gap-2 rounded-full border border-white/[0.08] bg-[#0f172a]/85 px-3 py-2 shadow-[0_8px_32px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl sm:px-4 sm:py-2.5">
            <div className="flex items-center gap-2">
              <span className="hidden h-7 w-7 items-center justify-center rounded-full bg-white text-[11px] font-black text-[#070a12] sm:flex">◉</span>
              <div>
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 sm:text-[11px]">timetable on the road</p>
                <p className="hidden text-[12px] font-semibold leading-none text-white sm:block">{loading ? "Loading live road…" : hasEvents ? `${events.length} live nodes · tap any candy` : "8 levels · tap a candy"}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold sm:px-3 sm:py-1.5 sm:text-xs ${verifiedCount > 0 ? "bg-emerald-500 text-white" : "bg-white/10 text-slate-300"}`}>
                <span className="h-1.5 w-1.5 rounded-full bg-white/80" /> {verifiedCount} ✓
              </span>
              <span className="inline-flex items-center rounded-full bg-amber-500 px-2.5 py-1 text-[11px] font-bold text-white sm:px-3 sm:py-1.5 sm:text-xs">{advisoryCount} ●</span>
              <span className="hidden items-center rounded-full bg-white px-3 py-1.5 text-xs font-bold text-[#070a12] sm:inline-flex">{hasEvents ? `${verifiedCount}/${events.length}` : `${done.size}/8`}</span>
              <button onClick={fetchFeed} className="ml-1 hidden rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-white hover:text-[#070a12] transition sm:inline-flex">↻ refresh</button>
            </div>
          </div>
        </div>
        {/* mobile compact title under floating bar */}
        <p className="absolute left-1/2 top-[62px] z-10 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/10 bg-[#0f172a]/80 px-3 py-1 font-mono text-[10px] tracking-wide text-slate-400 backdrop-blur sm:hidden">
          {loading ? "LOADING ROAD…" : hasEvents ? `${events.length} LIVE · TAP TO VOTE` : "8 LEVELS · TAP A LEVEL"}
        </p>

        {toast && (
          <div className="fixed bottom-28 left-1/2 z-50 -translate-x-1/2 rounded-full bg-white px-5 py-2.5 text-[13px] font-medium text-[#070a12] shadow-xl">
            {toast}
          </div>
        )}

        {/* centered scroll road */}
        <div className="relative mx-auto flex min-h-[calc(100vh-64px)] w-full max-w-[560px] justify-center overflow-auto pb-[320px] pt-[86px] sm:pb-[340px] sm:pt-[76px] scrollbar-thin">
          {/* halo glow behind road */}
          <div className="pointer-events-none absolute left-1/2 top-[90px] h-[86%] w-[78%] -translate-x-1/2 rounded-[40px] bg-white/[0.02] blur-[18px]" />
          <svg viewBox={`0 0 520 ${svgH}`} className="relative h-auto w-full shrink-0" style={{ minHeight: hasEvents ? Math.min(840, svgH) : 880, height: svgH }} role="img" aria-label="candy crush winding road with timetable events">
            <defs>
              <linearGradient id="roadGrad2" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#1e293b" />
                <stop offset="50%" stopColor="#334155" />
                <stop offset="100%" stopColor="#1e293b" />
              </linearGradient>
              <filter id="glow2">
                <feDropShadow dx="0" dy="3" stdDeviation="8" floodColor="rgba(255,255,255,0.14)" />
              </filter>
            </defs>

            {/* road thicker for immersive */}
            <path d={roadD} fill="none" stroke="#0f172a" strokeWidth={46} strokeLinecap="round" strokeLinejoin="round" opacity={0.98} />
            <path d={roadD} fill="none" stroke="url(#roadGrad2)" strokeWidth={32} strokeLinecap="round" strokeLinejoin="round" />
            <path d={roadD} fill="none" stroke="white" strokeWidth={2.2} strokeLinecap="round" strokeDasharray="12 16" opacity={0.32} />
            <path d={roadD} fill="none" stroke="white" strokeWidth={1} opacity={0.07} />

            {milestones.map((m) => (
              <g key={m.lvl.n} opacity={0.92}>
                <rect x={m.x - 54} y={m.y - 12} width={108} height={24} rx={12} fill="rgba(255,255,255,0.07)" stroke="rgba(255,255,255,0.11)" />
                <text x={m.x} y={m.y + 5} textAnchor="middle" fontSize={9.5} fontWeight={700} fill="rgba(255,255,255,0.72)" style={{ fontFamily: "ui-monospace, monospace" }}>
                  ✦ {m.lvl.title}
                </text>
              </g>
            ))}

            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <g key={i} opacity={0.35}>
                  <circle cx={i % 2 === 0 ? 160 : 360} cy={120 + i * 110} r={34} fill="rgba(255,255,255,0.09)" />
                </g>
              ))
            ) : hasEvents ? (
              events.map((ev, i) => {
                const p = nodes[i];
                const verified = isVerified(ev);
                const isAdvisory = ev.status === "pending" && !verified;
                const isActive = selectedId === ev.id;
                const ap = Number(ev.authority_points ?? 0);
                const rp = Number(ev.required_points ?? 0);
                const pct = rp > 0 ? Math.min(100, Math.round((ap / rp) * 100)) : verified ? 100 : 0;
                const outerFill = isActive ? "white" : verified ? "#10b981" : isAdvisory ? "#f59e0b" : "#1e293b";
                const outerStroke = isActive ? "white" : verified ? "#34d399" : isAdvisory ? "#fbbf24" : "rgba(255,255,255,0.16)";
                const innerFill = isActive ? "#0a0f1e" : verified ? "#065f46" : isAdvisory ? "#451a03" : "#1e293b";
                const label = ev.title.length > 20 ? ev.title.slice(0, 20) + "…" : ev.title;
                const pillW = Math.max(128, Math.min(190, label.length * 7.2 + 36));
                const leftSide = p.x < 260;
                const pillX = leftSide ? p.x + 42 : p.x - pillW - 10;
                return (
                  <g key={ev.id} onClick={() => handleSelectEvent(ev.id)} style={{ cursor: "pointer" }}>
                    {isActive && <circle cx={p.x} cy={p.y} r={52} fill="white" opacity={0.10} />}
                    <circle cx={p.x} cy={p.y + 5} r={34} fill="black" opacity={0.28} />
                    <circle cx={p.x} cy={p.y} r={34} fill={outerFill} stroke={outerStroke} strokeWidth={isActive ? 3.5 : 2.8} filter="url(#glow2)" />
                    <circle cx={p.x} cy={p.y} r={24} fill={innerFill} stroke="rgba(255,255,255,0.09)" strokeWidth={1} />
                    <text x={p.x} y={p.y + 6} textAnchor="middle" fontSize={16} fontWeight={800} fill={isActive ? "white" : verified ? "#6ee7b7" : isAdvisory ? "#fef3c7" : "#cbd5e1"} style={{ fontFamily: "ui-monospace, monospace" }}>
                      {verified ? "✓" : isAdvisory ? "●" : "○"}
                    </text>
                    <g>
                      <rect x={pillX} y={p.y - 36} width={pillW} height={28} rx={14} fill={isActive ? "white" : "rgba(255,255,255,0.09)"} stroke={isActive ? "white" : "rgba(255,255,255,0.14)"} />
                      <text x={pillX + pillW / 2} y={p.y - 17} textAnchor="middle" fontSize={11.5} fontWeight={750} fill={isActive ? "#0a0f1e" : "white"}>
                        {label}
                      </text>
                    </g>
                    <g>
                      <rect x={pillX} y={p.y + 22} width={pillW} height={18} rx={9} fill="rgba(15,23,42,0.94)" stroke="rgba(255,255,255,0.10)" />
                      <text x={pillX + pillW / 2} y={p.y + 33.5} textAnchor="middle" fontSize={8.5} fontWeight={600} fill="#94a3b8" style={{ fontFamily: "ui-monospace, monospace" }}>
                        {ev.venue.slice(0, 16)} · {fmtDate(ev.event_date)} {fmtTime(ev.event_time)}
                      </text>
                    </g>
                    {rp > 0 && !verified && (
                      <>
                        <circle cx={leftSide ? p.x + 36 : p.x - 36} cy={p.y - 22} r={11} fill="#0f172a" stroke="rgba(255,255,255,0.14)" />
                        <text x={leftSide ? p.x + 36 : p.x - 36} y={p.y - 17.5} textAnchor="middle" fontSize={7.5} fontWeight={800} fill="#fbbf24">
                          {pct}%
                        </text>
                      </>
                    )}
                  </g>
                );
              })
            ) : (
              LEVELS.map((lvl, i) => {
                const p = nodes[i];
                const isActive = activeLevel === lvl.n;
                const isDone = done.has(lvl.n);
                const isLast = lvl.n === 8;
                return (
                  <g key={lvl.n} onClick={() => handleSelectLevel(lvl.n)} style={{ cursor: "pointer" }}>
                    {isActive && <circle cx={p.x} cy={p.y} r={52} fill="white" opacity={0.10} />}
                    <circle cx={p.x} cy={p.y + 5} r={isLast ? 38 : 34} fill="black" opacity={0.28} />
                    <circle cx={p.x} cy={p.y} r={isLast ? 38 : 34} fill={isActive ? "white" : isDone ? "#10b981" : "#0f172a"} stroke={isActive ? "white" : isDone ? "#34d399" : "rgba(255,255,255,0.20)"} strokeWidth={isActive ? 3.5 : 2.8} filter="url(#glow2)" />
                    <circle cx={p.x} cy={p.y} r={isLast ? 27 : 24} fill={isDone && !isActive ? "#065f46" : isActive ? "#0a0f1e" : "#1e293b"} stroke="rgba(255,255,255,0.09)" strokeWidth={1} />
                    <text x={p.x} y={p.y + 6} textAnchor="middle" fontSize={isLast ? 18 : 15} fontWeight={800} fill={isActive ? "white" : isDone ? "#6ee7b7" : "#cbd5e1"} style={{ fontFamily: "ui-monospace, monospace" }}>
                      {isLast ? "✓" : isDone ? "✓" : lvl.n}
                    </text>
                    <g>
                      <rect x={p.x < 260 ? p.x + 42 : p.x - 148} y={p.y - 16} width={118} height={30} rx={15} fill={isActive ? "white" : "rgba(255,255,255,0.09)"} stroke={isActive ? "white" : "rgba(255,255,255,0.14)"} />
                      <text x={p.x < 260 ? p.x + 101 : p.x - 89} y={p.y + 4} textAnchor="middle" fontSize={11.5} fontWeight={700} fill={isActive ? "#0a0f1e" : "white"}>
                        {lvl.title}
                      </text>
                    </g>
                    <circle cx={p.x < 260 ? p.x + 36 : p.x - 36} cy={p.y - 24} r={11} fill={isActive ? "#0a0f1e" : "#334155"} />
                    <text x={p.x < 260 ? p.x + 36 : p.x - 36} y={p.y - 19.5} textAnchor="middle" fontSize={8.5} fontWeight={800} fill="white">
                      {lvl.n}
                    </text>
                  </g>
                );
              })
            )}
          </svg>
        </div>

        {/* bottom sheet overlay */}
        <div className={`absolute inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-3 sm:px-6 sm:pb-4 transition-transform duration-300 ${sheetOpen ? "translate-y-0" : "translate-y-[calc(100%-44px)]"}`}>
          <div className="w-full max-w-[680px] overflow-hidden rounded-[24px] border border-white/[0.08] bg-[#0f1629]/95 shadow-[0_16px_64px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl">
            {/* handle bar */}
            <button
              onClick={() => setSheetOpen((v) => !v)}
              className="flex w-full items-center justify-center gap-2 border-b border-white/[0.06] bg-white/[0.02] py-2.5"
              aria-label={sheetOpen ? "collapse details" : "expand details"}
            >
              <span className="h-1.5 w-9 rounded-full bg-white/20" />
              <span className="font-mono text-[10.5px] tracking-wide text-slate-400">{sheetOpen ? "tap to collapse" : "tap to expand · details"}</span>
              <span className="text-slate-500 text-xs">{sheetOpen ? "⌄" : "⌃"}</span>
            </button>

            <div className="max-h-[58vh] overflow-auto p-4 sm:p-5">
              {err ? (
                <div className="rounded-2xl border border-red-400/20 bg-red-400/10 p-5 text-center">
                  <p className="text-[14px] font-medium text-red-200">road is down</p>
                  <p className="mt-1 font-mono text-[12px] text-red-200/70">{err}</p>
                  <button onClick={fetchFeed} className="mt-3 rounded-full bg-white px-4 py-1.5 text-[13px] font-semibold text-[#0a0f1e]">try again</button>
                </div>
              ) : loading ? (
                <div className="space-y-3">
                  <div className="h-5 w-1/2 animate-pulse rounded bg-white/10" />
                  <div className="h-3 w-3/4 animate-pulse rounded bg-white/5" />
                  <div className="h-3 w-2/3 animate-pulse rounded bg-white/5" />
                </div>
              ) : hasEvents && selectedEvent ? (
                (() => {
                  const ev = selectedEvent;
                  const verified = isVerified(ev);
                  const isAdvisory = ev.status === "pending" && !verified;
                  const ap = Number(ev.authority_points ?? 0);
                  const rp = Number(ev.required_points ?? 0);
                  const pct = rp > 0 ? Math.min(100, Math.round((ap / rp) * 100)) : verified ? 100 : 0;
                  return (
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[15px] font-black text-white shadow ${verified ? "bg-emerald-500" : isAdvisory ? "bg-amber-500" : "bg-slate-600"}`}>{verified ? "✓" : isAdvisory ? "●" : "○"}</span>
                          <div>
                            <h2 className="text-[17px] font-bold leading-tight text-white">{ev.title}</h2>
                            <p className="font-mono text-[11px] tracking-wide text-slate-500">
                              {ev.venue} · {fmtDate(ev.event_date)} {fmtTime(ev.event_time)} · {ev.scope_type}
                              {ev.scope_value ? ` · ${ev.scope_value}` : ""}
                            </p>
                          </div>
                        </div>
                        <span className={`shrink-0 rounded-full px-3 py-1.5 font-mono text-[11px] font-bold ${verified ? "bg-emerald-500 text-white" : isAdvisory ? "border border-amber-400/20 bg-amber-400/10 text-amber-200" : "border border-white/10 bg-white/[0.04] text-slate-400"}`}>
                          {verified ? "✓ green tick" : isAdvisory ? "● advisory" : ev.status}
                        </span>
                      </div>
                      {rp > 0 && (
                        <div className="mt-4">
                          <div className="flex items-center justify-between font-mono text-[11px] text-slate-500">
                            <span>{ap} / {rp} points</span>
                            <span className={verified ? "text-emerald-300" : "text-amber-300"}>{pct}% to green</span>
                          </div>
                          <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-white/10">
                            <div className={`h-full transition-all ${verified ? "bg-emerald-400" : "bg-amber-400"}`} style={{ width: `${pct}%` }} />
                          </div>
                          <p className="mt-1.5 font-mono text-[11px] text-slate-500">{verified ? "✓ confirmed — enough Yes to trust" : "needs more Yes taps to flip to green tick"}</p>
                        </div>
                      )}
                      {!rp && verified && <p className="mt-4 rounded-xl bg-emerald-500/10 px-3 py-2.5 text-[12.5px] text-emerald-200">Verified — coursemates confirmed this happened.</p>}
                      {!rp && !verified && isAdvisory && <p className="mt-4 rounded-xl bg-amber-500/10 px-3 py-2.5 text-[12.5px] text-amber-200">Advisory — fresh gist, waiting for confirmations.</p>}
                      <div className="mt-4">
                        <p className="font-mono text-[11px] uppercase tracking-wide text-slate-500">Were you there?</p>
                        <div className="mt-2.5 flex flex-wrap items-center gap-2">
                          <button onClick={() => vote(ev.id, "YES")} disabled={!!voteBusy} className="rounded-full border border-emerald-500/30 bg-emerald-500/15 px-5 py-2.5 text-[13.5px] font-semibold text-emerald-300 hover:bg-emerald-500 hover:text-white hover:border-emerald-500 transition disabled:opacity-50">
                            {voteBusy === ev.id + "YES" ? "…" : "Yes ✓"}
                          </button>
                          <button onClick={() => vote(ev.id, "NO")} disabled={!!voteBusy} className="rounded-full border border-white/10 bg-white/[0.05] px-5 py-2.5 text-[13.5px] font-medium text-slate-200 hover:bg-white hover:text-[#0a0f1e] transition disabled:opacity-50">
                            {voteBusy === ev.id + "NO" ? "…" : "No ✕"}
                          </button>
                          <button onClick={() => vote(ev.id, "CANCEL")} disabled={!!voteBusy} className="rounded-full border border-white/10 bg-white/[0.02] px-5 py-2.5 text-[13.5px] font-medium text-slate-400 hover:bg-white/[0.08] hover:text-white transition disabled:opacity-50">
                            {voteBusy === ev.id + "CANCEL" ? "…" : "Skip"}
                          </button>
                          <span className="font-mono text-[11px] text-slate-600">uses physi_profile</span>
                        </div>
                      </div>
                      <p className="mt-3 rounded-xl bg-white/[0.04] px-3 py-2 font-mono text-[11px] leading-4 text-slate-400">Votes add authority weight from your profile. Enough Yes flips this road node to emerald.</p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button onClick={fetchFeed} className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[13px] font-medium text-slate-200 hover:bg-white/[0.08]">↻ refresh road</button>
                        <a href="/app/timetable" className="rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-[#0a0f1e]">Open timetable →</a>
                      </div>
                      {/* chip scrub */}
                      <div className="mt-4 flex gap-1.5 overflow-auto pb-1">
                        {events.slice(0, 12).map((e) => {
                          const v = isVerified(e);
                          const adv = e.status === "pending" && !v;
                          return (
                            <button
                              key={e.id}
                              onClick={() => handleSelectEvent(e.id)}
                              className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-medium transition ${selectedId === e.id ? "border-white bg-white text-[#0a0f1e]" : v ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : adv ? "border-amber-400/30 bg-amber-500/10 text-amber-200" : "border-white/10 bg-white/[0.03] text-slate-400"}`}
                            >
                              {e.title.slice(0, 14)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full text-[14px] font-black text-white shadow" style={{ background: lvlActive.color }}>
                        {lvlActive.n === 8 ? "✓" : lvlActive.n}
                      </span>
                      <div>
                        <h2 className="text-[17px] font-bold leading-tight text-white">{lvlActive.title}</h2>
                        <p className="font-mono text-[11px] tracking-wide text-slate-500">{lvlActive.subtitle} · level {lvlActive.n} of 8</p>
                      </div>
                    </div>
                    <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 font-mono text-[11px] text-slate-300">{lvlActive.reward}</span>
                  </div>
                  <p className="mt-3 text-[14px] leading-6 text-slate-300">{lvlActive.blurb}</p>
                  <p className="mt-3 rounded-xl bg-white/[0.04] px-3 py-2.5 font-mono text-[11px] leading-4 text-slate-400">
                    {lvlActive.n <= 3 && "You post, it shows instantly — advisory. No waiting for admin approval."}
                    {lvlActive.n === 4 && "One coursemate tapped Yes after being in that hall. That's the first real signal."}
                    {lvlActive.n === 5 && "More taps = more trust. The levels where gist fights gist and truth wins."}
                    {lvlActive.n === 6 && "Majority Yes. If you trekked yesterday to the wrong hall, this level is why you won't tomorrow."}
                    {lvlActive.n === 7 && "So close — needs one or two more confirmations. Tell your group chat."}
                    {lvlActive.n === 8 && "Green tick. Freshers check this and go to the right hall first time. You made the timetable honest."}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button onClick={() => toggleDone(lvlActive.n)} className={`rounded-full px-5 py-2.5 text-[13.5px] font-semibold transition ${done.has(lvlActive.n) ? "bg-emerald-500 text-white" : "bg-white text-[#0a0f1e] hover:bg-slate-100"}`}>
                      {done.has(lvlActive.n) ? "✓ touched" : "Mark as touched"}
                    </button>
                    <button onClick={() => setActiveLevel((n) => Math.min(8, n + 1))} className="rounded-full border border-white/10 bg-white/[0.04] px-5 py-2.5 text-[13px] font-medium text-slate-200 hover:bg-white/[0.08]">
                      Next → {Math.min(8, lvlActive.n + 1) === lvlActive.n ? "" : LEVELS.find((l) => l.n === lvlActive.n + 1)?.title}
                    </button>
                  </div>
                  <div className="mt-4 flex gap-1.5">
                    {LEVELS.map((l) => (
                      <button key={l.n} onClick={() => handleSelectLevel(l.n)} className={`h-2 flex-1 rounded-full transition ${done.has(l.n) ? "bg-emerald-400" : activeLevel === l.n ? "bg-white" : "bg-white/15"}`} aria-label={`go to ${l.title}`} />
                    ))}
                  </div>
                  <p className="mt-3 text-center font-mono text-[11px] text-slate-500">No live events yet — showing 8 roadmap milestones. Post in timetable to populate this road.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
