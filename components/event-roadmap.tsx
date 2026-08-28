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
  { n: "01", label: "Idea pitched", desc: "Student proposes campus event", color: "from-amber-400 to-orange-500", detail: "Anyone can pitch an idea. Title, venue, date/time are captured and scoped. Entry point of the pipeline — no verification yet." },
  { n: "02", label: "Scope picked", desc: "Personal / Programme / Level / Global", color: "from-sky-400 to-blue-500", detail: "Choose how broad the event is. Personal stays private; faculty/university/global will be considered for canonical promotion." },
  { n: "03", label: "Venue locked", desc: "Hall, lab, or field confirmed", color: "from-emerald-400 to-teal-500", detail: "Venue is required for duplicate guard and timetable sync. Same title+date+venue is blocked." },
  { n: "04", label: "Date & time set", desc: "Fixed on timetable feed", color: "from-violet-400 to-purple-600", detail: "Pinned to the calendar. Powers green/yellow/red timetable confidence states." },
  { n: "05", label: "Personal bubble", desc: "Appears in creator roadmap", color: "from-pink-400 to-rose-500", detail: "New events land here first as a personal bubble visible only to the creator's roadmap." },
  { n: "06", label: "Duplicate check", desc: "Title + date + venue guard", color: "from-red-400 to-orange-500", detail: "API rejects duplicates (lower(title)+event_date+lower(venue)). Returns 409 + duplicate_warning." },
  { n: "07", label: "Scope review", desc: "Is it broad enough to promote?", color: "from-cyan-400 to-sky-600", detail: "Personal/programme/level remain personal. Faculty/university/global auto-promote to canonical." },
  { n: "08", label: "Verification queue", desc: "Random yes / no / cancel", color: "from-lime-400 to-emerald-600", detail: "Verification Engine pops a random physi_events row for votes. Authority-weighted signals accumulate." },
  { n: "09", label: "Authority weight", desc: "Rep & admin votes matter more", color: "from-amber-300 to-yellow-500", detail: "Higher authority users have more weight in promotion and mining rewards." },
  { n: "10", label: "Canonical promo", desc: "Promoted to shared calendar", color: "from-indigo-400 to-violet-600", detail: "Once promoted, status becomes canonical and appears in the shared/pipeline canonical lane." },
  { n: "11", label: "Timetable sync", desc: "Green / yellow / red states", color: "from-teal-400 to-cyan-600", detail: "Synced to the live timetable with confidence coloring for students and admins." },
  { n: "12", label: "Mining reward", desc: "Authority-weighted PHYSI earn", color: "from-amber-400 via-yellow-400 to-amber-500", detail: "Daily tap-to-mine loop pays out based on verified participation and authority." },
];

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

  // flowchart interactivity
  const [selected, setSelected] = useState<number>(4); // default on Personal bubble
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  // auto-dismiss toast
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
      // keep date/time/scope for rapid entry
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

  function scrollBy(dir: number) {
    scrollRef.current?.scrollBy({ left: dir * 320, behavior: "smooth" });
  }

  const progressPct = ((selected + 1) / roadmapSteps.length) * 100;

  return (
    <section className="mt-8 space-y-6">
      {/* Header */}
      <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-amber-300">Event Roadmap</p>
            <h2 className="mt-2 text-3xl font-black leading-tight text-white">PHYSI Event Roadmap Flowchart</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              12-step scoped promotion pipeline — from personal bubble to canonical timetable. Tap any node for detail. Create opens as a drawer.
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

        {/* Progress indicator */}
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

        {/* Flowchart: horizontal scroll on mobile, SVG arrows */}
        <div className="relative mt-6">
          {/* scroll controls - desktop */}
          <button
            aria-label="Scroll left"
            onClick={() => scrollBy(-1)}
            className="absolute left-0 top-1/2 z-20 hidden -translate-y-1/2 rounded-full border border-white/10 bg-slate-900 p-2 text-white shadow-xl hover:bg-slate-800 md:flex"
          >
            ‹
          </button>
          <button
            aria-label="Scroll right"
            onClick={() => scrollBy(1)}
            className="absolute right-0 top-1/2 z-20 hidden -translate-y-1/2 rounded-full border border-white/10 bg-slate-900 p-2 text-white shadow-xl hover:bg-slate-800 md:flex"
          >
            ›
          </button>

          <div
            ref={scrollRef}
            className="flex gap-3 overflow-x-auto scroll-smooth pb-3 pt-2 [scrollbar-width:thin] snap-x snap-mandatory md:gap-3"
            style={{ scrollbarColor: "#fbbf24 #0f172a" }}
          >
            {roadmapSteps.map((step, idx) => {
              const isActive = idx === selected;
              const isCompleted = idx < selected;
              const isFuture = idx > selected;
              return (
                <div key={step.n} className="relative flex shrink-0 snap-start items-stretch gap-3">
                  <button
                    onClick={() => setSelected(idx)}
                    className={`group relative flex w-[185px] flex-col overflow-hidden rounded-3xl border p-[1.5px] text-left shadow-xl transition-all duration-200 sm:w-[200px] ${
                      isActive
                        ? "scale-[1.03] border-amber-300/50 bg-gradient-to-br " + step.color
                        : isCompleted
                        ? "border-emerald-400/20 bg-gradient-to-br " + step.color + " opacity-95"
                        : "border-white/10 bg-gradient-to-br from-slate-800 to-slate-900 opacity-60 hover:opacity-90"
                    }`}
                  >
                    <div
                      className={`flex h-full flex-col rounded-[1.35rem] p-4 backdrop-blur ${
                        isActive ? "bg-slate-950/85" : isCompleted ? "bg-slate-950/80" : "bg-slate-950/70"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-sm font-black shadow ${
                            isActive ? step.color + " text-slate-900 ring-2 ring-white/40" : step.color + " text-slate-900"
                          }`}
                        >
                          {step.n}
                        </div>
                        <span
                          className={`rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-widest ${
                            isActive
                              ? "border-amber-300/40 bg-amber-300/15 text-amber-200"
                              : isCompleted
                              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                              : "border-white/10 bg-white/5 text-slate-400"
                          }`}
                        >
                          {isActive ? "● Active" : isCompleted ? "✓ Done" : "○ Dim"}
                        </span>
                      </div>
                      <h4 className={`mt-3 text-sm font-black leading-tight ${isActive ? "text-white" : isFuture ? "text-slate-300" : "text-white"}`}>
                        {step.label}
                      </h4>
                      <p className={`mt-1 line-clamp-2 text-xs leading-5 ${isActive ? "text-slate-300" : "text-slate-400"}`}>{step.desc}</p>
                      <div className="mt-3 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-300/90">
                        <span>Tap for detail</span>
                        <span className="transition group-hover:translate-x-0.5">→</span>
                      </div>
                    </div>
                    {/* active glow line */}
                    {isActive && <div className={`absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r ${step.color}`} />}
                  </button>

                  {/* SVG connecting arrow between nodes */}
                  {idx < roadmapSteps.length - 1 && (
                    <div className="flex w-[44px] shrink-0 items-center justify-center self-center">
                      <svg width="44" height="24" viewBox="0 0 44 24" fill="none" className="overflow-visible" aria-hidden>
                        <path
                          d="M2 12 H34"
                          stroke={isCompleted || isActive ? "#fbbf24" : "rgba(255,255,255,0.18)"}
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeDasharray={isFuture ? "4 4" : "0"}
                          className="transition-colors"
                        />
                        <path
                          d="M30 7 L38 12 L30 17"
                          fill="none"
                          stroke={isCompleted || isActive ? "#fbbf24" : "rgba(255,255,255,0.18)"}
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        {/* pulse dot for active edge */}
                        {isCompleted && <circle cx="34" cy="12" r="3" fill="#fbbf24" opacity="0.9" />}
                      </svg>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-1 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 md:hidden">⟷ Horizontal scroll • tap any node</p>
        </div>

        {/* Detail panel for tapped node */}
        <div className="mt-4 rounded-3xl border border-amber-400/20 bg-gradient-to-br from-slate-900/80 to-slate-950/80 p-5 backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex gap-3">
              <div className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${roadmapSteps[selected].color} text-base font-black text-slate-900 shadow`}>
                {roadmapSteps[selected].n}
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300">Step {roadmapSteps[selected].n} • active</p>
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

      {/* Pipeline cards: personal → canonical */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Personal lane */}
        <div className="rounded-[2rem] border border-white/10 bg-slate-950/60 p-6 shadow-2xl backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-300">Lane A — Personal bubbles</p>
              <h3 className="mt-1 text-xl font-black text-white">Personal roadmap</h3>
              <p className="mt-1 text-xs text-slate-400">{personalEvents.length} events • awaiting promotion</p>
            </div>
            <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-xs font-bold text-sky-300">○ Personal</span>
          </div>
          {/* pipeline track */}
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

        {/* Canonical lane */}
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
