"use client";

import { useEffect, useMemo, useState } from "react";

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
  { n: "01", label: "Idea pitched", desc: "Student proposes campus event", color: "from-amber-400 to-orange-500" },
  { n: "02", label: "Scope picked", desc: "Personal / Programme / Level / Global", color: "from-sky-400 to-blue-500" },
  { n: "03", label: "Venue locked", desc: "Hall, lab, or field confirmed", color: "from-emerald-400 to-teal-500" },
  { n: "04", label: "Date & time set", desc: "Fixed on timetable feed", color: "from-violet-400 to-purple-600" },
  { n: "05", label: "Personal bubble", desc: "Appears in creator roadmap", color: "from-pink-400 to-rose-500" },
  { n: "06", label: "Duplicate check", desc: "Title + date + venue guard", color: "from-red-400 to-orange-500" },
  { n: "07", label: "Scope review", desc: "Is it broad enough to promote?", color: "from-cyan-400 to-sky-600" },
  { n: "08", label: "Verification queue", desc: "Random yes / no / cancel", color: "from-lime-400 to-emerald-600" },
  { n: "09", label: "Authority weight", desc: "Rep & admin votes matter more", color: "from-amber-300 to-yellow-500" },
  { n: "10", label: "Canonical promo", desc: "Promoted to shared calendar", color: "from-indigo-400 to-violet-600" },
  { n: "11", label: "Timetable sync", desc: "Green / yellow / red states", color: "from-teal-400 to-cyan-600" },
  { n: "12", label: "Mining reward", desc: "Authority-weighted PHYSI earn", color: "from-amber-400 via-yellow-400 to-amber-500" },
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
      setMessage(
        `Event created: ${data.event.title} — ${data.event.status === "canonical" ? "promoted to canonical" : "personal bubble"}`
      );
      setTitle("");
      setVenue("");
      // keep date/time/scope for rapid entry
      fetchEvents();
    } catch (err) {
      setFormState("error");
      setMessage(err instanceof Error ? err.message : "Could not create event");
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
              12-step scoped promotion pipeline — from personal bubble to canonical timetable. Duplicate prevention
              guards every insert on title + date + venue.
            </p>
          </div>
          <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-xs font-bold uppercase tracking-wide text-emerald-300">
            12 stages • live
          </span>
        </div>

        {/* 12-step colorful bubbles grid with arrows */}
        <div className="mt-8">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {roadmapSteps.map((step, idx) => (
              <div key={step.n} className="relative">
                <div
                  className={`relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br ${step.color} p-[1.5px] shadow-xl`}
                >
                  <div className="rounded-[1.4rem] bg-slate-950/90 p-4 backdrop-blur">
                    <div className="flex items-start justify-between gap-2">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${step.color} text-sm font-black text-slate-900 shadow`}
                      >
                        {step.n}
                      </div>
                      <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-300">
                        Step {step.n}
                      </span>
                    </div>
                    <h4 className="mt-3 text-sm font-black leading-tight text-white">{step.label}</h4>
                    <p className="mt-1 text-xs leading-5 text-slate-400">{step.desc}</p>
                  </div>
                </div>
                {/* Arrow connector (hidden on last, visible grid-aware) */}
                {idx < roadmapSteps.length - 1 && (
                  <div className="absolute -right-2 top-1/2 z-10 hidden -translate-y-1/2 xl:flex">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-slate-900 text-amber-300 shadow-lg">
                      →
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
          {/* Mobile flow arrows line */}
          <div className="mt-4 flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-slate-500 xl:hidden">
            <span>Personal</span>
            <span className="text-amber-300">→</span>
            <span>Duplicate check</span>
            <span className="text-amber-300">→</span>
            <span>Canonical</span>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        {/* Create Event form */}
        <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-amber-300">Create Event</p>
              <h3 className="mt-1 text-xl font-black text-white">Push to roadmap</h3>
            </div>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-sky-300">
              POST /api/events
            </span>
          </div>

          <form onSubmit={handleSubmit} className="mt-5 grid gap-4">
            <label className="grid gap-2 text-sm font-semibold text-slate-200">
              Title
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="FUHSI Health Week Opening"
                required
                className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-amber-400/40"
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold text-slate-200">
              Venue
              <input
                value={venue}
                onChange={(e) => setVenue(e.target.value)}
                placeholder="FUHSI Auditorium"
                required
                className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-amber-400/40"
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold text-slate-200">
                Event date
                <input
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  required
                  className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none focus:border-amber-400/40"
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-slate-200">
                Event time
                <input
                  type="time"
                  value={eventTime}
                  onChange={(e) => setEventTime(e.target.value)}
                  required
                  className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none focus:border-amber-400/40"
                />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold text-slate-200">
                Scope type
                <select
                  value={scopeType}
                  onChange={(e) => {
                    setScopeType(e.target.value);
                    setScopeValue("");
                  }}
                  className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none focus:border-amber-400/40"
                >
                  {scopeOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2 text-sm font-semibold text-slate-200">
                Scope value
                {scopeValueOptions.length > 0 ? (
                  <select
                    value={scopeValue}
                    onChange={(e) => setScopeValue(e.target.value)}
                    className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none focus:border-amber-400/40"
                  >
                    <option value="">{scopeValuePlaceholder}</option>
                    {scopeValueOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={scopeValue}
                    onChange={(e) => setScopeValue(e.target.value)}
                    placeholder={scopeValuePlaceholder}
                    className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-amber-400/40"
                  />
                )}
              </label>
            </div>

            <label className="grid gap-2 text-sm font-semibold text-slate-200">
              Created by nickname
              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Tope (must match a profile)"
                className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-amber-400/40"
              />
              <span className="text-xs font-normal text-slate-400">Links event to physi_users.id via nickname lookup</span>
            </label>

            {/* Promotion hint */}
            <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-xs leading-5 text-amber-200">
              <span className="font-black">Promotion logic:</span> personal scopes stay as <span className="font-bold text-white">personal</span> bubbles;
              faculty / university / global scopes promote to <span className="font-bold text-emerald-300">canonical</span>.
              Duplicate = same title + date + venue blocked with 409.
            </div>

            <button
              type="submit"
              disabled={formState === "loading"}
              className="rounded-2xl bg-white px-5 py-3 text-sm font-black text-slate-950 shadow-lg transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {formState === "loading" ? "Creating event…" : "Create Event"}
            </button>
          </form>

          {message ? (
            <div
              className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
                formState === "success"
                  ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                  : isDuplicateWarning
                  ? "border-amber-400/40 bg-amber-400/10 text-amber-200"
                  : "border-rose-400/30 bg-rose-400/10 text-rose-200"
              }`}
            >
              {isDuplicateWarning ? "⚠ Duplicate warning: " : ""}
              {message}
            </div>
          ) : null}
        </div>

        {/* Events list */}
        <div className="rounded-[2rem] border border-white/10 bg-slate-950/60 p-6 shadow-2xl backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xl font-black text-white">Roadmap events</h3>
            <button
              onClick={fetchEvents}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-slate-300 hover:bg-white/10"
            >
              Refresh
            </button>
          </div>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            {loadingEvents ? "Loading…" : `${events.length} event${events.length !== 1 ? "s" : ""} • personal vs canonical`}
          </p>

          <div className="mt-5 grid gap-3">
            {loadingEvents ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center text-sm text-slate-400">
                Loading events…
              </div>
            ) : events.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
                <p className="text-sm font-bold text-white">No events yet</p>
                <p className="mt-1 text-xs leading-5 text-slate-400">Create your first event — it will appear as a personal bubble until promoted.</p>
              </div>
            ) : (
              events.map((ev) => (
                <div
                  key={ev.id}
                  className="rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:bg-white/[0.07]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h4 className="max-w-[70%] text-sm font-black leading-tight text-white">{ev.title}</h4>
                    <span
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-black uppercase tracking-wide ${
                        ev.status === "canonical"
                          ? "border-emerald-400/30 bg-emerald-400/15 text-emerald-300"
                          : "border-sky-400/30 bg-sky-400/10 text-sky-300"
                      }`}
                    >
                      {ev.status === "canonical" ? "⬢ Canonical" : "○ Personal"}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-300">
                    <span className="rounded-full bg-slate-900 px-2.5 py-1">📍 {ev.venue}</span>
                    <span className="rounded-full bg-slate-900 px-2.5 py-1">
                      📅 {String(ev.event_date).slice(0, 10)} {String(ev.event_time).slice(0, 5)}
                    </span>
                    <span className="rounded-full bg-slate-900 px-2.5 py-1">
                      Scope: {ev.scope_type}
                      {ev.scope_value ? ` • ${ev.scope_value}` : ""}
                    </span>
                  </div>
                  {ev.created_by_nickname ? (
                    <p className="mt-2 text-xs text-slate-400">
                      by <span className="font-bold text-slate-200">{ev.created_by_nickname}</span>
                    </p>
                  ) : null}
                  {ev.status === "canonical" ? (
                    <p className="mt-2 text-xs font-semibold text-emerald-300">Promoted to shared timetable — verified scope</p>
                  ) : (
                    <p className="mt-2 text-xs text-slate-500">Personal bubble — awaiting broader verification / promotion</p>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-amber-300">Duplicate guard active</p>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              API blocks inserts where <span className="text-slate-200">lower(title) + event_date + lower(venue)</span> already exists.
              API returns <span className="font-mono text-amber-300">409 + duplicate_warning</span> — surfaced in the form above.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
