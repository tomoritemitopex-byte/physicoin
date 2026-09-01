/**
 * components/VoiceGossipFab.tsx — Mind-gossip voice STT
 * Hold FAB 1.5s → whisper mode 3s auto capture, STT via Web Speech API, auto severity, anon by default.
 * Graceful fallback: if no SpeechRecognition, shows text whisper input.
 * Groundbreaking: auto-parse COURSE/VENUE/TIME/SEVERITY, prefill FAB modal anon #7F3A, fusion x2, no typing.
 */
"use client";
import { useEffect, useRef, useState } from "react";
import { anonHash, GHOST_DOT_BG } from "@/lib/fusion";

// auto severity from transcript
function inferSeverity(text: string): "" | "move" | "shift" | "cancelled" {
  const t = String(text).toLowerCase();
  if (/(cancel|cancelled|no class|called off)/.test(t)) return "cancelled";
  if (/(shift|delay|postpone|later|move.*time|time change)/.test(t)) return "shift";
  if (/(move|change.*venue|venue.*change|hall.*change|lt.*to|room.*change)/.test(t)) return "move";
  if (t.length > 8) return "move";
  return "";
}

function parseCourse(text: string): string {
  const m = String(text).match(/\b([A-Z]{2,4})\s?(\d{3})\b/i);
  if (m) return `${m[1].toUpperCase()} ${m[2]}`;
  // fallback: 3-letter caps near numbers
  const m2 = String(text).match(/\b([A-Z]{3})\b/i);
  if (m2) return m2[0].toUpperCase();
  return "";
}
function parseVenue(text: string): string {
  const t = String(text);
  // LT2 -> LT5, Hall B, LT2, Room 101, Lab
  let m = t.match(/\bLT\s?(\d+[A-Z]?)\b/i);
  if (m) {
    const to = t.match(/to\s+LT\s?(\d+[A-Z]?)/i);
    if (to) return `LT${m[1].toUpperCase()} → LT${to[1].toUpperCase()}`;
    return `LT${m[1].toUpperCase()}`;
  }
  m = t.match(/\bHall\s*([A-Z]|\d+)/i);
  if (m) return `Hall ${m[1].toUpperCase()}`;
  m = t.match(/\b(Room|Lab|LT)\s*([A-Z0-9]+)/i);
  if (m) return `${m[1]} ${m[2]}`;
  // "at LT5" split
  const parts = t.split(/ at | in /i);
  if (parts.length >= 2) {
    const cand = parts[1].trim().split(/[, ]+/)[0];
    if (cand) return cand.slice(0, 18);
  }
  return "";
}
function parseTime(text: string): string {
  const t = String(text).toLowerCase();
  // 8am, 8:30 am, 14:00, 8 am
  let m = t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (m) {
    let h = parseInt(m[1], 10) || 0;
    const min = m[2] ? parseInt(m[2], 10) : 0;
    const ap = m[3];
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  }
  m = t.match(/\b(\d{1,2}):(\d{2})\b/);
  if (m) return `${m[1].padStart(2, "0")}:${m[2]}`;
  return "";
}

type Props = {
  onCreate: (data: { title: string; venue: string; event_date: string; event_time: string; severity: string; anonId?: string; transcript?: string }) => Promise<void> | void;
  anonId?: string;
  genAnonId?: () => string;
};

export default function VoiceGossipFab({ onCreate, anonId, genAnonId }: Props) {
  const [phase, setPhase] = useState<"idle" | "holding" | "listening" | "review">("idle");
  const [holdPct, setHoldPct] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [severity, setSeverity] = useState<"" | "move" | "shift" | "cancelled">("");
  const [venue, setVenue] = useState("");
  const [title, setTitle] = useState("");
  const [course, setCourse] = useState("");
  const [timeParsed, setTimeParsed] = useState("");
  const [listeningSecs, setListeningSecs] = useState(0);
  const holdTimerRef = useRef<any>(null);
  const holdStartRef = useRef<number>(0);
  const listenTimerRef = useRef<any>(null);
  const recogRef = useRef<any>(null);
  const [sttSupported, setSttSupported] = useState(true);

  const anonDisplay = anonId ? `#${anonHash(anonId)}` : "#7F3A";
  const anonBg = GHOST_DOT_BG;

  useEffect(() => {
    const SR: any = (typeof window !== "undefined" && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)) || null;
    setSttSupported(!!SR);
  }, []);

  useEffect(() => {
    if (phase === "listening") {
      const t = setInterval(() => setListeningSecs(s => s + 0.1), 100);
      listenTimerRef.current = t;
      const autoStop = setTimeout(() => stopListening(), 3000);
      return () => { clearInterval(t); clearTimeout(autoStop); };
    } else {
      clearInterval(listenTimerRef.current);
    }
  }, [phase]);

  function stopListening() {
    try { recogRef.current?.stop(); } catch {}
    setPhase(transcript ? "review" : "idle");
    setListeningSecs(0);
  }

  function startHold(e?: any) {
    if (e?.preventDefault) e.preventDefault();
    if (phase !== "idle") return;
    setPhase("holding");
    holdStartRef.current = Date.now();
    const tick = () => {
      const elapsed = Date.now() - holdStartRef.current;
      const pct = Math.min(100, (elapsed / 1500) * 100);
      setHoldPct(pct);
      if (pct >= 100) {
        clearInterval(holdTimerRef.current);
        startListening();
      }
    };
    holdTimerRef.current = setInterval(tick, 40);
    tick();
  }
  function cancelHold() {
    clearInterval(holdTimerRef.current);
    if (phase === "holding") { setPhase("idle"); setHoldPct(0); }
  }

  function applyParse(clean: string) {
    const sev = inferSeverity(clean);
    if (sev) setSeverity(sev);
    const c = parseCourse(clean);
    if (c) { setCourse(c); setTitle(c); }
    const v = parseVenue(clean);
    if (v) setVenue(v);
    const tm = parseTime(clean);
    if (tm) setTimeParsed(tm);
    // naive fallback if no course
    if (clean && !c) {
      const parts = clean.split(/ at | in /i);
      if (parts.length >= 2) { if (!c) setTitle(parts[0].slice(0, 40)); if (!v) setVenue(parts[1].slice(0, 24)); }
      else if (!title) setTitle(clean.slice(0, 40));
    }
  }

  function startListening() {
    setPhase("listening");
    setTranscript("");
    setSeverity("");
    setListeningSecs(0);
    setCourse("");
    setVenue("");
    setTitle("");
    setTimeParsed("");
    const SR: any = (typeof window !== "undefined" && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)) || null;
    if (!SR) {
      setPhase("review");
      return;
    }
    try {
      const recog = new SR();
      recogRef.current = recog;
      recog.lang = "en-NG";
      recog.continuous = false;
      recog.interimResults = true;
      recog.maxAlternatives = 1;
      recog.onresult = (ev: any) => {
        let t = "";
        for (let i = ev.resultIndex; i < ev.results.length; i++) t += ev.results[i][0]?.transcript ?? "";
        const clean = t.trim();
        setTranscript(clean);
        applyParse(clean);
      };
      recog.onerror = () => { setPhase("review"); };
      recog.onend = () => {
        // keep review
      };
      recog.start();
      try { navigator.vibrate?.(30); } catch {}
      // auto transition to review after 3s even if still listening
      setTimeout(() => { try { recog.stop(); } catch {}; setPhase((p) => p === "listening" ? "review" : p); }, 3000);
    } catch {
      setPhase("review");
    }
  }

  async function handleWhisperSubmit() {
    const sev = severity || inferSeverity(transcript) || "move";
    const t = (title || course || transcript.slice(0, 40) || "Gossip").trim() || "Gossip";
    const v = (venue || "LT?").trim() || "LT?";
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const d = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
    const tm = timeParsed || `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    await onCreate({ title: t, venue: v, event_date: d, event_time: tm, severity: sev, anonId: anonId || genAnonId?.(), transcript });
    setPhase("idle");
    setTranscript("");
    setTitle("");
    setVenue("");
    setCourse("");
    setTimeParsed("");
    setSeverity("");
    setHoldPct(0);
  }

  const holding = phase === "holding";
  const listening = phase === "listening";

  return (
    <>
      {/* FAB — hold 1.5s */}
      <div className="fixed bottom-[96px] right-4 z-30 flex flex-col items-end gap-2 sm:right-6">
        {phase === "idle" && (
          <span className="rounded-full border border-white/10 bg-black/60 px-2.5 py-1 font-mono text-[10px] text-white/60 backdrop-blur">hold 1.5s · whisper 3s · COURSE·VENUE·TIME·SEVERITY · anon {anonDisplay} · fusion x2 · no typing</span>
        )}
        <button
          onMouseDown={startHold}
          onMouseUp={cancelHold}
          onMouseLeave={cancelHold}
          onTouchStart={startHold}
          onTouchEnd={cancelHold}
          onTouchCancel={cancelHold}
          aria-label="Hold to whisper gossip"
          className={`relative flex h-[56px] w-[56px] items-center justify-center rounded-full text-white shadow-[0_8px_24px_rgba(139,92,246,0.5)] transition ${holding ? "scale-110 bg-[#34d399]" : listening ? "scale-105 bg-red-500 animate-pulse shadow-[0_8px_24px_rgba(239,68,68,0.5)]" : "bg-[#34d399] hover:bg-[#7c3aed]"}`}
        >
          {holding && (
            <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 56 56">
              <circle cx="28" cy="28" r="26" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="3" />
              <circle cx="28" cy="28" r="26" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${(holdPct/100)*163} 163`} />
            </svg>
          )}
          <span className="relative text-[22px]">{listening ? "🎤" : holding ? "…" : "✦"}</span>
          {listening && <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] font-black text-red-600">{(3 - listeningSecs).toFixed(1)}</span>}
        </button>
        {holding && <span className="rounded-full bg-white px-3 py-1 font-mono text-[11px] font-bold text-black">hold… {Math.round(holdPct)}%</span>}
        {listening && <span className="rounded-full bg-red-500 px-3 py-1 font-mono text-[11px] font-bold text-white animate-pulse">listening {transcript ? "· " + transcript.slice(0, 24) : ""}… 3s auto</span>}
      </div>

      {/* Review sheet — whisper transcript + auto parse + anon #7F3A fusion x2 */}
      {phase === "review" && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setPhase("idle")}>
          <div onClick={e => e.stopPropagation()} className="w-full max-w-[420px] rounded-[20px] border border-white/10 bg-[#0f172a] p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-[14px] font-bold text-white" style={{ fontFamily: "var(--font-fredoka), Fredoka, system-ui" }}>Whisper gossip</h3>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/20 bg-violet-500/10 px-2.5 py-1 font-mono text-[10px] text-violet-200">
                <span className="h-3 w-3 rounded-full border border-white/30" style={{ background: anonBg }} />
                anon {anonDisplay} · fusion x2 · no typing
              </span>
            </div>
            {!sttSupported && <p className="mt-2 rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 font-mono text-[11px] text-amber-100">STT not supported — type your whisper below (still auto severity).</p>}
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-blue-500/15 px-2 py-0.5 font-mono text-[10px] font-bold text-blue-200">COURSE {course || "auto"}</span>
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-200">VENUE {venue || "auto"}</span>
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-200">TIME {timeParsed || "now"}</span>
              <span className="rounded-full bg-violet-500/15 px-2 py-0.5 font-mono text-[10px] font-bold text-violet-200">SEVERITY {severity || inferSeverity(transcript) || "move"} · fusion x2</span>
            </div>
            <label className="mt-3 block">
              <span className="font-mono text-[10px] uppercase tracking-wide text-slate-400">Transcript · STT · webkitSpeechRecognition local</span>
              <textarea value={transcript} onChange={e => { setTranscript(e.target.value); applyParse(e.target.value); }} placeholder="e.g. BIO 101 moved from LT2 to LT5 at 8am" rows={2} className="mt-1 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-[13px] text-white placeholder:text-slate-500 outline-none focus:border-violet-500" />
              <span className="mt-1 block font-mono text-[10px] text-slate-500">{transcript ? `${transcript.length} chars · COURSE ${parseCourse(transcript)||course||"—"} · VENUE ${parseVenue(transcript)||venue||"—"} · TIME ${parseTime(transcript)||timeParsed||"—"} · severity → ${severity || inferSeverity(transcript) || "move"} · fusion x2` : "hold FAB 1.5s to whisper 3s, transcript fills here · no typing needed"}</span>
            </label>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="font-mono text-[10px] uppercase text-slate-500">Title · COURSE</span>
                <input value={title} onChange={e => setTitle(e.target.value)} placeholder="BIO 101" className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-[13px] text-white outline-none focus:border-violet-500" />
              </label>
              <label className="space-y-1">
                <span className="font-mono text-[10px] uppercase text-slate-500">Venue</span>
                <input value={venue} onChange={e => setVenue(e.target.value)} placeholder="LT5" className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-[13px] text-white outline-none focus:border-violet-500" />
              </label>
            </div>
            {timeParsed && <p className="mt-2 font-mono text-[10px] text-amber-200">⏰ auto TIME {timeParsed} prefilled · edit if needed</p>}
            <div className="mt-3">
              <span className="font-mono text-[10px] uppercase text-slate-500">Severity · auto · anon {anonDisplay}</span>
              <div className="mt-1.5 flex gap-1.5">
                {(["move", "shift", "cancelled"] as const).map(s => {
                  const active = (severity || inferSeverity(transcript)) === s;
                  const col = s === "move" ? "bg-blue-500" : s === "shift" ? "bg-amber-400 text-black" : "bg-red-500";
                  return (
                    <button key={s} type="button" onClick={() => setSeverity(s)} className={`flex-1 rounded-full px-3 py-2 text-[12px] font-bold transition ${active ? col + " text-white shadow" : "border border-white/10 bg-white/[0.04] text-slate-300"}`}>
                      {s === "move" ? "🔵 move" : s === "shift" ? "🟡 shift" : "🔴 cancelled"}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setPhase("idle")} className="flex-1 rounded-full border border-white/10 bg-white/[0.06] py-2.5 text-[13px] font-medium text-slate-200">Cancel</button>
              <button onClick={handleWhisperSubmit} className="flex-[1.4] rounded-full bg-[#34d399] py-2.5 text-[13px] font-black text-white hover:bg-[#7c3aed]">Whisper anon {anonDisplay} · fusion x2 → Post</button>
            </div>
            <p className="mt-2 text-center font-mono text-[10px] text-slate-500">hold FAB 1.5s · whisper 3s auto · COURSE/VENUE/TIME/SEVERITY auto · anon {anonDisplay} #7F3A · fusion x2 · no typing</p>
          </div>
        </div>
      )}
    </>
  );
}
