"use client";
import { useEffect, useState, useCallback } from "react";
import { logError, getErrorMessage } from "@/lib/adapters/error";

type StoredProfile = {
  id: string;
  nickname: string;
  full_name: string;
  programme: string;
  level: string;
  authority_final: number | string;
  authority_base: number | string;
  mining_balance?: number | string;
};

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

export default function VerifyPage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [profile, setProfile] = useState<StoredProfile | null>(null);
  const [profileChecked, setProfileChecked] = useState(false);
  const [voteBusy, setVoteBusy] = useState<string | null>(null);
  const [voted, setVoted] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("physi_profile");
      if (raw) {
        const p = JSON.parse(raw) as StoredProfile;
        if (p?.id && p?.nickname) setProfile(p);
      }
    } catch {}
    setProfileChecked(true);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/timetable?status=pending", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || j.ok === false) throw new Error(j.error || j.hint || "couldn't load queue");
      setEvents(j.events ?? []);
    } catch (e: unknown) {
      logError("VERIFY_FETCH_FAILED", e, { page: "verify" });
      setErr(getErrorMessage("VERIFY_FETCH_FAILED"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  async function vote(eventId: string, v: "YES" | "NO" | "CANCEL") {
    if (!profile?.id) {
      setToast("pick a handle first — we need it to count your vote");
      return;
    }
    setVoteBusy(eventId + v);
    try {
      const r = await fetch("/api/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ verifier_id: profile.id, event_id: eventId, vote: v }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.ok === false) throw new Error(j.error || j.hint || "vote failed");
      setVoted((prev) => ({ ...prev, [eventId]: v }));
      const weight = Number(profile.authority_final ?? 1).toFixed(2);
      if (v === "YES") setToast(`Yes — +${weight} toward green tick. Thanks for confirming!`);
      else if (v === "NO") setToast("No — noted. Helps stop stale gist from spreading.");
      else setToast("Skipped — no worries, next one.");
      // refresh queue to show updated authority_points
      fetchQueue();
    } catch (e: unknown) {
      logError("VERIFY_SUBMIT_FAILED", e, { page: "verify" });
      setToast(getErrorMessage("VERIFY_SUBMIT_FAILED"));
    } finally {
      setVoteBusy(null);
    }
  }

  const weight = profile ? Number(profile.authority_final ?? 1).toFixed(2) : "—";
  const pendingCount = events.length;

  return (
    <div className="space-y-4">
      {/* header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-slate-500">
            verify · advisory queue
          </p>
          <h1 className="mt-1 text-[22px] font-bold tracking-[-0.025em] text-white sm:text-[26px]">
            Were you there?
          </h1>
          <p className="mt-1 max-w-[580px] text-[13.5px] leading-5 text-slate-400">
            Gist lands here as <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-1.5 py-0.5 font-mono text-[11px] text-amber-200">advisory</span> until enough coursemates weigh in.
            One tap — <span className="text-slate-200">Yes</span> if you saw it live, <span className="text-slate-200">No</span> if you trekked and it was lies,{" "}
            <span className="text-slate-200">Cancel</span> to skip. Enough <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[11px] font-bold text-white">✓ green</span> and the feed stops guessing.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden sm:inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.03] px-3 py-1.5 font-mono text-[11px] text-slate-400">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            {loading ? "loading…" : `${pendingCount} pending`}
          </span>
          <button
            onClick={fetchQueue}
            className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[13px] font-medium text-slate-200 hover:bg-white/[0.08] hover:text-white transition"
          >
            ↻ refresh
          </button>
        </div>
      </div>

      {/* profile gate / authority strip */}
      {!profileChecked ? (
        <div className="h-16 animate-pulse rounded-[18px] border border-white/[0.06] bg-white/[0.03]" />
      ) : !profile ? (
        <div className="flex flex-col gap-3 rounded-[18px] border border-amber-400/20 bg-amber-400/[0.06] p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <p className="text-[14px] font-semibold text-white">You need a handle to verify</p>
            <p className="mt-0.5 text-[13px] leading-4 text-amber-100/70">
              We store your vote as <code className="rounded bg-white/10 px-1 py-0.5 font-mono text-[11px]">physi_profile</code> so your Yes counts toward the green tick. Takes 20 seconds.
            </p>
          </div>
          <a
            href="/app/profile"
            className="inline-flex shrink-0 items-center justify-center rounded-full bg-white px-5 py-2.5 text-[14px] font-semibold text-[#070a12] shadow-[0_4px_20px_rgba(255,255,255,0.12)] hover:bg-slate-100 transition"
          >
            Create handle →
          </a>
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-[18px] border border-white/[0.07] bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[12px] font-black text-[#070a12]">
              {(profile.nickname?.[0] ?? "?").toUpperCase()}
            </div>
            <div>
              <p className="text-[14px] font-semibold text-white">
                @{profile.nickname} <span className="font-normal text-slate-400">· {profile.level} · {profile.programme}</span>
              </p>
              <p className="font-mono text-[11px] text-slate-400">
                your vote weight <span className="font-bold text-white">{weight}</span> · every Yes/No adds this much toward the tick
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 font-mono text-[11px] text-emerald-200">
              {pendingCount} in queue
            </div>
            <a href="/app/timetable" className="font-mono text-[11px] text-slate-500 hover:text-slate-300">
              view full feed →
            </a>
          </div>
        </div>
      )}

      {/* how it works */}
      <div className="grid gap-2 sm:grid-cols-3">
        {[
          ["Tap honestly", "Only Yes if you were in the hall and it ran. No if you went and nothing happened."],
          ["Weight matters", `Your handle carries ${weight} points. Senior reps and daily check-ins nudge it up.`],
          ["Queue clears fast", "Ten honest taps usually settles it — then the post gets that green tick."],
        ].map(([t, d]) => (
          <div key={t} className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
            <p className="text-[13px] font-semibold text-white">{t}</p>
            <p className="mt-1 text-[12.5px] leading-4 text-slate-400">{d}</p>
          </div>
        ))}
      </div>

      {/* queue */}
      {loading ? (
        <div className="grid gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="animate-pulse rounded-[18px] border border-white/[0.06] bg-white/[0.03] p-5">
              <div className="h-4 w-2/3 rounded bg-white/10" />
              <div className="mt-3 h-3 w-1/2 rounded bg-white/5" />
              <div className="mt-4 h-8 w-40 rounded-full bg-white/5" />
            </div>
          ))}
        </div>
      ) : err ? (
        <div className="rounded-[18px] border border-red-400/20 bg-red-400/10 p-6 text-center">
          <p className="text-[14px] font-medium text-red-200">queue is down</p>
          <p className="mt-1 font-mono text-[12px] text-red-200/70">{err || "Something went wrong. Please try again."}</p>
          <button onClick={fetchQueue} className="mt-3 rounded-full bg-white px-4 py-1.5 text-[13px] font-semibold text-[#070a12]">
            try again
          </button>
        </div>
      ) : events.length === 0 ? (
        <div className="rounded-[20px] border border-dashed border-white/10 bg-white/[0.02] px-6 py-12 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.06] text-lg">✓</div>
          <p className="mt-3 text-[15px] font-semibold text-white">All caught up</p>
          <p className="mx-auto mt-1 max-w-[440px] text-[13.5px] leading-5 text-slate-400">
            No advisory gist waiting right now. That means everything in the feed is either green-ticked or nothing new has been posted. Check back after lectures — or be the one to post what you heard.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <a href="/app/timetable" className="rounded-full bg-white px-5 py-2 text-[13px] font-semibold text-[#070a12]">
              Go to timetable
            </a>
            <button onClick={fetchQueue} className="rounded-full border border-white/10 bg-white/[0.04] px-5 py-2 text-[13px] font-medium text-slate-200 hover:bg-white/[0.08]">
              ↻ recheck queue
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-3">
          {events.map((ev) => {
            const ap = Number(ev.authority_points ?? 0);
            const rp = Number(ev.required_points ?? 0);
            const pct = rp > 0 ? Math.min(100, Math.round((ap / rp) * 100)) : 0;
            const d = ev.event_date
              ? new Date(ev.event_date).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" })
              : ev.event_date;
            const votedVal = voted[ev.id];
            return (
              <article
                key={ev.id}
                className="group relative overflow-hidden rounded-[18px] border border-white/[0.06] bg-white/[0.03] p-4 backdrop-blur transition hover:border-white/[0.10] sm:p-5"
              >
                {rp > 0 && (
                  <div className="absolute left-0 right-0 top-0 h-[3px] bg-white/5">
                    <div className="h-full bg-emerald-400 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                )}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/20 bg-amber-400/10 px-2.5 py-1 font-mono text-[11px] font-medium text-amber-200">
                        ● advisory
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 font-mono text-[11px] text-slate-400">
                        {ev.scope_value ? `${ev.scope_type} · ${ev.scope_value}` : ev.scope_type}
                      </span>
                      <span className="hidden sm:inline font-mono text-[11px] text-slate-600">
                        {new Date(ev.created_at).toLocaleDateString("en-GB")} · waiting for taps
                      </span>
                    </div>
                    <h3 className="mt-2 truncate text-[15px] font-semibold leading-tight text-white sm:text-[16px]">{ev.title}</h3>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-slate-400">
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2.5 py-1 text-[12px] text-slate-200">📍 {ev.venue}</span>
                      <span className="font-mono text-[12px] text-slate-500">
                        {d} · {String(ev.event_time).slice(0, 5)}
                      </span>
                    </p>
                    {rp > 0 ? (
                      <p className="mt-2 font-mono text-[11px] text-slate-500">
                        <span className="text-slate-300">{ap.toFixed(2)} / {rp.toFixed(2)} points</span> · {pct}% to green tick
                        {profile && <span className="text-slate-600"> · your tap = +{weight}</span>}
                      </p>
                    ) : (
                      <p className="mt-2 font-mono text-[11px] text-slate-500">
                        {ap.toFixed(2)} points so far · {profile ? `your tap adds ${weight}` : "create a handle to add weight"}
                      </p>
                    )}
                  </div>
                </div>

                {/* voting row */}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] uppercase tracking-wide text-slate-500">Were you there?</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => vote(ev.id, "YES")}
                      disabled={!!voteBusy || !profile}
                      title={!profile ? "create a handle on /app/profile first" : "Yes, I was there and this is accurate"}
                      className={`rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition disabled:opacity-50 ${
                        votedVal === "YES"
                          ? "border-emerald-500 bg-emerald-500 text-white"
                          : "border-emerald-500/25 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500 hover:text-white hover:border-emerald-500"
                      }`}
                    >
                      {voteBusy === ev.id + "YES" ? "…" : votedVal === "YES" ? "✓ Yes" : "Yes ✓"}
                    </button>
                    <button
                      onClick={() => vote(ev.id, "NO")}
                      disabled={!!voteBusy || !profile}
                      title={!profile ? "create a handle first" : "No, I checked and this didn't happen"}
                      className={`rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition disabled:opacity-50 ${
                        votedVal === "NO"
                          ? "border-white bg-white text-[#070a12]"
                          : "border-white/10 bg-white/[0.05] text-slate-200 hover:bg-white hover:text-[#070a12]"
                      }`}
                    >
                      {voteBusy === ev.id + "NO" ? "…" : votedVal === "NO" ? "✓ No" : "No ✕"}
                    </button>
                    <button
                      onClick={() => vote(ev.id, "CANCEL")}
                      disabled={!!voteBusy || !profile}
                      title={!profile ? "create a handle first" : "Skip this one"}
                      className={`rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition disabled:opacity-50 ${
                        votedVal === "CANCEL"
                          ? "border-white/30 bg-white/[0.12] text-white"
                          : "border-white/10 bg-white/[0.02] text-slate-400 hover:bg-white/[0.08] hover:text-white"
                      }`}
                    >
                      {voteBusy === ev.id + "CANCEL" ? "…" : votedVal === "CANCEL" ? "✓ Skipped" : "Skip"}
                    </button>
                  </div>
                  {!profile && (
                    <a href="/app/profile" className="font-mono text-[11px] text-amber-200/70 hover:text-amber-200">
                      → create handle to vote
                    </a>
                  )}
                  {profile && !votedVal && <span className="font-mono text-[11px] text-slate-600">one tap · no essay</span>}
                  {votedVal && <span className="font-mono text-[11px] text-emerald-300/80">recorded — you can change it</span>}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="rounded-2xl border border-amber-400/10 bg-amber-400/[0.04] px-4 py-3">
        <p className="font-mono text-[11px] leading-4 text-amber-200/70">
          Student gist, not a circular. Verify means “I was there” — don&apos;t tap Yes from gist. For exams or carry-overs, confirm with your course rep or department board. Your handle&apos;s weight ({profile ? weight : "1.00"}) is how PHYSI knows who to trust.
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
