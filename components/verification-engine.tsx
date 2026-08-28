"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type PhysiEvent = {
  id: string;
  title: string;
  venue: string;
  event_date: string;
  event_time: string;
  scope_type?: string;
  scope_value?: string;
  status?: string;
};

const MOCK_EVENTS: PhysiEvent[] = [
  { id: "evt_1", title: "FUHSI Clinical Skills Workshop", venue: "Skills Lab A", event_date: "2026-09-02", event_time: "10:00", scope_type: "programme", scope_value: "Medicine" },
  { id: "evt_2", title: "Anatomy Dept Seminar – Neuroanatomy", venue: "LT 1", event_date: "2026-09-03", event_time: "13:00", scope_type: "department", scope_value: "Anatomy" },
  { id: "evt_3", title: "Nursing Council Accreditation Visit", venue: "Admin Block", event_date: "2026-09-04", event_time: "09:00", scope_type: "school", scope_value: "FUHSI" },
  { id: "evt_4", title: "Pharmacology Quiz Series", venue: "LT 3", event_date: "2026-09-05", event_time: "15:30", scope_type: "course", scope_value: "PHA 204" },
  { id: "evt_5", title: "Environmental Health Field Trip", venue: "Ondo Water Works", event_date: "2026-09-06", event_time: "08:00", scope_type: "programme", scope_value: "EHS" },
  { id: "evt_6", title: "Inter-Faculty Sports Finals", venue: "University Stadium", event_date: "2026-09-07", event_time: "16:00", scope_type: "campus", scope_value: "All" },
];

type Vote = "YES" | "NO" | "CANCEL";

export function VerificationEngine() {
  const [active, setActive] = useState<PhysiEvent | null>(null);
  const [open, setOpen] = useState(false);
  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState<Vote | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<"success" | "error" | "info">("info");
  const [stats, setStats] = useState({ verified: 0, yes: 0, no: 0 });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pickRandom = useCallback(() => {
    const pool = MOCK_EVENTS;
    const ev = pool[Math.floor(Math.random() * pool.length)];
    setActive(ev);
    setOpen(true);
    setMessage(null);
  }, []);

  const scheduleRandom = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    // random popup between 12s and 35s to feel like a real verification nudge
    const delay = 12000 + Math.random() * 23000;
    timerRef.current = setTimeout(() => {
      pickRandom();
      // after showing, schedule next automatically only if not already open? Keep scheduling anyway
      scheduleRandom();
    }, delay);
  }, [pickRandom]);

  useEffect(() => {
    scheduleRandom();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [scheduleRandom]);

  async function handleVote(vote: Vote) {
    if (!active) return;
    setBusy(vote);
    setMessage(null);
    setTone("info");
    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // allow either nickname or verifier_id ; use nickname field for convenience
          nickname: nickname.trim() || undefined,
          verifier_id: undefined,
          event_id: active.id,
          vote,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Verification failed");

      setStats((s) => ({
        verified: s.verified + 1,
        yes: s.yes + (vote === "YES" ? 1 : 0),
        no: s.no + (vote === "NO" ? 1 : 0),
      }));

      if (data.mock) {
        setTone("info");
        setMessage(`Mock ${vote} for "${active.title}" — add a real user + events in Neon to persist.`);
      } else {
        setTone("success");
        const delta =
          vote === "YES" ? "+0.02 authority" : vote === "NO" ? "-0.01 authority" : "no authority change";
        setMessage(`Recorded ${vote}. Weight ${data.authority_weight ?? "?"} · ${delta}.`);
      }

      // auto-close after short delay on success
      setTimeout(() => setOpen(false), 1400);
    } catch (e) {
      setTone("error");
      setMessage(e instanceof Error ? e.message : "Could not verify");
    } finally {
      setBusy(null);
    }
  }

  function dismiss() {
    setOpen(false);
  }

  return (
    <>
      <section className="rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-amber-300">Verification Engine</p>
            <h3 className="mt-2 text-2xl font-black text-white">Random in-app verification</h3>
            <p className="mt-1 max-w-xl text-sm leading-6 text-slate-400">
              A popup picks a random <span className="text-slate-200">physi_events</span> row and asks you to vote YES / NO / CANCEL.
              Your vote is weighted by <span className="text-slate-200">authority_final</span> and nudges authority slightly.
            </p>
          </div>
          <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-300">
            Testing now
          </span>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Verified this session</p>
            <p className="mt-1 text-3xl font-black text-white">{stats.verified}</p>
          </div>
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4">
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-300">YES votes</p>
            <p className="mt-1 text-3xl font-black text-white">{stats.yes}</p>
          </div>
          <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4">
            <p className="text-xs font-bold uppercase tracking-widest text-rose-300">NO votes</p>
            <p className="mt-1 text-3xl font-black text-white">{stats.no}</p>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 bg-slate-950/60 p-4">
          <label className="grid gap-2 text-sm font-semibold text-slate-200">
            Verifier nickname <span className="font-normal text-slate-500">(must exist in physi_users; leave blank for mock)</span>
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Tope"
              className="rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 text-white outline-none placeholder:text-slate-500"
            />
          </label>
          <p className="mt-2 text-xs text-slate-500">Tip: create a profile first via the form above, then use that nickname here.</p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={pickRandom}
            className="rounded-full bg-white px-5 py-2.5 text-sm font-black text-slate-950 shadow-lg hover:scale-[1.01]"
          >
            Trigger verification now
          </button>
          <button
            onClick={() => {
              if (timerRef.current) clearTimeout(timerRef.current);
              setMessage("Auto-popup rescheduled (12–35s).");
              setTone("info");
              scheduleRandom();
            }}
            className="rounded-full border border-white/15 bg-transparent px-5 py-2.5 text-sm font-black text-white"
          >
            Reschedule random
          </button>
          <span className="self-center text-xs text-slate-500">Popup also fires automatically every 12–35s.</span>
        </div>

        {message ? (
          <p
            className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
              tone === "success"
                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                : tone === "error"
                ? "border-rose-400/30 bg-rose-400/10 text-rose-200"
                : "border-sky-400/30 bg-sky-400/10 text-sky-200"
            }`}
          >
            {message}
          </p>
        ) : null}

        <div className="mt-6 grid gap-2">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Event pool preview</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {MOCK_EVENTS.slice(0, 4).map((e) => (
              <div key={e.id} className="rounded-2xl border border-white/10 bg-slate-900/60 p-3">
                <p className="text-sm font-bold text-white">{e.title}</p>
                <p className="text-xs text-slate-400">
                  {e.venue} · {e.event_date} {e.event_time}
                </p>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500">In production replace MOCK_EVENTS with a fetch to /api/events (Neon physi_events).</p>
        </div>
      </section>

      {open && active ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button aria-label="Close overlay" onClick={dismiss} className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" />
          <div className="relative w-full max-w-lg rounded-[2rem] border border-white/10 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-amber-300">
                Verify this event
              </span>
              <button onClick={dismiss} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-slate-300 hover:text-white">
                Close
              </button>
            </div>

            <h4 className="mt-4 text-xl font-black text-white">{active.title}</h4>
            <div className="mt-2 space-y-1 text-sm text-slate-300">
              <p>📍 {active.venue}</p>
              <p>🕒 {active.event_date} {active.event_time}</p>
              {active.scope_type ? (
                <p className="text-xs uppercase tracking-widest text-slate-400">
                  Scope: {active.scope_type} {active.scope_value ? `· ${active.scope_value}` : ""}
                </p>
              ) : null}
            </div>

            <p className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3 text-sm leading-6 text-slate-300">
              Did this event really happen as listed? Your vote is weighted by your authority. YES slightly boosts authority, NO slightly reduces it, CANCEL skips without penalty.
            </p>

            <div className="mt-6 grid grid-cols-3 gap-3">
              <button
                onClick={() => handleVote("YES")}
                disabled={!!busy}
                className="rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950 shadow-lg disabled:opacity-60 hover:scale-[1.02]"
              >
                {busy === "YES" ? "..." : "YES"}
              </button>
              <button
                onClick={() => handleVote("NO")}
                disabled={!!busy}
                className="rounded-2xl bg-rose-400 px-4 py-3 text-sm font-black text-slate-950 shadow-lg disabled:opacity-60 hover:scale-[1.02]"
              >
                {busy === "NO" ? "..." : "NO"}
              </button>
              <button
                onClick={() => handleVote("CANCEL")}
                disabled={!!busy}
                className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-black text-white disabled:opacity-60 hover:bg-white/10"
              >
                {busy === "CANCEL" ? "..." : "CANCEL"}
              </button>
            </div>

            <p className="mt-3 text-center text-xs text-slate-500">Posts to POST /api/verify with authority_weight.</p>
          </div>
        </div>
      ) : null}
    </>
  );
}
