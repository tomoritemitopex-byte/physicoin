"use client";
import { useEffect, useState, useCallback } from "react";
import { autoBumpStreak } from "@/lib/streak";

type QuizStep = 0 | 1 | 2 | 3 | 4;

const TITLES = ["ANA 203", "BIO 101", "CHM 101", "PHS 201", "Other"];
const VENUES = ["LT1", "LT2", "ETF", "Hall B", "Anatomy Hall"];
const SEVERITY_OPTS = [
  { id: "move", label: "Moved", sub: "new hall", color: "bg-sky text-white", dot: "bg-sky" },
  { id: "shift", label: "Shifted", sub: "new time", color: "bg-amber-500 text-white", dot: "bg-amber-500" },
  { id: "cancelled", label: "Cancelled", sub: "no class", color: "bg-red-500 text-white", dot: "bg-red-500" },
] as const;

function todayISO(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
function tomorrowISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function getProfile(): { id: string | null; level: string | null; programme: string | null } {
  try {
    const raw = localStorage.getItem("physi_profile");
    if (!raw) return { id: null, level: null, programme: null };
    const p = JSON.parse(raw);
    return { id: p?.id ?? null, level: p?.level ?? null, programme: p?.programme ?? null };
  } catch { return { id: null, level: null, programme: null }; }
}

async function ensureSession(userId: string): Promise<string | null> {
  // try existing cookie/token via GET
  try {
    const r = await fetch("/api/auth/session", { method: "GET", cache: "no-store" });
    const j = await r.json().catch(() => ({} as any));
    if (r.ok && j.authenticated && j.user_id === userId) {
      // already authenticated via cookie
      return j.token ?? "cookie";
    }
  } catch {}
  // create new session
  try {
    const r = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    });
    const j = await r.json().catch(() => ({} as any));
    if (r.ok && j.token) return j.token;
    if (r.ok && j.ok) return "cookie";
  } catch {}
  return null;
}

function addXp(amount: number, label: string) {
  try {
    const raw = localStorage.getItem("physi_profile");
    if (raw) {
      const p = JSON.parse(raw);
      const cur = Number(p.mining_balance ?? 0);
      p.mining_balance = Number((cur + amount).toFixed(2));
      localStorage.setItem("physi_profile", JSON.stringify(p));
    }
    const isFirst = !localStorage.getItem("physi_first_gist_done");
    if (label.includes("gist") && isFirst) {
      localStorage.setItem("physi_first_gist_done", "1");
    }
    window.dispatchEvent(new CustomEvent("physi-earn", { detail: label }));
  } catch {}
  try { autoBumpStreak("event_post"); } catch {}
}

export default function QuizPost({ onPosted }: { onPosted?: () => void }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<QuizStep>(0);
  const [title, setTitle] = useState("");
  const [customTitle, setCustomTitle] = useState("");
  const [venue, setVenue] = useState("");
  const [customVenue, setCustomVenue] = useState("");
  const [dateOpt, setDateOpt] = useState<"today" | "tomorrow" | "custom">("today");
  const [customDate, setCustomDate] = useState("");
  const [severity, setSeverity] = useState<"move" | "shift" | "cancelled">("move");
  const [posting, setPosting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showXp, setShowXp] = useState<string | null>(null);
  const [animateStep, setAnimateStep] = useState(false);

  // progress 0-100
  const totalSteps = 4;
  const progress = step === 0 ? 8 : Math.round((step / totalSteps) * 100);

  useEffect(() => { if (showXp) { const t = setTimeout(() => setShowXp(null), 2200); return () => clearTimeout(t); } }, [showXp]);
  useEffect(() => {
    if (open) {
      setAnimateStep(true);
      const t = setTimeout(() => setAnimateStep(false), 280);
      return () => clearTimeout(t);
    }
  }, [step, open]);

  const reset = useCallback(() => {
    setStep(0); setTitle(""); setCustomTitle(""); setVenue(""); setCustomVenue("");
    setDateOpt("today"); setCustomDate(""); setSeverity("move"); setPosting(false); setErr(null);
  }, []);

  const openQuiz = () => { reset(); setOpen(true); setStep(1); };
  const closeQuiz = () => { setOpen(false); setTimeout(reset, 300); };

  async function handlePost() {
    const finalTitle = title === "Other" ? customTitle.trim() : title.trim();
    const finalVenue = venue.trim() || customVenue.trim();
    if (!finalTitle || !finalVenue) { setErr("Pick what + where — one tap each"); return; }
    const { id: profileId, level } = getProfile();
    if (!profileId) {
      setErr("Create a handle first — 10s");
      try { window.dispatchEvent(new CustomEvent("physi-needs-profile")); } catch {}
      return;
    }
    const dateStr = dateOpt === "today" ? todayISO() : dateOpt === "tomorrow" ? tomorrowISO() : (customDate || todayISO());
    const timeStr = "08:00";
    const scope_type = level ? "level" : "general";
    const scope_value = level ?? null;

    setPosting(true); setErr(null);
    try {
      const sess = await ensureSession(profileId);
      if (!sess) { setErr("Auth failed — refresh and try again"); setPosting(false); return; }
      // POST to /api/timetable — token is in cookie after ensureSession, but also send Authorization if we have it
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (sess !== "cookie") headers["authorization"] = `Bearer ${sess}`;
      const r = await fetch("/api/timetable", {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: finalTitle,
          venue: finalVenue,
          event_date: dateStr,
          event_time: timeStr,
          scope_type,
          scope_value,
          severity,
          created_by: profileId,
        }),
      });
      const j = await r.json().catch(() => ({} as any));
      if (j.code === "DUPLICATE_SUGGESTION" || r.status === 409) {
        setErr(j.duplicate_suggestion?.hint || "Looks like duplicate — try another hall or tap Post anyway in feed");
        setPosting(false);
        return;
      }
      if (!r.ok || j.ok === false) throw new Error(j.error || j.message || "post failed");
      const isFirst = !localStorage.getItem("physi_first_gist_done");
      const xpLabel = isFirst ? "+5 XP · first gist" : "+1 XP · gist posted";
      const xpAmount = isFirst ? 5 : 1;
      addXp(xpAmount, isFirst ? "Earned +5 $PHY for first gist" : "+1 XP");
      setShowXp(xpLabel);
      setStep(4 as any);
      setTimeout(() => { closeQuiz(); onPosted?.(); try { window.location.reload(); } catch {} }, 1200);
    } catch (e: any) {
      setErr(e.message || "couldn't post — try again");
    } finally { setPosting(false); }
  }

  return (
    <>
      {/* trigger — replaces old Post link, single primary thumb action */}
      <button
        onClick={openQuiz}
        className="inline-flex items-center gap-1.5 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-[#07111f] shadow-lg hover:scale-[1.02] active:scale-[0.98] transition"
        aria-label="Post gist — 1-tap quiz"
      >
        <span className="text-[18px] leading-none">+</span> Post gist
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true">
          <button onClick={closeQuiz} aria-label="Close" className="absolute inset-0 bg-[#040A18]/75 backdrop-blur-[6px]" />
          <div className={`relative w-full sm:max-w-[440px] max-h-[88vh] overflow-hidden rounded-t-[20px] sm:rounded-[20px] border border-white/10 bg-[#0d1b2e] shadow-[0_24px_64px_rgba(0,0,0,0.5)] flex flex-col ${animateStep ? "scale-[0.99]" : "scale-100"} transition duration-200`}>
            {/* progress */}
            <div className="h-1.5 w-full bg-white/10">
              <div className="h-full bg-[var(--physi-cyan)] transition-all duration-400 ease-out" style={{ width: `${progress}%` }} />
            </div>
            <div className="flex items-center justify-between px-5 pt-4">
              <span className="font-mono text-[11px] tracking-[0.1em] text-white/50 uppercase">Step {Math.min(step, totalSteps)} of {totalSteps} · {progress}%</span>
              <button onClick={closeQuiz} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-xs text-white/70 hover:bg-white hover:text-black transition">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {step === 1 && (
                <div className="animate-in fade-in slide-in-from-bottom-1 duration-200">
                  <p className="text-[18px] font-bold leading-tight text-white">What did you hear?</p>
                  <p className="mt-1 font-mono text-xs text-white/50">One tap — which gist moved?</p>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {TITLES.map((t) => (
                      <button
                        key={t}
                        onClick={() => { setTitle(t); setTimeout(() => setStep(2), 180); }}
                        className={`rounded-2xl border px-4 py-4 text-left font-semibold transition active:scale-[0.97] ${title === t ? "border-[var(--physi-cyan)] bg-[var(--physi-cyan)] text-[#04101c] scale-[1.02]" : "border-white/10 bg-white/[0.04] text-white hover:border-white/15 hover:bg-white/[0.06]"}`}
                      >
                        <span className="block text-[15px]">{t === "Other" ? "✎ Other…" : t}</span>
                        <span className="font-mono text-[11px] opacity-60">{t === "Other" ? "type it" : "tap to pick"}</span>
                      </button>
                    ))}
                  </div>
                  {title === "Other" && (
                    <div className="mt-3">
                      <input value={customTitle} onChange={(e) => setCustomTitle(e.target.value)} placeholder="e.g. ANA 203 — Osteology" autoFocus className="w-full rounded-xl border border-white/10 bg-[#081526] px-3 py-3 text-sm text-white placeholder:text-white/30 focus:border-[var(--physi-cyan)] focus:outline-none" />
                      <button onClick={() => customTitle.trim() && setStep(2)} disabled={!customTitle.trim()} className="mt-2 w-full rounded-full bg-white py-2.5 text-sm font-bold text-[#07111f] disabled:opacity-40">Next →</button>
                    </div>
                  )}
                  <p className="mt-3 text-center font-mono text-[11px] text-white/30">Progress saves — you can change later</p>
                </div>
              )}

              {step === 2 && (
                <div className="animate-in fade-in slide-in-from-bottom-1 duration-200">
                  <p className="text-[18px] font-bold leading-tight text-white">Where did it move?</p>
                  <p className="mt-1 font-mono text-xs text-white/50">One tap — pick the hall</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {VENUES.map((v) => (
                      <button
                        key={v}
                        onClick={() => { setVenue(v); setTimeout(() => setStep(3), 180); }}
                        className={`rounded-full px-5 py-3 text-sm font-bold transition active:scale-[0.97] ${venue === v ? "bg-white text-[#07111f] shadow" : "border border-white/10 bg-white/[0.04] text-white hover:bg-white hover:text-[#07111f]"}`}
                        style={{ minHeight: 44 }}
                      >
                        {v}
                      </button>
                    ))}
                    <button onClick={closeQuiz} className="rounded-full border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-semibold text-white/60 hover:bg-white/10" style={{ minHeight: 44 }}>Not mine ✕</button>
                  </div>
                  <div className="mt-4">
                    <p className="font-mono text-xs text-white/40">Or type hall</p>
                    <div className="mt-2 flex gap-2">
                      <input value={customVenue} onChange={(e) => setCustomVenue(e.target.value)} placeholder="e.g. LT5" className="flex-1 rounded-xl border border-white/10 bg-[#081526] px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-white/20 focus:outline-none" />
                      {customVenue.trim() && <button onClick={() => { setVenue(customVenue.trim()); setStep(3); }} className="rounded-full bg-white px-4 py-2 text-sm font-bold text-[#07111f]">Use</button>}
                    </div>
                  </div>
                  <button onClick={() => setStep(1)} className="mt-4 font-mono text-xs text-white/40 hover:text-white">← back</button>
                </div>
              )}

              {step === 3 && (
                <div className="animate-in fade-in slide-in-from-bottom-1 duration-200">
                  <p className="text-[18px] font-bold leading-tight text-white">When is it?</p>
                  <p className="mt-1 font-mono text-xs text-white/50">One tap — we auto-fill 8am</p>
                  <div className="mt-4 grid gap-2">
                    {[
                      { k: "today", label: "Today · 8am", sub: todayISO() },
                      { k: "tomorrow", label: "Tomorrow · 8am", sub: tomorrowISO() },
                    ].map((o) => (
                      <button key={o.k} onClick={() => { setDateOpt(o.k as any); setTimeout(() => setStep(4 as any), 180); }} className={`rounded-2xl border px-4 py-3 text-left transition active:scale-[0.98] ${dateOpt === o.k ? "border-[var(--physi-cyan)] bg-[var(--physi-cyan)]/10" : "border-white/10 bg-white/[0.04] hover:bg-white/[0.06]"}`}>
                        <span className="block text-sm font-bold text-white">{o.label}</span>
                        <span className="font-mono text-xs text-white/50">{o.sub}</span>
                      </button>
                    ))}
                    <label className={`rounded-2xl border px-4 py-3 text-left transition ${dateOpt === "custom" ? "border-[var(--physi-cyan)] bg-[var(--physi-cyan)]/10" : "border-white/10 bg-white/[0.04]"}`}>
                      <span className="block text-sm font-bold text-white">Pick date</span>
                      <input type="date" value={customDate} onChange={(e) => { setCustomDate(e.target.value); setDateOpt("custom"); }} className="mt-2 w-full rounded-xl border border-white/10 bg-[#081526] px-3 py-2 text-sm text-white" />
                      {dateOpt === "custom" && customDate && <button onClick={() => setStep(4 as any)} className="mt-2 w-full rounded-full bg-white py-2 text-sm font-bold text-[#07111f]">Next →</button>}
                    </label>
                  </div>
                  <button onClick={() => setStep(2)} className="mt-4 font-mono text-xs text-white/40 hover:text-white">← back</button>
                </div>
              )}

              {(step as number) === 4 && (
                <div className="animate-in fade-in slide-in-from-bottom-1 duration-200">
                  <p className="text-[18px] font-bold leading-tight text-white">How urgent?</p>
                  <p className="mt-1 font-mono text-xs text-white/50">One tap — color tells friends</p>
                  <div className="mt-4 grid gap-2">
                    {SEVERITY_OPTS.map((s) => (
                      <button key={s.id} onClick={() => setSeverity(s.id as any)} className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition active:scale-[0.98] ${severity === s.id ? "border-white bg-white text-[#07111f] shadow" : "border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.06]"}`}>
                        <span className={`h-3 w-3 rounded-full ${s.dot}`} />
                        <span className="flex-1">
                          <span className="block text-sm font-bold">{s.label}</span>
                          <span className="font-mono text-xs opacity-60">{s.sub}</span>
                        </span>
                        {severity === s.id && <span className="rounded-full bg-[#07111f] px-2 py-1 font-mono text-xs font-bold text-white">✓</span>}
                      </button>
                    ))}
                  </div>

                  {/* summary clean screen — one bar not table */}
                  <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                    <p className="font-mono text-[11px] uppercase tracking-wide text-white/40">You picked</p>
                    <p className="mt-1 text-[15px] font-bold text-white">📍 {(venue || customVenue || "—") + " · " + (title === "Other" ? (customTitle || "—") : title || "—")}</p>
                    <p className="font-mono text-xs text-white/50">{dateOpt === "today" ? todayISO() : dateOpt === "tomorrow" ? tomorrowISO() : customDate || todayISO()} · 08:00 · {severity}</p>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[var(--physi-cyan)]" style={{ width: "100%" }} /></div>
                    <p className="mt-1 font-mono text-[11px] text-white/40">Ready → one green tick needs your coursemates</p>
                  </div>

                  {err && <p className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">{err}</p>}
                  <div className="mt-4 flex gap-2">
                    <button onClick={handlePost} disabled={posting} className="flex-1 rounded-full bg-white py-3 text-sm font-bold text-[#07111f] hover:bg-white/90 disabled:opacity-50 active:scale-[0.98] transition">
                      {posting ? "Posting…" : "Post as advisory →"}
                    </button>
                    <button onClick={() => setStep(3)} className="rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-sm text-white/70">← back</button>
                  </div>
                </div>
              )}
            </div>

            {/* XP floating bubble */}
            {showXp && (
              <div className="pointer-events-none absolute left-1/2 top-5 -translate-x-1/2 rounded-full bg-[#b9f66a] px-4 py-2 font-mono text-sm font-black text-[#07111f] shadow-[0_8px_24px_rgba(185,246,106,0.4)] animate-bounce">
                {showXp}
              </div>
            )}
            <p className="border-t border-white/5 px-5 py-3 text-center font-mono text-[11px] text-white/30">POST → /api/timetable · session cookie · $PHY = XP (single number)</p>
          </div>
        </div>
      )}
    </>
  );
}
