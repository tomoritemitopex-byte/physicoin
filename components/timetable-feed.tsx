"use client";

import { useEffect, useMemo, useState } from "react";

type Confidence = "green" | "yellow" | "red";

type Course = {
  id: string;
  code: string;
  title: string;
  venue: string;
  time: string;
  day: string;
  lecturer: string;
  confidence: Confidence;
  syncNote: string;
};

const MOCK_COURSES: Course[] = [
  { id: "1", code: "ANA 202", title: "Gross Anatomy II", venue: "LT 1 · FUHSI", time: "08:00 – 10:00", day: "Monday", lecturer: "Dr. A. Cole", confidence: "green", syncNote: "Synced 2m ago · verified room" },
  { id: "2", code: "PHS 211", title: "Physiology: Cardiovascular", venue: "PHS Lab", time: "10:15 – 12:15", day: "Monday", lecturer: "Prof. B. Musa", confidence: "green", syncNote: "Synced live · timetable match" },
  { id: "3", code: "BCH 203", title: "Metabolism & Enzymes", venue: "LT 2", time: "13:00 – 15:00", day: "Tuesday", lecturer: "Dr. K. Okon", confidence: "yellow", syncNote: "Sync delayed 18m · room tentative" },
  { id: "4", code: "ANA 205", title: "Histology Practical", venue: "Anatomy Lab B", time: "09:00 – 11:00", day: "Wednesday", lecturer: "Dr. S. Balogun", confidence: "yellow", syncNote: "Manual entry · awaiting verification" },
  { id: "5", code: "GNS 201", title: "Use of English II", venue: "Hall B", time: "15:30 – 17:00", day: "Thursday", lecturer: "Mr. J. Peters", confidence: "red", syncNote: "Conflict detected · overlaps MBBS 301" },
  { id: "6", code: "PHA 204", title: "Pharmacology Principles", venue: "LT 3", time: "08:30 – 10:30", day: "Friday", lecturer: "Prof. L. Adeyemi", confidence: "red", syncNote: "Source stale 2h · needs resync" },
];

const CONF: Record<Confidence, { label: string; dot: string; badge: string; bar: string }> = {
  green: {
    label: "High confidence",
    dot: "bg-emerald-400",
    badge: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
    bar: "bg-emerald-400",
  },
  yellow: {
    label: "Needs check",
    dot: "bg-amber-400",
    badge: "border-amber-400/30 bg-amber-400/10 text-amber-300",
    bar: "bg-amber-400",
  },
  red: {
    label: "Low confidence",
    dot: "bg-rose-400",
    badge: "border-rose-400/30 bg-rose-400/10 text-rose-300",
    bar: "bg-rose-400",
  },
};

function Legend() {
  return (
    <div className="flex flex-wrap gap-2">
      {(Object.keys(CONF) as Confidence[]).map((k) => (
        <span key={k} className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold ${CONF[k].badge}`}>
          <span className={`h-2 w-2 rounded-full ${CONF[k].dot}`} /> {k.toUpperCase()} · {CONF[k].label}
        </span>
      ))}
    </div>
  );
}

export function TimetableFeed() {
  const [filter, setFilter] = useState<Confidence | "all">("all");
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string>("just now");
  const [courses, setCourses] = useState<Course[]>(MOCK_COURSES);

  const filtered = useMemo(() => {
    if (filter === "all") return courses;
    return courses.filter((c) => c.confidence === filter);
  }, [courses, filter]);

  const counts = useMemo(() => {
    return {
      green: courses.filter((c) => c.confidence === "green").length,
      yellow: courses.filter((c) => c.confidence === "yellow").length,
      red: courses.filter((c) => c.confidence === "red").length,
    };
  }, [courses]);

  function handleSync() {
    setSyncing(true);
    setTimeout(() => {
      setSyncing(false);
      setLastSync(new Date().toLocaleTimeString());
      // simulate confidence improvement on resync
      setCourses((prev) =>
        prev.map((c) => {
          if (c.confidence === "red" && Math.random() > 0.5) return { ...c, confidence: "yellow" as Confidence, syncNote: "Resynced · rechecking room" };
          if (c.confidence === "yellow" && Math.random() > 0.6) return { ...c, confidence: "green" as Confidence, syncNote: "Resynced · verified" };
          return { ...c, syncNote: c.syncNote.replace(/\d+m ago|stale.*/, "synced just now") };
        })
      );
    }, 1200);
  }

  useEffect(() => {
    const t = setInterval(() => setLastSync(new Date().toLocaleTimeString()), 60000);
    return () => clearInterval(t);
  }, []);

  return (
    <section className="rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-amber-300">Timetable Feed</p>
          <h3 className="mt-2 text-2xl font-black text-white">Live timetable sync</h3>
          <p className="mt-1 text-sm text-slate-400">Mock sync data · enterprise card style · green / yellow / red confidence</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-white/10 bg-slate-900/60 px-3 py-1 text-xs font-semibold text-slate-300">
            Last sync: {lastSync}
          </span>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="rounded-full bg-white px-5 py-2 text-xs font-black text-slate-950 shadow-lg transition hover:scale-[1.02] disabled:opacity-60"
          >
            {syncing ? "Syncing..." : "Sync now"}
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4">
          <p className="text-xs font-bold uppercase tracking-widest text-emerald-300">Green · Verified</p>
          <p className="mt-1 text-3xl font-black text-white">{counts.green}</p>
          <p className="text-xs text-emerald-200/70">High confidence slots</p>
        </div>
        <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-300">Yellow · Review</p>
          <p className="mt-1 text-3xl font-black text-white">{counts.yellow}</p>
          <p className="text-xs text-amber-200/70">Needs verification</p>
        </div>
        <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4">
          <p className="text-xs font-bold uppercase tracking-widest text-rose-300">Red · Conflict</p>
          <p className="mt-1 text-3xl font-black text-white">{counts.red}</p>
          <p className="text-xs text-rose-200/70">Low / stale</p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <Legend />
        <div className="flex gap-1 rounded-full border border-white/10 bg-slate-950/60 p-1">
          {(["all", "green", "yellow", "red"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-4 py-1.5 text-xs font-bold capitalize transition ${
                filter === f ? "bg-white text-slate-900" : "text-slate-400 hover:text-white"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-3">
        {filtered.map((c) => (
          <div key={c.id} className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 sm:flex sm:items-center sm:justify-between">
            <div className="flex gap-4">
              <div className="hidden h-12 w-1.5 shrink-0 rounded-full sm:block">
                <div className={`h-full w-full rounded-full ${CONF[c.confidence].bar}`} />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${CONF[c.confidence].badge}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${CONF[c.confidence].dot}`} /> {CONF[c.confidence].label}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-bold text-white">{c.code}</span>
                  <span className="text-xs font-semibold text-slate-400">{c.day} · {c.time}</span>
                </div>
                <p className="mt-2 text-sm font-black text-white">{c.title}</p>
                <p className="text-xs text-slate-400">{c.venue} · {c.lecturer}</p>
                <p className="mt-1 text-xs text-slate-500">{c.syncNote}</p>
              </div>
            </div>
            <div className="mt-3 flex gap-2 sm:mt-0">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-300">Sync: OK</span>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-white/10 bg-slate-950/60 p-4 text-center text-sm text-slate-400">No courses in this confidence bucket.</p>
      ) : null}

      <p className="mt-4 text-xs text-slate-500">Mock sync source — wire to real timetable API by replacing MOCK_COURSES with a Neon / timetable fetch.</p>
    </section>
  );
}
