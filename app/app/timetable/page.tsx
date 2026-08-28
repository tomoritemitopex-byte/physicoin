"use client";
import { useEffect, useState, useCallback } from "react";

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

const FILTERS = [
  { k: "all", label: "Everything" },
  { k: "pending", label: "Advisory" },
  { k: "verified", label: "Green tick" },
];

function StatusPill({ status, verified }: { status: string; verified: boolean }) {
  if (verified) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-1 text-[11px] font-bold tracking-wide text-white shadow-[0_2px_10px_rgba(16,185,129,0.35)]">
        <span className="text-[11px]">✓</span> green tick
      </span>
    );
  }
  if (status === "pending")
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/20 bg-amber-400/10 px-2.5 py-1 font-mono text-[11px] font-medium text-amber-200">
        ● advisory
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-[11px] text-slate-400">
      {status}
    </span>
  );
}

export default function TimetablePage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [showPost, setShowPost] = useState(false);
  const [posting, setPosting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [voteBusy, setVoteBusy] = useState<string | null>(null);

  // post form
  const [form, setForm] = useState({
    title: "",
    venue: "",
    event_date: "",
    event_time: "",
    scope_type: "general",
    scope_value: "",
  });

  const fetchFeed = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const qs = filter === "all" ? "" : `?status=${filter}`;
      const r = await fetch(`/api/timetable${qs}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || j.ok === false) throw new Error(j.error || j.hint || "couldn't load feed");
      setEvents(j.events ?? []);
    } catch (e: any) {
      setErr(e.message || "feed failed");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchFeed();
  }, [fetchFeed]);

  // auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  async function handlePost(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title || !form.venue || !form.event_date || !form.event_time) {
      setToast("fill title, venue, date and time — we need basics to post");
      return;
    }
    setPosting(true);
    try {
      const r = await fetch("/api/timetable", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          venue: form.venue.trim(),
          event_date: form.event_date,
          event_time: form.event_time,
          scope_type: form.scope_type,
          scope_value: form.scope_value || null,
          status: "pending",
        }),
      });
      const j = await r.json();
      if (!r.ok || j.ok === false) throw new Error(j.error || "post failed");
      setToast("posted — it’s live as advisory. tell your coursemates to confirm!");
      setForm({ title: "", venue: "", event_date: "", event_time: "", scope_type: "general", scope_value: "" });
      setShowPost(false);
      fetchFeed();
    } catch (e: any) {
      setToast(e.message);
    } finally {
      setPosting(false);
    }
  }

  async function vote(id: string, v: "YES" | "NO" | "CANCEL") {
    // need a verifier_id — try localStorage profile, else show hint
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

  return (
    <div className="space-y-4">
      {/* header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-slate-500">live timetable · advisory</p>
          <h1 className="mt-1 text-[22px] font-bold tracking-[-0.025em] text-white sm:text-[26px]">Where&apos;s class today?</h1>
          <p className="mt-1 max-w-[560px] text-[13.5px] leading-5 text-slate-400">
            Gist moves fast. Someone heard the LT changed — they post it here. You tap <span className="text-slate-200">Yes</span> if you showed up
            and it was real, <span className="text-slate-200">No</span> if you trekked and it was lies. Enough <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[11px] font-bold text-white">✓ green</span> and freshers stop missing class.
          </p>
        </div>
        <button
          onClick={() => setShowPost((v) => !v)}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-white px-5 py-2.5 text-[14px] font-semibold text-[#0a0f1e] shadow-[0_4px_20px_rgba(255,255,255,0.12)] hover:bg-slate-100 transition"
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0a0f1e] text-[12px] text-white">+</span>
          {showPost ? "Close" : "Post what you heard"}
        </button>
      </div>

      {/* explainer row */}
      <div className="grid gap-2 sm:grid-cols-3">
        {[
          ["Green tick = real", "Enough coursemates tapped Yes. Trust it — but still confirm exams officially."],
          ["Advisory = fresh gist", "Just posted, waiting for confirmations. Might be true, might be stale gist."],
          ["Your tap matters", "One Yes/No moves the needle. Ten of you decides the truth."],
        ].map(([t, d]) => (
          <div key={t} className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
            <p className="text-[13px] font-semibold text-white">{t}</p>
            <p className="mt-1 text-[12.5px] leading-4 text-slate-400">{d}</p>
          </div>
        ))}
      </div>

      {/* post form */}
      {showPost && (
        <form
          onSubmit={handlePost}
          className="rounded-[20px] border border-white/[0.08] bg-white/[0.04] p-4 backdrop-blur sm:p-5"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-[13px] font-semibold text-white">Post what you heard — keep it honest</h3>
            <span className="font-mono text-[10.5px] text-slate-500">advisory until confirmed</span>
          </div>
          <p className="mt-1 text-[12.5px] text-slate-400">Example: “ANA 203 moved to LT2, Friday 8am — HOD announced after lab.” No broadcast gist.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="font-mono text-[10.5px] uppercase tracking-wide text-slate-500">What</span>
              <input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="ANA 203 — Osteology revision"
                className="w-full rounded-xl border border-white/10 bg-[#0b1020] px-3 py-2.5 text-[14px] text-white placeholder:text-slate-500 focus:border-white/20 focus:outline-none"
              />
            </label>
            <label className="space-y-1">
              <span className="font-mono text-[10.5px] uppercase tracking-wide text-slate-500">Where</span>
              <input
                value={form.venue}
                onChange={(e) => setForm((f) => ({ ...f, venue: e.target.value }))}
                placeholder="LT2 / Anatomy Hall"
                className="w-full rounded-xl border border-white/10 bg-[#0b1020] px-3 py-2.5 text-[14px] text-white placeholder:text-slate-500 focus:border-white/20 focus:outline-none"
              />
            </label>
            <label className="space-y-1">
              <span className="font-mono text-[10.5px] uppercase tracking-wide text-slate-500">Date</span>
              <input
                type="date"
                value={form.event_date}
                onChange={(e) => setForm((f) => ({ ...f, event_date: e.target.value }))}
                className="w-full rounded-xl border border-white/10 bg-[#0b1020] px-3 py-2.5 text-[14px] text-white focus:border-white/20 focus:outline-none"
              />
            </label>
            <label className="space-y-1">
              <span className="font-mono text-[10.5px] uppercase tracking-wide text-slate-500">Time</span>
              <input
                type="time"
                value={form.event_time}
                onChange={(e) => setForm((f) => ({ ...f, event_time: e.target.value }))}
                className="w-full rounded-xl border border-white/10 bg-[#0b1020] px-3 py-2.5 text-[14px] text-white focus:border-white/20 focus:outline-none"
              />
            </label>
            <label className="space-y-1">
              <span className="font-mono text-[10.5px] uppercase tracking-wide text-slate-500">Who needs this</span>
              <select
                value={form.scope_type}
                onChange={(e) => setForm((f) => ({ ...f, scope_type: e.target.value }))}
                className="w-full rounded-xl border border-white/10 bg-[#0b1020] px-3 py-2.5 text-[14px] text-white focus:border-white/20 focus:outline-none"
              >
                <option value="general">Everyone (general gist)</option>
                <option value="level">One level (e.g. 200L)</option>
                <option value="group">Group / dept</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="font-mono text-[10.5px] uppercase tracking-wide text-slate-500">Scope detail (optional)</span>
              <input
                value={form.scope_value}
                onChange={(e) => setForm((f) => ({ ...f, scope_value: e.target.value }))}
                placeholder="200L or Physiology"
                className="w-full rounded-xl border border-white/10 bg-[#0b1020] px-3 py-2.5 text-[14px] text-white placeholder:text-slate-500 focus:border-white/20 focus:outline-none"
              />
            </label>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <button
              disabled={posting}
              className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-[14px] font-semibold text-[#0a0f1e] disabled:opacity-60"
            >
              {posting ? "Posting…" : "Post as advisory →"}
            </button>
            <p className="font-mono text-[11px] text-slate-500">shows instantly · green tick comes from votes</p>
          </div>
        </form>
      )}

      {/* filters */}
      <div className="flex items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.k}
            onClick={() => setFilter(f.k)}
            className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${
              filter === f.k ? "bg-white text-[#0a0f1e]" : "border border-white/10 bg-white/[0.04] text-slate-400 hover:text-white"
            }`}
          >
            {f.label}
          </button>
        ))}
        <button
          onClick={fetchFeed}
          className="ml-auto font-mono text-[11px] text-slate-500 hover:text-slate-300"
        >
          ↻ refresh
        </button>
      </div>

      {/* feed */}
      {loading ? (
        <div className="grid gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="animate-pulse rounded-[18px] border border-white/[0.06] bg-white/[0.03] p-4">
              <div className="h-4 w-2/3 rounded bg-white/10" />
              <div className="mt-3 h-3 w-1/2 rounded bg-white/5" />
            </div>
          ))}
        </div>
      ) : err ? (
        <div className="rounded-[18px] border border-red-400/20 bg-red-400/10 p-5 text-center">
          <p className="text-[14px] font-medium text-red-200">feed is down</p>
          <p className="mt-1 font-mono text-[12px] text-red-200/70">{err}</p>
          <button onClick={fetchFeed} className="mt-3 rounded-full bg-white px-4 py-1.5 text-[13px] font-semibold text-[#0a0f1e]">
            try again
          </button>
        </div>
      ) : events.length === 0 ? (
        <div className="rounded-[20px] border border-dashed border-white/10 bg-white/[0.02] px-6 py-12 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.06] text-lg">◐</div>
          <p className="mt-3 text-[15px] font-semibold text-white">No gist yet</p>
          <p className="mx-auto mt-1 max-w-[420px] text-[13.5px] leading-5 text-slate-400">
            Be the first to post. Heard a venue change, a time shift, even a “lecturer said maybe next week”? Drop it — your coursemates will sort truth from gist.
          </p>
          <button onClick={() => setShowPost(true)} className="mt-4 rounded-full bg-white px-5 py-2 text-[13px] font-semibold text-[#0a0f1e]">
            Post the first gist
          </button>
        </div>
      ) : (
        <div className="grid gap-3">
          {events.map((ev) => {
            const ap = Number(ev.authority_points ?? 0);
            const rp = Number(ev.required_points ?? 0);
            const verified = ev.status === "verified" || (rp > 0 && ap >= rp);
            const pct = rp > 0 ? Math.min(100, Math.round((ap / rp) * 100)) : ev.status === "verified" ? 100 : 0;
            const d = ev.event_date ? new Date(ev.event_date).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" }) : ev.event_date;
            return (
              <article
                key={ev.id}
                className={`group relative overflow-hidden rounded-[18px] border p-4 transition sm:p-5 ${
                  verified
                    ? "border-emerald-400/25 bg-gradient-to-br from-emerald-500/[0.08] to-white/[0.03]"
                    : "border-white/[0.06] bg-white/[0.03] hover:border-white/[0.10]"
                }`}
              >
                {/* progress bar for non-verified */}
                {!verified && rp > 0 && (
                  <div className="absolute left-0 right-0 top-0 h-[3px] bg-white/5">
                    <div className="h-full bg-emerald-400 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                )}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill status={ev.status} verified={verified} />
                      {ev.scope_value && (
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 font-mono text-[11px] text-slate-400">
                          {ev.scope_type} · {ev.scope_value}
                        </span>
                      )}
                      {!ev.scope_value && (
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 font-mono text-[11px] text-slate-400">{ev.scope_type}</span>
                      )}
                    </div>
                    <h3 className="mt-2 truncate text-[15px] font-semibold leading-tight text-white sm:text-[16px]">{ev.title}</h3>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-slate-400">
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2.5 py-1 text-[12px] text-slate-200">📍 {ev.venue}</span>
                      <span className="font-mono text-[12px] text-slate-500">{d} · {String(ev.event_time).slice(0, 5)}</span>
                    </p>
                    {rp > 0 && (
                      <p className="mt-2 font-mono text-[11px] text-slate-500">
                        {verified ? (
                          <span className="text-emerald-300">✓ confirmed — {ap} / {rp} points</span>
                        ) : (
                          <span>{ap} / {rp} points · {pct}% to green tick</span>
                        )}
                      </p>
                    )}
                  </div>
                  <div className="hidden shrink-0 text-right font-mono text-[10.5px] text-slate-500 sm:block">
                    {new Date(ev.created_at).toLocaleDateString("en-GB")}
                  </div>
                </div>

                {/* were you there? */}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] uppercase tracking-wide text-slate-500">Were you there?</span>
                  <div className="flex items-center gap-1.5">
                    {[
                      ["YES", "Yes ✓", "bg-emerald-500 text-white border-emerald-500"],
                      ["NO", "No ✕", "bg-white text-[#0a0f1e] border-white"],
                      ["CANCEL", "Skip", "bg-transparent text-slate-400 border-white/15 hover:text-white"],
                    ].map(([k, label, cls]) => (
                      <button
                        key={k}
                        onClick={() => vote(ev.id, k as any)}
                        disabled={!!voteBusy}
                        className={`rounded-full border px-3 py-1.5 text-[13px] font-medium transition disabled:opacity-50 ${k === "YES" ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500 hover:text-white hover:border-emerald-500" : k === "NO" ? "border-white/10 bg-white/[0.05] text-slate-200 hover:bg-white hover:text-[#0a0f1e]" : "border-white/10 bg-white/[0.02] text-slate-400 hover:bg-white/[0.08] hover:text-white"}`}
                      >
                        {voteBusy === ev.id + k ? "…" : label}
                      </button>
                    ))}
                  </div>
                  <span className="font-mono text-[11px] text-slate-600">no essay — one tap</span>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="rounded-2xl border border-amber-400/10 bg-amber-400/[0.04] px-4 py-3">
        <p className="font-mono text-[11px] leading-4 text-amber-200/70">
          Heads up: this is student gist, not an official circular. Green tick just means your coursemates confirmed it with their own eyes. For exams, tests, or anything that can carry over — confirm with your course rep or department notice board.
        </p>
      </div>

      {toast && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full border border-white/10 bg-[#0f172a] px-4 py-2 text-[13px] font-medium text-white shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
          {toast}
        </div>
      )}
    </div>
  );
}
