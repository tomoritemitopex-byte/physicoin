"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const programmeOptions = [
  "Audiology",
  "Biochemistry",
  "Biotechnology & Molecular Biology",
  "Doctor of Physiotherapy",
  "Environmental Health Science",
  "Information Technology & Health Informatics",
  "Medical Laboratory Science",
  "Medicine and Surgery (MBBS)",
  "Microbiology",
  "Nursing Science",
  "Nutrition & Dietetics",
  "Pharmacology",
  "Prosthetics & Orthotics",
];

const levelOptions = ["100L", "200L", "300L", "400L", "500L", "600L"];

const scopeOptions = [
  { value: "personal", label: "Personal — only you" },
  { value: "programme", label: "Programme — e.g. Nursing Science" },
  { value: "level", label: "Level — e.g. 300L" },
  { value: "faculty", label: "Faculty — FUHSI-wide" },
  { value: "university", label: "University — FUHSI canonical" },
  { value: "global", label: "Global — cross-campus canonical" },
];

type PhysiEvent = {
  id: string;
  title: string;
  venue: string;
  event_date: string;
  event_time: string;
  scope_type: string;
  scope_value: string | null;
  status: string;
  authority_points: string | number;
  required_points: string | number;
  created_by: string | null;
  created_by_nickname?: string | null;
  created_at: string;
};

const roadmapSteps = [
  { n: "01", label: "Idea pitched", desc: "Student proposes campus event", color: "from-amber-400 to-orange-500", ring: "ring-amber-400", dot: "bg-amber-400", detail: "Anyone can pitch an idea. Title, venue, date/time are captured and scoped. Entry point of the pipeline — no verification yet." },
  { n: "02", label: "Scope picked", desc: "Personal / Programme / Level / Global", color: "from-sky-400 to-blue-500", ring: "ring-sky-400", dot: "bg-sky-400", detail: "Choose how broad the event is. Personal stays private; faculty/university/global will be considered for canonical promotion." },
  { n: "03", label: "Venue locked", desc: "Hall, lab, or field confirmed", color: "from-emerald-400 to-teal-500", ring: "ring-emerald-400", dot: "bg-emerald-400", detail: "Venue is required for duplicate guard and timetable sync. Same title+date+venue is blocked." },
  { n: "04", label: "Date & time set", desc: "Fixed on timetable feed", color: "from-violet-400 to-purple-600", ring: "ring-violet-400", dot: "bg-violet-400", detail: "Pinned to the calendar. Powers green/yellow/red timetable confidence states." },
  { n: "05", label: "Personal bubble", desc: "Appears in creator roadmap", color: "from-pink-400 to-rose-500", ring: "ring-pink-400", dot: "bg-pink-400", detail: "New events land here first as a personal bubble visible only to the creator's roadmap." },
  { n: "06", label: "Duplicate check", desc: "Title + date + venue guard", color: "from-red-400 to-orange-500", ring: "ring-red-400", dot: "bg-red-400", detail: "API rejects duplicates (lower(title)+event_date+lower(venue)). Returns 409 + duplicate_warning." },
  { n: "07", label: "Scope review", desc: "Is it broad enough to promote?", color: "from-cyan-400 to-sky-600", ring: "ring-cyan-400", dot: "bg-cyan-400", detail: "Personal/programme/level remain personal. Faculty/university/global auto-promote to canonical." },
  { n: "08", label: "Verification queue", desc: "Random yes / no / cancel", color: "from-lime-400 to-emerald-600", ring: "ring-lime-400", dot: "bg-lime-400", detail: "Verification Engine pops a random physi_events row for votes. Authority-weighted signals accumulate." },
  { n: "09", label: "Authority weight", desc: "Rep & admin votes matter more", color: "from-amber-300 to-yellow-500", ring: "ring-amber-300", dot: "bg-amber-300", detail: "Higher authority users have more weight in promotion and mining rewards." },
  { n: "10", label: "Canonical promo", desc: "Promoted to shared calendar", color: "from-indigo-400 to-violet-600", ring: "ring-indigo-400", dot: "bg-indigo-400", detail: "Once promoted, status becomes canonical and appears in the shared/pipeline canonical lane." },
  { n: "11", label: "Timetable sync", desc: "Green / yellow / red states", color: "from-teal-400 to-cyan-600", ring: "ring-teal-400", dot: "bg-teal-400", detail: "Synced to the live timetable with confidence coloring for students and admins." },
  { n: "12", label: "Mining reward", desc: "Authority-weighted PHYSI earn", color: "from-amber-400 via-yellow-400 to-amber-500", ring: "ring-amber-400", dot: "bg-amber-400", detail: "Daily tap-to-mine loop pays out based on verified participation and authority." },
];

// candy road geometry — 12 nodes alternating left/right in a 360px wide svg, 1240 tall
const ROAD_W = 360;
const ROAD_H = 1240;
const NODE_POS: { x: number; y: number }[] = roadmapSteps.map((_, i) => {
  const y = 72 + i * 102;
  // alternate left/right with slight middle bias every 3rd to make S-curve less rigid
  const leftX = 88;
  const rightX = ROAD_W - 88;
  const centerX = ROAD_W / 2;
  // pattern: L,R,L,R... but add subtle wobble for organic feel
  const baseX = i % 2 === 0 ? leftX : rightX;
  // add a tiny center-lean on nodes 3,6,9 for more winding
  const wobble = i % 3 === 2 ? (i % 2 === 0 ? 18 : -18) : 0;
  const x = i === 5 || i === 6 ? centerX + (i % 2 === 0 ? -42 : 42) : baseX + wobble;
  return { x, y };
});

function buildWindingPath(points: { x: number; y: number }[]) {
  if (points.length === 0) return "";
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const midY = (p0.y + p1.y) / 2;
    // control points create a smooth S-curve
    const dx = p1.x - p0.x;
    // horizontal pull for curve — bigger offset = more bulge
    const pull = 62;
    const c1x = p0.x + (dx > 0 ? pull : -pull) * 0.55;
    const c1y = p0.y + 42;
    const c2x = p1.x + (dx > 0 ? -pull : pull) * 0.55;
    const c2y = p1.y - 42;
    // alternate via cubic bezier; for center-shifted nodes use mid control
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p1.x} ${p1.y}`;
    // inject a soft mid control for very long vertical if needed (already handled)
    void midY;
  }
  return d;
}

export function EventRoadmap() {
  const [events, setEvents] = useState<PhysiEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [formState, setFormState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [isDuplicateWarning, setIsDuplicateWarning] = useState(false);

  const [title, setTitle] = useState("");
  const [venue, setVenue] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventTime, setEventTime] = useState("");
  const [scopeType, setScopeType] = useState("personal");
  const [scopeValue, setScopeValue] = useState("");
  const [nickname, setNickname] = useState("");

  const [selected, setSelected] = useState<number>(4);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const windingD = useMemo(() => buildWindingPath(NODE_POS), []);
  // dashed progress along path — compute partial path length approximation by segments up to selected
  const progressPct = ((selected + 1) / roadmapSteps.length) * 100;

  const scopeValueOptions = useMemo(() => {
    if (scopeType === "programme") return programmeOptions;
    if (scopeType === "level") return levelOptions;
    return [];
  }, [scopeType]);

  const scopeValuePlaceholder = useMemo(() => {
    if (scopeType === "programme") return "Select programme";
    if (scopeType === "level") return "Select level";
    if (scopeType === "faculty") return "e.g. FUHSI";
    if (scopeType === "university") return "e.g. FUHSI";
    if (scopeType === "global") return "e.g. All campuses";
    return "Optional scope detail";
  }, [scopeType]);

  const personalEvents = useMemo(() => events.filter((e) => e.status !== "canonical"), [events]);
  const canonicalEvents = useMemo(() => events.filter((e) => e.status === "canonical"), [events]);

  async function fetchEvents() {
    try {
      setLoadingEvents(true);
      const res = await fetch("/api/events");
      const data = await res.json();
      if (res.ok && data.ok) setEvents(data.events ?? []);
    } catch {
      // ignore
    } finally {
      setLoadingEvents(false);
    }
  }

  useEffect(() => {
    fetchEvents();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormState("loading");
    setMessage("");
    setIsDuplicateWarning(false);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          venue,
          event_date: eventDate,
          event_time: eventTime,
          scope_type: scopeType,
          scope_value: scopeValue || null,
          created_by_nickname: nickname || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) {
          setIsDuplicateWarning(true);
          throw new Error(data.error || "Duplicate event — same title, date, and venue already exists.");
        }
        throw new Error(data.error || "Could not create event");
      }
      setFormState("success");
      const msg = `Event created: ${data.event.title} — ${data.event.status === "canonical" ? "promoted to canonical" : "personal bubble"}`;
      setMessage(msg);
      setToast({ type: "success", msg });
      setTitle("");
      setVenue("");
      setDrawerOpen(false);
      fetchEvents();
    } catch (err) {
      setFormState("error");
      const msg = err instanceof Error ? err.message : "Could not create event";
      setMessage(msg);
      setToast({ type: "error", msg });
      if (err instanceof Error && err.message.toLowerCase().includes("duplicate")) setIsDuplicateWarning(true);
    }
  }

  return (
    <section className="mt-8 space-y-6">
      {/* Header */}
      <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-amber-300">Event Roadmap</p>
            <h2 className="mt-2 text-3xl font-black leading-tight text-white">PHYSI Event Roadmap Flowchart</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              12-step Candy Crush winding road — from personal bubble to canonical timetable. Tap any level node for detail. Create opens as a drawer.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-xs font-bold uppercase tracking-wide text-emerald-300 sm:inline-flex">
              12 stages • live
            </span>
            <button
              onClick={() => setDrawerOpen(true)}
              className="rounded-full bg-white px-5 py-2.5 text-sm font-black text-slate-950 shadow-lg transition hover:scale-[1.02] active:scale-[0.98]"
            >
              + Create Event
            </button>
          </div>
        </div>

        {/* Progress */}
        <div className="mt-6">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-widest text-slate-400">
            <span>Progress • step {String(selected + 1).padStart(2, "0")} / 12 — {roadmapSteps[selected].label}</span>
            <span className="hidden sm:inline text-amber-300">{Math.round(progressPct)}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-900">
            <div className="h-full rounded-full bg-gradient-to-r from-amber-400 via-yellow-400 to-emerald-400 transition-all duration-500" style={{ width: `${progressPct}%` }} />
          </div>
          <div className="mt-1.5 flex gap-1">
            {roadmapSteps.map((_, i) => (
              <div key={i} className={`h-1.5 flex-1 rounded-full transition ${i <= selected ? "bg-amber-400/80" : "bg-white/10"}`} />
            ))}
          </div>
        </div>
      </div>

      {/* WINDING ROAD MAP — vertical Candy Crush style */}
      <div className="rounded-[2rem] border border-white/10 bg-gradient-to-b from-slate-900/70 via-slate-900/40 to-slate-950/80 p-4 shadow-2xl backdrop-blur sm:p-6">
        <div className="flex flex-col items-center gap-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Candy Road • 12 Levels • alternating left / right</p>
          <div className="flex items-center gap-2 text-[11px] font-semibold text-amber-300/90">
            <span className="animate-bounce">↓</span> Scroll to explore <span className="hidden sm:inline">• tap any level circle</span>
            <span className="sm:hidden">• tap a node</span>
          </div>
        </div>

        {/* horizontal scroll hint + container: road is centered but scrollable on small screens */}
        <div className="relative mt-4">
          {/* hint bar */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center sm:hidden">
            <span className="rounded-full border border-white/10 bg-slate-900/90 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-slate-400 shadow">⟷ Horizontal scroll • pinch to zoom</span>
          </div>

          <div className="overflow-x-auto overflow-y-hidden pb-2 [scrollbar-width:thin] [&::-webkit-scrollbar]:h-2" style={{ scrollbarColor: "#fbbf24 #0f172a" }}>
            <div className="relative mx-auto" style={{ width: ROAD_W, height: ROAD_H }}>
              {/* SVG winding road */}
              <svg width={ROAD_W} height={ROAD_H} viewBox={`0 0 ${ROAD_W} ${ROAD_H}`} className="absolute inset-0 overflow-visible" aria-hidden>
                <defs>
                  <linearGradient id="roadGrad" x1="0" y1="0" x2="1" y2="0" gradientUnits="objectBoundingBox">
                    <stop offset="0%" stopColor="#d6a65a" />
                    <stop offset="100%" stopColor="#b45309" />
                  </linearGradient>
                  <filter id="roadShadow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#000" floodOpacity="0.35" />
                  </filter>
                </defs>

                {/* outer road stroke (border) */}
                <path d={windingD} fill="none" stroke="#3f2a14" strokeWidth={42} strokeLinecap="round" strokeLinejoin="round" opacity={0.95} filter="url(#roadShadow)" />
                {/* main road */}
                <path d={windingD} fill="none" stroke="url(#roadGrad)" strokeWidth={30} strokeLinecap="round" strokeLinejoin="round" />
                {/* inner highlight */}
                <path d={windingD} fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth={30} strokeLinecap="round" strokeLinejoin="round" style={{ mixBlendMode: "overlay" as any }} />
                {/* dashed center line */}
                <path d={windingD} fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth={1.6} strokeLinecap="round" strokeDasharray="10 14" opacity={0.95} />
                {/* progress tint up to selected node */}
                {/* subtle glow along completed segment */}
                <path
                  d={buildWindingPath(NODE_POS.slice(0, selected + 1))}
                  fill="none"
                  stroke="#fbbf24"
                  strokeWidth={30}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={0.18}
                />
              </svg>

              {/* nodes */}
              {roadmapSteps.map((step, idx) => {
                const pos = NODE_POS[idx];
                const isActive = idx === selected;
                const isCompleted = idx < selected;
                const isFuture = idx > selected;
                const side = idx % 2 === 0 ? "left" : "right";
                return (
                  <div
                    key={step.n}
                    className="absolute flex flex-col items-center"
                    style={{ left: pos.x, top: pos.y, transform: "translate(-50%, -50%)" }}
                  >
                    {/* connector label card alternating */}
                    <div
                      className={`absolute top-1/2 hidden flex-col gap-1 sm:flex ${side === "left" ? "left-[74px]" : "right-[74px] items-end text-right"}`}
                      style={{ transform: "translateY(-50%)", width: 118 }}
                    >
                      <span className={`text-[11px] font-black uppercase tracking-widest ${isActive ? "text-amber-300" : isCompleted ? "text-emerald-300" : "text-slate-400"}`}>
                        {isActive ? "● Active" : isCompleted ? "✓ Done" : "○ Locked"}
                      </span>
                      <span className={`text-xs font-black leading-tight ${isActive ? "text-white" : isFuture ? "text-slate-400" : "text-slate-200"}`}>{step.label}</span>
                      <span className="line-clamp-2 text-[11px] leading-4 text-slate-400">{step.desc}</span>
                    </div>

                    {/* tappable circle */}
                    <button
                      onClick={() => setSelected(idx)}
                      aria-label={`Level ${step.n} ${step.label}`}
                      className={`group relative flex h-[62px] w-[62px] items-center justify-center rounded-full border-[3.5px] bg-slate-950 shadow-xl transition-all duration-200 hover:scale-[1.04] active:scale-[0.98] ${
                        isActive
                          ? "scale-[1.08] border-white bg-gradient-to-br " + step.color + " shadow-[0_0_0_6px_rgba(251,191,36,0.22),0_10px_28px_rgba(0,0,0,0.5)] ring-2 ring-amber-300"
                          : isCompleted
                          ? "border-emerald-300/70 bg-gradient-to-br " + step.color + " opacity-100 shadow-[0_6px_18px_rgba(0,0,0,0.4)]"
                          : "border-white/15 bg-slate-800 opacity-60 hover:opacity-85"
                      }`}
                    >
                      {/* inner circle */}
                      <span
                        className={`flex h-[52px] w-[52px] items-center justify-center rounded-full bg-gradient-to-br text-[15px] font-black tracking-tight shadow-inner ${
                          isActive ? step.color + " text-slate-900" : isCompleted ? step.color + " text-slate-900" : "from-slate-700 to-slate-800 text-slate-300"
                        }`}
                      >
                        {isCompleted ? (
                          <span className="text-lg leading-none">✓</span>
                        ) : isFuture ? (
                          <span className="text-[11px]">◯</span>
                        ) : (
                          step.n
                        )}
                      </span>
                      {/* level number badge */}
                      <span
                        className={`absolute -bottom-1.5 rounded-full border px-1.5 py-0.5 text-[10px] font-black leading-none shadow ${isActive ? "border-amber-300 bg-amber-300 text-slate-900" : isCompleted ? "border-emerald-300 bg-emerald-400 text-slate-900" : "border-white/10 bg-slate-900 text-slate-400"}`}
                      >
                        {isFuture ? `LV ${step.n}` : `LV ${step.n}`}
                      </span>
                      {/* pulse ring for active */}
                      {isActive && <span className="pointer-events-none absolute inset-0 animate-ping rounded-full border-2 border-amber-300/40" style={{ animationDuration: "1.8s" }} />}
                    </button>

                    {/* mobile label under circle */}
                    <div className="mt-3 flex max-w-[108px] flex-col items-center text-center sm:hidden">
                      <span className={`text-[11px] font-black leading-tight ${isActive ? "text-white" : isCompleted ? "text-slate-200" : "text-slate-400"}`}>{step.label}</span>
                      <span className={`mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${isActive ? "bg-amber-400 text-slate-900" : isCompleted ? "bg-emerald-400/15 text-emerald-300 border border-emerald-400/20" : "bg-white/5 text-slate-500 border border-white/10"}`}>
                        {isActive ? "Active" : isCompleted ? "Done" : "Locked"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <p className="mt-1 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            ⟷ Horizontal scroll on small screens • tap any circle for detail
          </p>
        </div>

        {/* Detail panel for selected node */}
        <div className="mt-5 rounded-3xl border border-amber-400/20 bg-gradient-to-br from-slate-900/80 to-slate-950/80 p-5 backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex gap-3">
              <div className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${roadmapSteps[selected].color} text-base font-black text-slate-900 shadow`}>
                {roadmapSteps[selected].n}
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300">Level {roadmapSteps[selected].n} • {selected < 4 ? "Early" : selected < 8 ? "Mid road" : "Final stretch"}</p>
                <h3 className="text-lg font-black text-white">{roadmapSteps[selected].label}</h3>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-300">{roadmapSteps[selected].detail}</p>
                <p className="mt-1 text-xs text-slate-400">{roadmapSteps[selected].desc}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setSelected((s) => Math.max(0, s - 1))}
                disabled={selected === 0}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-30"
              >
                ← Prev
              </button>
              <button
                onClick={() => setSelected((s) => Math.min(roadmapSteps.length - 1, s + 1))}
                disabled={selected === roadmapSteps.length - 1}
                className="rounded-full border border-white/10 bg-white px-3 py-1.5 text-xs font-black text-slate-900 disabled:opacity-30"
              >
                Next →
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Pipeline cards: personal → canonical (kept) */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-[2rem] border border-white/10 bg-slate-950/60 p-6 shadow-2xl backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-300">Lane A — Personal bubbles</p>
              <h3 className="mt-1 text-xl font-black text-white">Personal roadmap</h3>
              <p className="mt-1 text-xs text-slate-400">{personalEvents.length} events • awaiting promotion</p>
            </div>
            <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-xs font-bold text-sky-300">○ Personal</span>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <div className="h-1.5 flex-1 rounded-full bg-sky-400/20" />
            <span className="rounded-full bg-sky-400 px-2 py-1 text-[10px] font-black text-slate-900">→</span>
            <div className="h-1.5 flex-1 rounded-full bg-white/10" />
          </div>
          <div className="mt-5 grid gap-3">
            {loadingEvents ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center text-sm text-slate-400">Loading events…</div>
            ) : personalEvents.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-6 text-center">
                <p className="text-sm font-bold text-white">No personal events</p>
                <p className="mt-1 text-xs leading-5 text-slate-400">Create an event — narrow scopes (personal/programme/level) stay here as personal bubbles.</p>
                <button onClick={() => setDrawerOpen(true)} className="mt-3 rounded-full bg-white px-4 py-2 text-xs font-black text-slate-900">Create Event</button>
              </div>
            ) : (
              personalEvents.map((ev) => (
                <div key={ev.id} className="group relative overflow-hidden rounded-2xl border border-sky-400/15 bg-gradient-to-br from-sky-400/[0.07] to-white/[0.03] p-4 transition hover:border-sky-400/25">
                  <div className="absolute left-0 top-0 h-full w-1 bg-sky-400/60" />
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="max-w-[68%] text-sm font-black leading-tight text-white">{ev.title}</h4>
                    <span className="shrink-0 rounded-full border border-sky-400/20 bg-sky-400/10 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-sky-300">○ Personal</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-slate-300">
                    <span className="rounded-full bg-slate-900 px-2.5 py-1">📍 {ev.venue}</span>
                    <span className="rounded-full bg-slate-900 px-2.5 py-1">📅 {String(ev.event_date).slice(0, 10)} {String(ev.event_time).slice(0, 5)}</span>
                    <span className="rounded-full bg-slate-900 px-2.5 py-1">Scope: {ev.scope_type}{ev.scope_value ? ` • ${ev.scope_value}` : ""}</span>
                  </div>
                  {ev.created_by_nickname ? <p className="mt-2 text-xs text-slate-400">by <span className="font-bold text-slate-200">{ev.created_by_nickname}</span></p> : null}
                  <p className="mt-2 text-xs text-slate-500">Personal bubble — needs broader scope + verification to promote →</p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-[2rem] border border-emerald-400/20 bg-gradient-to-br from-emerald-400/[0.06] to-slate-950/60 p-6 shadow-2xl backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">Lane B — Canonical timetable</p>
              <h3 className="mt-1 text-xl font-black text-white">Canonical pipeline</h3>
              <p className="mt-1 text-xs text-slate-400">{canonicalEvents.length} events • shared calendar</p>
            </div>
            <span className="rounded-full border border-emerald-400/30 bg-emerald-400/15 px-3 py-1 text-xs font-bold text-emerald-300">⬢ Canonical</span>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <div className="h-1.5 flex-1 rounded-full bg-emerald-400/30" />
            <span className="rounded-full bg-emerald-400 px-2 py-1 text-[10px] font-black text-slate-900">✓</span>
            <div className="h-1.5 flex-1 rounded-full bg-emerald-400/30" />
          </div>
          <div className="mt-5 grid gap-3">
            {loadingEvents ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center text-sm text-slate-400">Loading events…</div>
            ) : canonicalEvents.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-emerald-400/20 bg-emerald-400/[0.04] p-6 text-center">
                <p className="text-sm font-bold text-white">No canonical events yet</p>
                <p className="mt-1 text-xs leading-5 text-slate-400">Use scope faculty / university / global to auto-promote on create. Events animate from personal → canonical.</p>
              </div>
            ) : (
              canonicalEvents.map((ev) => (
                <div key={ev.id} className="group relative overflow-hidden rounded-2xl border border-emerald-400/20 bg-gradient-to-br from-emerald-400/[0.08] to-white/[0.03] p-4 transition hover:border-emerald-400/30">
                  <div className="absolute left-0 top-0 h-full w-1 bg-emerald-400" />
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="max-w-[68%] text-sm font-black leading-tight text-white">{ev.title}</h4>
                    <span className="shrink-0 rounded-full border border-emerald-400/30 bg-emerald-400/15 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-emerald-300">⬢ Canonical</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-slate-300">
                    <span className="rounded-full bg-slate-900 px-2.5 py-1">📍 {ev.venue}</span>
                    <span className="rounded-full bg-slate-900 px-2.5 py-1">📅 {String(ev.event_date).slice(0, 10)} {String(ev.event_time).slice(0, 5)}</span>
                    <span className="rounded-full bg-slate-900 px-2.5 py-1">Scope: {ev.scope_type}{ev.scope_value ? ` • ${ev.scope_value}` : ""}</span>
                  </div>
                  {ev.created_by_nickname ? <p className="mt-2 text-xs text-slate-400">by <span className="font-bold text-slate-200">{ev.created_by_nickname}</span></p> : null}
                  <p className="mt-2 text-xs font-semibold text-emerald-300">Promoted to shared timetable — verified scope</p>
                </div>
              ))
            )}
          </div>
          <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-amber-300">Duplicate guard active</p>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              API blocks inserts where <span className="text-slate-200">lower(title) + event_date + lower(venue)</span> already exists. Returns <span className="font-mono text-amber-300">409 + duplicate_warning</span>.
            </p>
            <button onClick={fetchEvents} className="mt-3 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-300 hover:bg-white/10">↻ Refresh pipeline</button>
          </div>
        </div>
      </div>

      {/* Drawer / Modal for Create Event */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} aria-hidden />
          <div className="relative flex h-full w-full max-w-[480px] flex-col overflow-hidden rounded-l-[2rem] border-l border-white/10 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-amber-300">Create Event</p>
                <h3 className="mt-1 text-xl font-black text-white">Push to roadmap</h3>
                <p className="mt-1 text-xs text-slate-400">POST /api/events • physi_events</p>
              </div>
              <button onClick={() => setDrawerOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white hover:bg-white/10">✕</button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-6">
              <div className="grid gap-4">
                <label className="grid gap-2 text-sm font-semibold text-slate-200">
                  Title
                  <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="FUHSI Health Week Opening" required className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-amber-400/40" />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-slate-200">
                  Venue
                  <input value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="FUHSI Auditorium" required className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-amber-400/40" />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-2 text-sm font-semibold text-slate-200">
                    Event date
                    <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} required className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none focus:border-amber-400/40" />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold text-slate-200">
                    Event time
                    <input type="time" value={eventTime} onChange={(e) => setEventTime(e.target.value)} required className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none focus:border-amber-400/40" />
                  </label>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-2 text-sm font-semibold text-slate-200">
                    Scope type
                    <select value={scopeType} onChange={(e) => { setScopeType(e.target.value); setScopeValue(""); }} className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none focus:border-amber-400/40">
                      {scopeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm font-semibold text-slate-200">
                    Scope value
                    {scopeValueOptions.length > 0 ? (
                      <select value={scopeValue} onChange={(e) => setScopeValue(e.target.value)} className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none focus:border-amber-400/40">
                        <option value="">{scopeValuePlaceholder}</option>
                        {scopeValueOptions.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    ) : (
                      <input value={scopeValue} onChange={(e) => setScopeValue(e.target.value)} placeholder={scopeValuePlaceholder} className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-amber-400/40" />
                    )}
                  </label>
                </div>
                <label className="grid gap-2 text-sm font-semibold text-slate-200">
                  Created by nickname
                  <input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="Tope (must match a profile)" className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-amber-400/40" />
                  <span className="text-xs font-normal text-slate-400">Links event to physi_users.id via nickname lookup</span>
                </label>

                <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-xs leading-5 text-amber-200">
                  <span className="font-black">Promotion logic:</span> personal scopes stay as <span className="font-bold text-white">personal</span> bubbles; faculty / university / global promote to <span className="font-bold text-emerald-300">canonical</span>. Duplicate = 409.
                </div>

                {message && (
                  <div className={`rounded-2xl border px-4 py-3 text-sm ${formState === "success" ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : isDuplicateWarning ? "border-amber-400/40 bg-amber-400/10 text-amber-200" : "border-rose-400/30 bg-rose-400/10 text-rose-200"}`}>
                    {isDuplicateWarning ? "⚠ Duplicate warning: " : ""}{message}
                  </div>
                )}
              </div>

              <div className="sticky bottom-0 mt-6 flex gap-3 bg-slate-900 pt-2">
                <button type="button" onClick={() => setDrawerOpen(false)} className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold text-white hover:bg-white/10">Cancel</button>
                <button type="submit" disabled={formState === "loading"} className="flex-1 rounded-2xl bg-white px-5 py-3 text-sm font-black text-slate-950 shadow-lg transition hover:scale-[1.01] disabled:opacity-60">
                  {formState === "loading" ? "Creating…" : "Create Event"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Success toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-[60] max-w-sm rounded-2xl border px-4 py-3 text-sm font-semibold shadow-2xl backdrop-blur ${toast.type === "success" ? "border-emerald-400/30 bg-emerald-500 text-white" : "border-rose-400/30 bg-rose-500 text-white"}`}>
          <div className="flex items-start gap-2">
            <span className="text-base">{toast.type === "success" ? "✓" : "⚠"}</span>
            <span className="leading-5">{toast.msg}</span>
            <button onClick={() => setToast(null)} className="ml-2 text-white/80 hover:text-white">✕</button>
          </div>
        </div>
      )}
    </section>
  );
}
