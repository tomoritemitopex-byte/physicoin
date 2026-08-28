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
  // fallback level selection when no events
  const [activeLevel, setActiveLevel] = useState<number>(8);
  const [done, setDone] = useState<Set<number>>(new Set([1, 2, 3]));

  const fetchFeed = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/timetable?limit=100", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || j.ok === false) throw new Error(j.error || j.hint || "couldn't load timetable");
      const evs: EventRow[] = j.events ?? [];
      // sort chronologically ascending so road flows top->bottom by date
      evs.sort((a, b) => String(a.event_date).localeCompare(String(b.event_date)) || String(a.event_time).localeCompare(String(b.event_time)));
      setEvents(evs);
      if (evs.length && !selectedId) setSelectedId(evs[0].id);
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

  // dynamic nodes
  const nodes = useMemo(() => {
    if (!hasEvents) {
      // static 8 fallback exact positions from original
      return LEVELS.map((_, i) => {
        const base = [
          { x: 180, y: 84 },
          { x: 320, y: 148 },
          { x: 150, y: 218 },
          { x: 330, y: 286 },
          { x: 170, y: 358 },
          { x: 310, y: 430 },
          { x: 145, y: 502 },
          { x: 250, y: 585 },
        ];
        return base[i];
      });
    }
    const startY = 70;
    const stepY = 72;
    const leftX = 150;
    const rightX = 330;
    const midX = 240;
    return events.map((_, i) => {
      const y = startY + i * stepY;
      // alternate left/right, but keep middle for variety every 5th
      let x: number;
      if (events.length === 1) x = midX;
      else if (i % 2 === 0) x = leftX + (i % 4 === 0 ? 18 : 0);
      else x = rightX - (i % 4 === 1 ? 12 : 0);
      return { x, y };
    });
  }, [events, hasEvents]);

  const svgH = useMemo(() => {
    if (!hasEvents) return 680;
    return Math.max(420, nodes[nodes.length - 1].y + 90);
  }, [nodes, hasEvents]);

  const roadD = useMemo(() => {
    if (nodes.length === 0) return "";
    if (nodes.length === 1) return `M ${nodes[0].x} ${nodes[0].y} L ${nodes[0].x} ${nodes[0].y}`;
    let d = `M ${nodes[0].x} ${nodes[0].y}`;
    for (let i = 1; i < nodes.length; i++) {
      const a = nodes[i - 1];
      const b = nodes[i];
      const dx = b.x - a.x;
      // candy-curvy: control points offset horizontally to make S-curve
      const c1x = a.x + dx * 0.55 + (dx > 0 ? 60 : -60);
      const c1y = a.y + 28;
      const c2x = b.x - dx * 0.25 + (dx > 0 ? -40 : 40);
      const c2y = b.y - 22;
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

  // milestone markers: when hasEvents, sprinkle static level labels between clusters as faint diamonds
  const milestones = useMemo(() => {
    if (!hasEvents || events.length < 3) return [];
    // place 3 milestones roughly at 25/50/75% along road
    const picks = [LEVELS[1], LEVELS[3], LEVELS[6]]; // Hall Whisper, First Yes, Approaching Green
    return picks.map((lvl, idx) => {
      const frac = (idx + 1) / (picks.length + 1);
      const evIdx = Math.floor(frac * events.length);
      const n = nodes[Math.min(evIdx, nodes.length - 1)];
      // offset slightly to not overlap event node
      return { lvl, x: n.x > 240 ? n.x - 58 : n.x + 58, y: n.y + 18 };
    });
  }, [hasEvents, events.length, nodes]);

  return (
    <div className="space-y-4">
      <div>
        <p className="font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-slate-500">roadmap · timetable on the road</p>
        <h1 className="mt-1 text-[22px] font-bold tracking-[-0.025em] text-white sm:text-[26px]">Candy Crush road — your timetable, live</h1>
        <p className="mt-1 max-w-[640px] text-[13.5px] leading-5 text-slate-400">
          Real events live on the winding road. Each node is a real timetable post — <span className="text-emerald-300">emerald verified</span>, <span className="text-amber-300">amber advisory</span>,{" "}
          <span className="text-slate-300">slate fading</span>. Tap any node to vote{" "}
          <span className="text-slate-200">Yes / No / Skip</span> and push it toward green tick.
        </p>
      </div>

      {toast && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full bg-white px-4 py-2 text-[13px] font-medium text-[#070a12] shadow-xl">
          {toast}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[440px_1fr]">
        {/* winding path card */}
        <div className="relative overflow-hidden rounded-[20px] border border-white/[0.07] bg-[#0a0f1e] p-0">
          <div className="pointer-events-none absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
          <div className="relative">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="font-mono text-[11px] tracking-wide text-slate-500">
                {loading ? "LOADING ROAD…" : hasEvents ? `${events.length} LIVE NODES · TAP TO VOTE` : "8 LEVELS · TAP A LEVEL"}
              </span>
              <span className="rounded-full bg-white px-2.5 py-1 font-mono text-[11px] font-bold text-[#0a0f1e]">
                {hasEvents ? `${verifiedCount} ✓ / ${events.length}` : `${done.size}/8 touched`}
              </span>
            </div>

            <div className="relative mx-auto w-full max-w-[440px] overflow-auto">
              <svg viewBox={`0 0 500 ${svgH}`} className="h-auto w-full" style={{ minHeight: hasEvents ? Math.min(640, svgH) : 640, height: hasEvents ? svgH : 640 }} role="img" aria-label="candy crush winding road with timetable events">
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

                {/* road */}
                <path d={roadD} fill="none" stroke="#0f172a" strokeWidth={38} strokeLinecap="round" strokeLinejoin="round" opacity={0.95} />
                <path d={roadD} fill="none" stroke="url(#roadGrad)" strokeWidth={26} strokeLinecap="round" strokeLinejoin="round" />
                <path d={roadD} fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeDasharray="10 14" opacity={0.28} />
                <path d={roadD} fill="none" stroke="white" strokeWidth={1} opacity={0.06} />

                {/* milestone markers when live */}
                {milestones.map((m) => (
                  <g key={m.lvl.n} opacity={0.9}>
                    <rect x={m.x - 46} y={m.y - 10} width={92} height={20} rx={10} fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.10)" />
                    <text x={m.x} y={m.y + 4} textAnchor="middle" fontSize={8.5} fontWeight={700} fill="rgba(255,255,255,0.65)" style={{ fontFamily: "ui-monospace, monospace" }}>
                      ✦ {m.lvl.title}
                    </text>
                  </g>
                ))}

                {/* nodes */}
                {loading ? (
                  // skeleton nodes
                  Array.from({ length: 3 }).map((_, i) => (
                    <g key={i} opacity={0.35}>
                      <circle cx={i % 2 === 0 ? 170 : 320} cy={90 + i * 80} r={26} fill="rgba(255,255,255,0.08)" />
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
                    // color by status
                    const outerFill = isActive ? "white" : verified ? "#10b981" : isAdvisory ? "#f59e0b" : "#1e293b";
                    const outerStroke = isActive ? "white" : verified ? "#34d399" : isAdvisory ? "#fbbf24" : "rgba(255,255,255,0.14)";
                    const innerFill = isActive ? "#0a0f1e" : verified ? "#065f46" : isAdvisory ? "#451a03" : "#1e293b";
                    const label = ev.title.length > 18 ? ev.title.slice(0, 18) + "…" : ev.title;
                    const pillW = Math.max(96, Math.min(160, label.length * 7 + 28));
                    const leftSide = p.x < 240;
                    const pillX = leftSide ? p.x + 34 : p.x - pillW - 6;
                    return (
                      <g key={ev.id} onClick={() => setSelectedId(ev.id)} style={{ cursor: "pointer" }}>
                        {isActive && <circle cx={p.x} cy={p.y} r={42} fill="white" opacity={0.09} />}
                        <circle cx={p.x} cy={p.y + 4} r={26} fill="black" opacity={0.25} />
                        <circle cx={p.x} cy={p.y} r={26} fill={outerFill} stroke={outerStroke} strokeWidth={isActive ? 3 : 2.5} filter="url(#glow)" />
                        <circle cx={p.x} cy={p.y} r={19} fill={innerFill} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
                        <text x={p.x} y={p.y + 5} textAnchor="middle" fontSize={13} fontWeight={800} fill={isActive ? "white" : verified ? "#6ee7b7" : isAdvisory ? "#fef3c7" : "#cbd5e1"} style={{ fontFamily: "ui-monospace, monospace" }}>
                          {verified ? "✓" : isAdvisory ? "●" : "○"}
                        </text>
                        {/* pill with title */}
                        <g>
                          <rect x={pillX} y={p.y - 30} width={pillW} height={22} rx={11} fill={isActive ? "white" : "rgba(255,255,255,0.08)"} stroke={isActive ? "white" : "rgba(255,255,255,0.12)"} />
                          <text x={pillX + pillW / 2} y={p.y - 15} textAnchor="middle" fontSize={10} fontWeight={700} fill={isActive ? "#0a0f1e" : "white"}>
                            {label}
                          </text>
                        </g>
                        {/* venue/date pill below */}
                        <g>
                          <rect x={pillX} y={p.y + 18} width={pillW} height={16} rx={8} fill="rgba(15,23,42,0.92)" stroke="rgba(255,255,255,0.10)" />
                          <text x={pillX + pillW / 2} y={p.y + 28.5} textAnchor="middle" fontSize={8} fontWeight={600} fill="#94a3b8" style={{ fontFamily: "ui-monospace, monospace" }}>
                            {ev.venue.slice(0, 14)} · {fmtDate(ev.event_date)} {fmtTime(ev.event_time)}
                          </text>
                        </g>
                        {/* progress badge */}
                        {rp > 0 && !verified && (
                          <>
                            <circle cx={leftSide ? p.x + 28 : p.x - 28} cy={p.y - 18} r={9} fill="#0f172a" stroke="rgba(255,255,255,0.12)" />
                            <text x={leftSide ? p.x + 28 : p.x - 28} y={p.y - 14.5} textAnchor="middle" fontSize={7} fontWeight={800} fill="#fbbf24">
                              {pct}%
                            </text>
                          </>
                        )}
                      </g>
                    );
                  })
                ) : (
                  // static fallback
                  LEVELS.map((lvl, i) => {
                    const p = nodes[i];
                    const isActive = activeLevel === lvl.n;
                    const isDone = done.has(lvl.n);
                    const isLast = lvl.n === 8;
                    return (
                      <g key={lvl.n} onClick={() => setActiveLevel(lvl.n)} style={{ cursor: "pointer" }}>
                        {isActive && <circle cx={p.x} cy={p.y} r={42} fill="white" opacity={0.09} />}
                        <circle cx={p.x} cy={p.y + 4} r={isLast ? 30 : 26} fill="black" opacity={0.25} />
                        <circle cx={p.x} cy={p.y} r={isLast ? 30 : 26} fill={isActive ? "white" : isDone ? "#10b981" : "#0f172a"} stroke={isActive ? "white" : isDone ? "#34d399" : "rgba(255,255,255,0.18)"} strokeWidth={isActive ? 3 : 2.5} filter="url(#glow)" />
                        <circle cx={p.x} cy={p.y} r={isLast ? 22 : 19} fill={isDone && !isActive ? "#065f46" : isActive ? "#0a0f1e" : "#1e293b"} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
                        <text x={p.x} y={p.y + 5} textAnchor="middle" fontSize={isLast ? 15 : 13} fontWeight={800} fill={isActive ? "white" : isDone ? "#6ee7b7" : "#cbd5e1"} style={{ fontFamily: "ui-monospace, monospace" }}>
                          {isLast ? "✓" : isDone ? "✓" : lvl.n}
                        </text>
                        <g>
                          <rect x={p.x < 250 ? p.x + 34 : p.x - 134} y={p.y - 14} width={100} height={28} rx={14} fill={isActive ? "white" : "rgba(255,255,255,0.08)"} stroke={isActive ? "white" : "rgba(255,255,255,0.12)"} />
                          <text x={p.x < 250 ? p.x + 84 : p.x - 84} y={p.y + 4} textAnchor="middle" fontSize={10} fontWeight={700} fill={isActive ? "#0a0f1e" : "white"}>
                            {lvl.title}
                          </text>
                        </g>
                        <circle cx={p.x < 250 ? p.x + 28 : p.x - 28} cy={p.y - 18} r={9} fill={isActive ? "#0a0f1e" : "#334155"} />
                        <text x={p.x < 250 ? p.x + 28 : p.x - 28} y={p.y - 14} textAnchor="middle" fontSize={8} fontWeight={800} fill="white">
                          {lvl.n}
                        </text>
                      </g>
                    );
                  })
                )}
              </svg>
              <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-[#0f172a]/90 px-3 py-1 font-mono text-[10.5px] text-slate-400 backdrop-blur">
                {hasEvents ? "winding road · tap any event" : "winding road · tap any level"}
              </div>
            </div>
          </div>
        </div>

        {/* detail panel */}
        <div className="space-y-3">
          {err ? (
            <div className="rounded-[20px] border border-red-400/20 bg-red-400/10 p-5 text-center">
              <p className="text-[14px] font-medium text-red-200">road is down</p>
              <p className="mt-1 font-mono text-[12px] text-red-200/70">{err}</p>
              <button onClick={fetchFeed} className="mt-3 rounded-full bg-white px-4 py-1.5 text-[13px] font-semibold text-[#0a0f1e]">
                try again
              </button>
            </div>
          ) : loading ? (
            <div className="rounded-[20px] border border-white/[0.07] bg-white/[0.03] p-5">
              <div className="h-5 w-1/2 animate-pulse rounded bg-white/10" />
              <div className="mt-3 h-3 w-3/4 animate-pulse rounded bg-white/5" />
              <div className="mt-2 h-3 w-2/3 animate-pulse rounded bg-white/5" />
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
                <div className="rounded-[20px] border border-white/[0.07] bg-white/[0.03] p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className={`flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-black text-white shadow ${verified ? "bg-emerald-500" : isAdvisory ? "bg-amber-500" : "bg-slate-600"}`}>{verified ? "✓" : isAdvisory ? "●" : "○"}</span>
                      <div>
                        <h2 className="text-[16px] font-bold leading-tight text-white">{ev.title}</h2>
                        <p className="font-mono text-[11px] tracking-wide text-slate-500">
                          {ev.venue} · {fmtDate(ev.event_date)} {fmtTime(ev.event_time)} · {ev.scope_type}
                          {ev.scope_value ? ` · ${ev.scope_value}` : ""}
                        </p>
                      </div>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 font-mono text-[11px] font-bold ${verified ? "bg-emerald-500 text-white" : isAdvisory ? "border border-amber-400/20 bg-amber-400/10 text-amber-200" : "border border-white/10 bg-white/[0.04] text-slate-400"}`}>
                      {verified ? "✓ green tick" : isAdvisory ? "● advisory" : ev.status}
                    </span>
                  </div>
                  {rp > 0 && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between font-mono text-[11px] text-slate-500">
                        <span>{ap} / {rp} points</span>
                        <span className={verified ? "text-emerald-300" : "text-amber-300"}>{pct}% to green</span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10">
                        <div className={`h-full transition-all ${verified ? "bg-emerald-400" : "bg-amber-400"}`} style={{ width: `${pct}%` }} />
                      </div>
                      <p className="mt-1 font-mono text-[11px] text-slate-500">{verified ? "✓ confirmed — enough Yes to trust" : "needs more Yes taps to flip to green tick"}</p>
                    </div>
                  )}
                  {!rp && verified && <p className="mt-3 rounded-xl bg-emerald-500/10 px-3 py-2 text-[12.5px] text-emerald-200">Verified — coursemates confirmed this happened.</p>}
                  {!rp && !verified && isAdvisory && <p className="mt-3 rounded-xl bg-amber-500/10 px-3 py-2 text-[12.5px] text-amber-200">Advisory — fresh gist, waiting for confirmations.</p>}
                  <div className="mt-4">
                    <p className="font-mono text-[11px] uppercase tracking-wide text-slate-500">Were you there?</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button onClick={() => vote(ev.id, "YES")} disabled={!!voteBusy} className="rounded-full border border-emerald-500/30 bg-emerald-500/15 px-4 py-2 text-[13px] font-semibold text-emerald-300 hover:bg-emerald-500 hover:text-white hover:border-emerald-500 transition disabled:opacity-50">
                        {voteBusy === ev.id + "YES" ? "…" : "Yes ✓"}
                      </button>
                      <button onClick={() => vote(ev.id, "NO")} disabled={!!voteBusy} className="rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-[13px] font-medium text-slate-200 hover:bg-white hover:text-[#0a0f1e] transition disabled:opacity-50">
                        {voteBusy === ev.id + "NO" ? "…" : "No ✕"}
                      </button>
                      <button onClick={() => vote(ev.id, "CANCEL")} disabled={!!voteBusy} className="rounded-full border border-white/10 bg-white/[0.02] px-4 py-2 text-[13px] font-medium text-slate-400 hover:bg-white/[0.08] hover:text-white transition disabled:opacity-50">
                        {voteBusy === ev.id + "CANCEL" ? "…" : "Skip"}
                      </button>
                      <span className="font-mono text-[11px] text-slate-600">one tap · uses physi_profile</span>
                    </div>
                  </div>
                  <p className="mt-3 rounded-xl bg-white/[0.04] px-3 py-2 font-mono text-[11px] leading-4 text-slate-400">Votes add authority weight from your profile. Enough Yes flips this road node to emerald.</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button onClick={fetchFeed} className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[13px] font-medium text-slate-200 hover:bg-white/[0.08]">↻ refresh road</button>
                    <a href="/app/timetable" className="rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-[#0a0f1e]">Open timetable →</a>
                  </div>
                </div>
              );
            })()
          ) : (
            // static fallback detail
            <div className="rounded-[20px] border border-white/[0.07] bg-white/[0.03] p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-black text-white shadow" style={{ background: lvlActive.color }}>
                    {lvlActive.n === 8 ? "✓" : lvlActive.n}
                  </span>
                  <div>
                    <h2 className="text-[16px] font-bold leading-tight text-white">{lvlActive.title}</h2>
                    <p className="font-mono text-[11px] tracking-wide text-slate-500">{lvlActive.subtitle} · level {lvlActive.n} of 8</p>
                  </div>
                </div>
                <span className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 font-mono text-[11px] text-slate-300">{lvlActive.reward}</span>
              </div>
              <p className="mt-3 text-[14px] leading-6 text-slate-300">{lvlActive.blurb}</p>
              <p className="mt-3 rounded-xl bg-white/[0.04] px-3 py-2 font-mono text-[11px] leading-4 text-slate-400">
                {lvlActive.n <= 3 && "You post, it shows instantly — advisory. No waiting for admin approval."}
                {lvlActive.n === 4 && "One coursemate tapped Yes after being in that hall. That's the first real signal."}
                {lvlActive.n === 5 && "More taps = more trust. The levels where gist fights gist and truth wins."}
                {lvlActive.n === 6 && "Majority Yes. If you trekked yesterday to the wrong hall, this level is why you won't tomorrow."}
                {lvlActive.n === 7 && "So close — needs one or two more confirmations. Tell your group chat."}
                {lvlActive.n === 8 && "Green tick. Freshers check this and go to the right hall first time. You made the timetable honest."}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button onClick={() => toggleDone(lvlActive.n)} className={`rounded-full px-4 py-2 text-[13px] font-semibold transition ${done.has(lvlActive.n) ? "bg-emerald-500 text-white" : "bg-white text-[#0a0f1e] hover:bg-slate-100"}`}>
                  {done.has(lvlActive.n) ? "✓ touched" : "Mark as touched"}
                </button>
                <button onClick={() => setActiveLevel((n) => Math.min(8, n + 1))} className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[13px] font-medium text-slate-200 hover:bg-white/[0.08]">
                  Next → {Math.min(8, lvlActive.n + 1) === lvlActive.n ? "" : LEVELS.find((l) => l.n === lvlActive.n + 1)?.title}
                </button>
              </div>
              {!hasEvents && (
                <p className="mt-3 text-center font-mono text-[11px] text-slate-500">No live events yet — showing 8 roadmap milestones. Post in timetable to populate this road.</p>
              )}
            </div>
          )}

          {/* progress strip */}
          <div className="rounded-[20px] border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[11px] font-medium uppercase tracking-wide text-slate-500">{hasEvents ? "Road progress · verified vs advisory" : "Your walk"}</p>
              <p className="font-mono text-[11px] text-slate-500">{hasEvents ? `${verifiedCount} / ${events.length} verified` : `${done.size} / 8`}</p>
            </div>
            <div className="mt-3 flex gap-1.5">
              {hasEvents ? (
                events.map((ev) => {
                  const v = isVerified(ev);
                  const adv = ev.status === "pending" && !v;
                  return (
                    <button
                      key={ev.id}
                      onClick={() => setSelectedId(ev.id)}
                      className={`h-2 flex-1 rounded-full transition ${selectedId === ev.id ? "bg-white" : v ? "bg-emerald-400" : adv ? "bg-amber-400" : "bg-white/15"}`}
                      aria-label={`go to ${ev.title}`}
                    />
                  );
                })
              ) : (
                LEVELS.map((l) => (
                  <button
                    key={l.n}
                    onClick={() => setActiveLevel(l.n)}
                    className={`h-2 flex-1 rounded-full transition ${done.has(l.n) ? "bg-emerald-400" : activeLevel === l.n ? "bg-white" : "bg-white/15"}`}
                    aria-label={`go to ${l.title}`}
                  />
                ))
              )}
            </div>
            <div className={`mt-3 grid gap-2 ${hasEvents ? "grid-cols-3 sm:grid-cols-4" : "grid-cols-4 sm:grid-cols-8"}`}>
              {hasEvents ? (
                events.slice(0, 8).map((ev) => {
                  const v = isVerified(ev);
                  return (
                    <button
                      key={ev.id}
                      onClick={() => setSelectedId(ev.id)}
                      className={`truncate rounded-xl border px-2 py-2 text-center transition ${selectedId === ev.id ? "border-white bg-white text-[#0a0f1e]" : v ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : "border-white/10 bg-white/[0.03] text-slate-400 hover:text-white"}`}
                    >
                      <span className="block truncate text-[11px] font-medium leading-tight">{ev.title.slice(0, 12)}</span>
                      <span className="block font-mono text-[10px] opacity-70">{v ? "✓" : ev.status.slice(0, 6)}</span>
                    </button>
                  );
                })
              ) : (
                LEVELS.map((l) => (
                  <button
                    key={l.n}
                    onClick={() => setActiveLevel(l.n)}
                    className={`rounded-xl border px-2 py-2 text-center transition ${activeLevel === l.n ? "border-white bg-white text-[#0a0f1e]" : done.has(l.n) ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : "border-white/10 bg-white/[0.03] text-slate-400 hover:text-white"}`}
                  >
                    <span className="block font-mono text-[10px]">{l.n}</span>
                    <span className="block truncate text-[11px] font-medium leading-tight">{l.title.split(" ")[0]}</span>
                  </button>
                ))
              )}
            </div>
            {hasEvents && events.length > 8 && <p className="mt-2 text-center font-mono text-[11px] text-slate-500">+{events.length - 8} more events on the road — scroll the SVG to see all</p>}
          </div>

          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
            <p className="text-[13px] font-semibold text-white">How green tick really works</p>
            <p className="mt-1 text-[12.5px] leading-5 text-slate-400">
              Every post starts <span className="text-amber-200">advisory</span>. When coursemates tap Yes, they add authority points. Hit the required number and the row flips to{" "}
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[11px] font-bold text-white">✓ green</span>. No admin magic — just enough people saying &quot;I was there.&quot;
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a href="/app/timetable" className="rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-[#0a0f1e]">Open timetable →</a>
              <a href="/app/verify" className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[13px] font-medium text-slate-200">Go verify</a>
              <button onClick={fetchFeed} className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[13px] font-medium text-slate-400 hover:text-white">↻ refresh</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
