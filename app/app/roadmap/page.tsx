"use client";
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { logError, getErrorMessage } from "@/lib/adapters/error";

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

type PersonalBubble = {
  localId: string;
  title: string;
  venue: string;
  event_date: string;
  event_time: string;
  scope_type: string;
  scope_value: string | null;
  createdAt: number;
  countdown: number;
  quorumPct: number;
  broadcasting: boolean;
  broadcasted: boolean;
};

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
// parse event datetime as WAT (UTC+1) instant
function eventInstant(dateStr: string, timeStr: string): number {
  const t = String(timeStr ?? "00:00").slice(0, 5);
  // force +01:00 so comparison vs Date.now() is timezone-correct
  const iso = `${String(dateStr).slice(0, 10)}T${t}:00+01:00`;
  const ms = Date.parse(iso);
  if (!isNaN(ms)) return ms;
  // fallback: naive
  const d = new Date(`${dateStr}T${t}:00`);
  return d.getTime();
}
// Africa/Lagos formatted clock parts
function formatWAT(ts: number) {
  try {
    const dt = new Date(ts);
    const datePart = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Lagos",
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(dt);
    const timePart = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Lagos",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(dt);
    const wday = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Lagos",
      weekday: "short",
    }).format(dt);
    return { datePart, timePart, wday };
  } catch {
    // fallback UTC+1
    const d = new Date(ts + 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return {
      datePart: `${pad(d.getUTCDate())} ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getUTCMonth()]} ${d.getUTCFullYear()}`,
      timePart: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`,
      wday: ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getUTCDay()],
    };
  }
}

export default function RoadmapPage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [personal, setPersonal] = useState<PersonalBubble[]>([]);
  const [voteBusy, setVoteBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(true);
  const [statsUsers, setStatsUsers] = useState<number>(28);
  const [showCreate, setShowCreate] = useState(false);
  const [creating] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [fTitle, setFTitle] = useState("");
  const [fVenue, setFVenue] = useState("");
  const [fDate, setFDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [fTime, setFTime] = useState("10:00");
  const [fScope, setFScope] = useState("whole_school");
  const [fScopeVal, setFScopeVal] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const [newIds, setNewIds] = useState<Set<string>>(new Set());

  const fetchFeed = useCallback(async () => {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 1400);
    try {
      setErr(null);
      const r = await fetch("/api/timetable?limit=200", { cache: "no-store", signal: ctrl.signal });
      let j: any = {};
      try { j = await r.json(); } catch { j = {}; }
      if (!r.ok || j.ok === false) throw new Error(j.error || j.hint || `timetable ${r.status}`);
      const evs: EventRow[] = j.events ?? [];
      // chronologically ascending by date+time
      evs.sort((a, b) => {
        const da = eventInstant(a.event_date, a.event_time);
        const db = eventInstant(b.event_date, b.event_time);
        if (da !== db) return da - db;
        return String(a.event_date).localeCompare(String(b.event_date)) || String(a.event_time).localeCompare(String(b.event_time));
      });
      // detect newly arrived events for pop animation
      const prev = seenIdsRef.current;
      const incoming = new Set<string>();
      evs.forEach((e) => {
        if (!prev.has(e.id) && prev.size > 0) incoming.add(e.id);
      });
      if (incoming.size) {
        setNewIds(incoming);
        setTimeout(() => setNewIds(new Set()), 900);
      }
      evs.forEach((e) => prev.add(e.id));
      setEvents(evs);
      if (evs.length && !selectedId) setSelectedId(evs[0].id);
    } catch (e: any) {
      if (e?.name === "AbortError") { logError("TIMETABLE_FETCH_FAILED", e, { page: "roadmap", kind: "timeout" }); setErr(getErrorMessage("TIMETABLE_FETCH_FAILED")); }
      else { logError("TIMETABLE_FETCH_FAILED", e, { page: "roadmap" }); setErr(getErrorMessage("TIMETABLE_FETCH_FAILED")); }
      setEvents([]);
    } finally {
      clearTimeout(to);
      setLoading(false);
    }
  }, [selectedId]);

  const fetchStats = useCallback(async () => {
    try {
      const r = await fetch("/api/stats", { cache: "no-store" });
      const j = await r.json();
      if (j?.metrics?.users) setStatsUsers(Number(j.metrics.users) || 28);
      else if (j?.counts?.physi_users) setStatsUsers(Number(j.counts.physi_users) || 28);
    } catch {}
  }, []);

  useEffect(() => {
    const fallback = setTimeout(() => setLoading(false), 1500);
    fetchFeed();
    fetchStats();
    return () => clearTimeout(fallback);
  }, [fetchFeed, fetchStats]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  // live ticking clock (1s) + 30s recalc for road position
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);

  // quorum countdown for personal bubbles
  useEffect(() => {
    if (personal.length === 0) return;
    const iv = setInterval(() => {
      setPersonal((prev) =>
        prev.map((p) => {
          if (p.broadcasted) return p;
          const age = (Date.now() - p.createdAt) / 1000;
          let qp = Math.min(80, Math.round((age / 6) * 80));
          if (qp < 0) qp = 0;
          let cd = p.countdown;
          if (qp >= 80) {
            cd = Math.max(0, 10 - Math.floor(age - 6));
            if (age >= 16) cd = 0;
          } else {
            cd = 10;
          }
          return { ...p, quorumPct: qp, countdown: qp >= 80 ? cd : 10 };
        })
      );
    }, 500);
    return () => clearInterval(iv);
  }, [personal.length]);

  const broadcastQueue = useRef<Set<string>>(new Set());
  useEffect(() => {
    personal.forEach((p) => {
      if (p.broadcasted || p.broadcasting) return;
      if (p.quorumPct >= 80 && p.countdown === 0 && !broadcastQueue.current.has(p.localId)) {
        broadcastQueue.current.add(p.localId);
        setPersonal((pr) => pr.map((x) => (x.localId === p.localId ? { ...x, broadcasting: true } : x)));
        (async () => {
          try {
            let createdBy: string | null = null;
            try {
              const raw = localStorage.getItem("physi_profile");
              if (raw) createdBy = JSON.parse(raw)?.id ?? null;
            } catch {}
            const body: any = {
              title: p.title,
              venue: p.venue,
              event_date: p.event_date,
              event_time: p.event_time,
              scope_type: p.scope_type,
              scope_value: p.scope_value || null,
              status: "pending",
              authority_points: 0,
              required_points: 5,
            };
            if (createdBy) body.created_by = createdBy;
            const r = await fetch("/api/timetable", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(body),
            });
            const j = await r.json();
            if (!r.ok || j.ok === false) throw new Error(j.error || "broadcast failed");
            setToast(`broadcasted “${p.title}” — now on road ●`);
            setPersonal((pr) => pr.map((x) => (x.localId === p.localId ? { ...x, broadcasted: true, broadcasting: false } : x)));
            setTimeout(() => {
              setPersonal((pr) => pr.filter((x) => x.localId !== p.localId));
              fetchFeed();
            }, 1600);
          } catch (e: any) {
            logError("TIMETABLE_CREATE_FAILED", e, { page: "roadmap" }); setToast(getErrorMessage("TIMETABLE_CREATE_FAILED"));
            setPersonal((pr) => pr.map((x) => (x.localId === p.localId ? { ...x, broadcasting: false } : x)));
            broadcastQueue.current.delete(p.localId);
          }
        })();
      }
    });
  }, [personal, fetchFeed]);

  const hasEvents = events.length > 0;
  const selectedEvent = useMemo(() => events.find((e) => e.id === selectedId) ?? null, [events, selectedId]);
  const selectedPersonal = useMemo(() => personal.find((p) => p.localId === selectedId) ?? null, [personal, selectedId]);
  const verifiedCount = useMemo(() => events.filter(isVerified).length, [events]);
  const advisoryCount = useMemo(() => events.filter((e) => !isVerified(e) && e.status === "pending").length, [events]);

  // combined road items chronologically sorted
  type RoadItem = { kind: "personal"; p: PersonalBubble; id: string; ms: number } | { kind: "event"; ev: EventRow; id: string; ms: number };
  const roadItems: RoadItem[] = useMemo(() => {
    const pers: RoadItem[] = personal.map((p) => ({ kind: "personal", p, id: p.localId, ms: eventInstant(p.event_date, p.event_time) } as RoadItem));
    const evs: RoadItem[] = events.map((ev) => ({ kind: "event", ev, id: ev.id, ms: eventInstant(ev.event_date, ev.event_time) } as RoadItem));
    const all = [...pers, ...evs];
    all.sort((a, b) => a.ms - b.ms);
    return all;
  }, [personal, events]);

  // find NOW index (first item after now)
  const nowIdx = useMemo(() => {
    if (roadItems.length === 0) return 0;
    const n = now;
    let idx = roadItems.findIndex((it) => it.ms > n);
    if (idx === -1) idx = roadItems.length; // all past -> NOW at end
    return idx;
  }, [roadItems, now]);

  const wat = useMemo(() => formatWAT(now), [now]);

  // --- infinite loop road constants (no hard start/end — seamless endless) ---
  const STEP_Y = 128;
  const TOP_BUFFER = 320; // replaces hard START_Y cap — road extends far beyond viewport so caps never visible
  const BOTTOM_BUFFER = 480;
  const MIN_TILE = 18; // ensure road feels endless even with few events
  const ROAD_EXTEND = 420; // extra path length beyond first/last node — purple striped line never terminates, hidden by fade masks
  const VIEWPORT_FADE_TOP = 96; // mask fade top
  const VIEWPORT_FADE_BOT = 128; // mask fade bottom

  // tiled display items: duplicate to fill infinite illusion when few events
  const displayItems = useMemo(() => {
    if (roadItems.length === 0) return [] as typeof roadItems;
    if (roadItems.length >= MIN_TILE) return roadItems;
    const repeats = Math.ceil(MIN_TILE / roadItems.length);
    const out: typeof roadItems = [];
    for (let r = 0; r < repeats; r++) {
      for (let i = 0; i < roadItems.length; i++) {
        const it = roadItems[i];
        // unique id per tile to keep React keys stable; keep original ms for sorting within tile
        const tileId = it.id + "__tile" + r;
        if (it.kind === "personal") {
          out.push({ ...it, id: tileId } as any);
        } else {
          out.push({ ...it, id: tileId } as any);
        }
      }
    }
    return out;
  }, [roadItems]);

  // effective length for node placement (infinite fill)
  const effectiveLen = displayItems.length || 8;

  const nodes = useMemo(() => {
    const len = displayItems.length || 8;
    if (displayItems.length === 0) {
      return Array.from({ length: 8 }, (_, i) => ({
        x: i % 2 === 0 ? 138 + (i % 4 === 0 ? 18 : 0) : 372 - (i % 4 === 1 ? 12 : 0),
        y: TOP_BUFFER + i * STEP_Y,
      }));
    }
    return displayItems.map((_, i) => {
      const y = TOP_BUFFER + i * STEP_Y;
      let x: number;
      if (displayItems.length === 1) x = 260;
      else if (i % 2 === 0) x = 142 + (i % 4 === 0 ? 18 : 0);
      else x = 378 - (i % 4 === 1 ? 12 : 0);
      return { x, y };
    });
  }, [displayItems]);

  // NOW Y mapped to tiled road: if tiled (few events) center NOW in middle tile for endless illusion
  const nowY = useMemo(() => {
    if (displayItems.length === 0) return TOP_BUFFER + 3 * STEP_Y;
    if (roadItems.length > 0 && roadItems.length < MIN_TILE) {
      // center NOW in middle of infinite loop when tiled
      return TOP_BUFFER + Math.floor(displayItems.length / 2) * STEP_Y;
    }
    return TOP_BUFFER + nowIdx * STEP_Y;
  }, [nowIdx, displayItems.length, roadItems.length]);

  const svgH = useMemo(() => {
    const lastY = nodes[nodes.length - 1]?.y || TOP_BUFFER + 7 * STEP_Y;
    return Math.max(980, lastY + BOTTOM_BUFFER);
  }, [nodes]);

  // auto-scroll to center NOW on mount + every 30s + when nowIdx changes
  const scrollToNow = useCallback(
    (smooth = true) => {
      const el = scrollRef.current;
      if (!el) return;
      const vh = el.clientHeight;
      const target = nowY - vh / 2 + 44; // 44 offset for header
      const max = el.scrollHeight - vh;
      const clamped = Math.max(0, Math.min(max, target));
      el.scrollTo({ top: clamped, behavior: smooth ? "smooth" : "auto" });
    },
    [nowY]
  );
  // initial + when road changes (displayItems length ensures infinite fill re-centers)
  useEffect(() => {
    // slight delay to let layout paint
    const t = setTimeout(() => scrollToNow(false), 80);
    return () => clearTimeout(t);
  }, [scrollToNow, displayItems.length]);
  // every 30s recalc auto-move
  useEffect(() => {
    const iv = setInterval(() => scrollToNow(true), 30000);
    return () => clearInterval(iv);
  }, [scrollToNow]);
  // also when nowIdx shifts due to tick crossing an event time, smooth nudge
  const prevIdxRef = useRef(nowIdx);
  useEffect(() => {
    if (prevIdxRef.current !== nowIdx) {
      prevIdxRef.current = nowIdx;
      scrollToNow(true);
    }
  }, [nowIdx, scrollToNow]);

  const roadD = useMemo(() => {
    if (nodes.length === 0) return "";
    if (nodes.length === 1) {
      const y0 = nodes[0].y - ROAD_EXTEND;
      const y1 = nodes[0].y + ROAD_EXTEND;
      return `M ${nodes[0].x} ${y0} L ${nodes[0].x} ${y1}`;
    }
    // extend beyond first/last node for seamless infinite illusion
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const extTopY = first.y - ROAD_EXTEND;
    const extBotY = last.y + ROAD_EXTEND;
    let d = `M ${first.x} ${extTopY} L ${first.x} ${first.y}`;
    for (let i = 1; i < nodes.length; i++) {
      const a = nodes[i - 1],
        b = nodes[i];
      const dx = b.x - a.x;
      const c1x = a.x + dx * 0.55 + (dx > 0 ? 74 : -74);
      const c1y = a.y + 42;
      const c2x = b.x - dx * 0.25 + (dx > 0 ? -48 : 48);
      const c2y = b.y - 30;
      d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${b.x} ${b.y}`;
    }
    d += ` L ${last.x} ${extBotY}`;
    return d;
  }, [nodes]);

  function quorumTarget(scope_type: string) {
    if (scope_type === "level" || scope_type === "programme" || scope_type.includes("level")) {
      return Math.max(3, Math.ceil(statsUsers * 0.25));
    }
    return Math.max(5, statsUsers);
  }

  function stateFor(item: RoadItem) {
    if (item.kind === "personal") {
      return { key: "personal", label: "light off", color: "#a1a1aa", outline: "#52525b", dimmed: true } as const;
    }
    const ev = item.ev;
    const ap = Number(ev.authority_points ?? 0);
    const rp = Number(ev.required_points ?? 0);
    const pct = rp > 0 ? Math.min(100, Math.round((ap / rp) * 100)) : isVerified(ev) ? 100 : 0;
    if (isVerified(ev)) return { key: "canonical", label: "canonical ✓", color: "#10b981", outline: "#10b981", pct, pop: true } as const;
    if (pct >= 85) return { key: "almost", label: "almost ●", color: "#84cc16", outline: "#a3e635", pct, scale: 1 + (pct - 85) / 80 } as const;
    if (ev.status === "pending") return { key: "advisory", label: "advisory ●", color: "#f59e0b", outline: "#f59e0b", pct } as const;
    if (ev.status === "waiting" || pct < 50) return { key: "waiting", label: "waiting ○", color: "#3b82f6", outline: "#3b82f6", pct } as const;
    return { key: "advisory", label: "advisory ●", color: "#f59e0b", outline: "#f59e0b", pct } as const;
  }

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
    } catch (e: unknown) {
      logError("VERIFY_SUBMIT_FAILED", e, { page: "roadmap" });
      setToast(getErrorMessage("VERIFY_SUBMIT_FAILED"));
    } finally {
      setVoteBusy(null);
    }
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!fTitle.trim() || !fVenue.trim() || !fDate || !fTime) {
      setToast("fill title, venue, date, time");
      return;
    }
    const localId = "pb_" + Math.random().toString(36).slice(2, 9);
    const bubble: PersonalBubble = {
      localId,
      title: fTitle.trim(),
      venue: fVenue.trim(),
      event_date: fDate,
      event_time: fTime,
      scope_type: fScope,
      scope_value: fScopeVal.trim() || null,
      createdAt: Date.now(),
      countdown: 10,
      quorumPct: 0,
      broadcasting: false,
      broadcasted: false,
    };
    setPersonal((p) => [...p, bubble]);
    // mark as new for pop animation
    setNewIds((s) => {
      const n = new Set(s);
      n.add(localId);
      return n;
    });
    setTimeout(() => setNewIds((s) => {
      const n = new Set(s);
      n.delete(localId);
      return n;
    }), 900);
    setSelectedId(localId);
    setSheetOpen(true);
    setShowCreate(false);
    setToast(`personal bubble created — light off (not broadcast yet)`);
    setFTitle("");
    setFVenue("");
    setFTime("10:00");
    setFDate(new Date().toISOString().slice(0, 10));
  }

  const pastCount = nowIdx;
  const upcomingCount = roadItems.length - nowIdx;

  return (
    <div className="relative -mx-4 -mt-5 w-[100vw] max-w-[100vw] sm:-mx-6 lg:-mx-8">
      <style>{`@keyframes canonicalPop{0%{transform:scale(0.72)}50%{transform:scale(1.22)}100%{transform:scale(1)}} @keyframes tickPulse{0%,100%{opacity:1}50%{opacity:.55}} @keyframes roadShimmer{0%{stroke-dashoffset:0}100%{stroke-dashoffset:28}} @keyframes scaleIn{0%{transform:scale(0.35);opacity:0}60%{transform:scale(1.14);opacity:1}100%{transform:scale(1);opacity:1}} @keyframes nowPulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.06);opacity:.94}} @keyframes ghostDrift{0%{transform:translateY(0) translateX(0)}25%{transform:translateY(-10px) translateX(7px)}50%{transform:translateY(-16px) translateX(-5px)}75%{transform:translateY(-8px) translateX(4px)}100%{transform:translateY(0) translateX(0)}} @keyframes ghostPulse{0%,100%{opacity:.92}50%{opacity:.56}} .road-3d-wrap{perspective:800px;perspective-origin:50% 28%} .road-3d-inner{transform-style:preserve-3d;transform:perspective(800px) rotateX(4deg);transform-origin:center top;will-change:transform;clip-path:ellipse(96% 88% at 50% 46%);border-radius:28px} .road-3d-inner::before{content:"";position:absolute;inset:0;pointer-events:none;border-radius:28px;box-shadow:inset 0 10px 22px rgba(0,0,0,0.16),inset 0 -8px 16px rgba(0,0,0,0.12)} .node-3d{transform:translateZ(6px);box-shadow:inset 0 1.5px 0 rgba(255,255,255,0.55),inset 0 -2px 4px rgba(0,0,0,0.14),0 8px 20px rgba(0,0,0,0.42),0 1px 6px rgba(0,0,0,0.32);transition:transform 220ms cubic-bezier(.2,.8,.3,1),box-shadow 220ms ease} .node-3d:hover{transform:translateZ(12px) scale(1.02);box-shadow:inset 0 1.5px 0 rgba(255,255,255,0.65),inset 0 -3px 6px rgba(0,0,0,0.16),0 12px 28px rgba(0,0,0,0.5),0 4px 12px rgba(0,0,0,0.36)}`}</style>
      <div className="relative min-h-[calc(100vh-64px)] w-full overflow-hidden" style={{ background: "linear-gradient(180deg, #0d3b2a 0%, #143d2e 42%, #1a5c3a 100%)" }}>
        {/* ambient */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(13,59,42,0.85) 0%, rgba(26,92,58,0.55) 55%, rgba(45,106,79,0.72) 100%)" }} />
          <div className="absolute -top-[8vh] left-1/2 h-[58vh] w-[120vw] -translate-x-1/2 rounded-[100%] opacity-[0.22]" style={{ background: "radial-gradient(ellipse at center, rgba(82,183,136,0.28) 0%, rgba(64,145,108,0.20) 42%, rgba(45,106,79,0.16) 72%, transparent 75%)" }} />
          <div className="absolute top-[18vh] left-[-6%] h-[46vh] w-[46vh] rounded-full opacity-[0.16] blur-[40px]" style={{ background: "radial-gradient(circle, rgba(82,183,136,0.95), transparent 70%)" }} />
          <div className="absolute top-[52vh] right-[-8%] h-[50vh] w-[50vh] rounded-full opacity-[0.18] blur-[42px]" style={{ background: "radial-gradient(circle, rgba(45,106,79,0.9), transparent 70%)" }} />
          <div className="absolute bottom-[18vh] left-1/2 h-[38vh] w-[90vw] -translate-x-1/2 opacity-[0.12] blur-[30px]" style={{ background: "radial-gradient(ellipse, rgba(64,145,108,0.55), transparent 72%)" }} />
        </div>

        {/* top bar */}
        <div className="pointer-events-none absolute left-0 right-0 top-0 z-20 flex justify-center px-3 pt-3 sm:px-6">
          <div className="pointer-events-auto flex w-full max-w-[900px] items-center justify-between gap-2">
            <div className="flex items-center gap-2 rounded-full border border-white/[0.09] bg-black/70 px-3 py-2 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.6)] sm:px-4">
              <span className="hidden h-7 w-7 items-center justify-center rounded-full bg-white text-[11px] font-black text-black sm:flex">◉</span>
              <div>
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 sm:text-[11px]">endless time road · WAT</p>
                <p className="hidden text-[12px] font-semibold leading-none text-white sm:block">
                  {loading ? "Loading live road…" : roadItems.length ? `${pastCount} past · NOW · ${upcomingCount} ahead · tap a node` : "tap a node · create your gist"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold sm:px-3 sm:py-1.5 sm:text-xs ${verifiedCount > 0 ? "bg-emerald-500 text-white" : "bg-white/10 text-slate-300"}`}>
                <span className="h-1.5 w-1.5 rounded-full bg-white/80" /> {verifiedCount} ✓
              </span>
              <span className="inline-flex items-center rounded-full bg-amber-500 px-2.5 py-1 text-[11px] font-bold text-white sm:px-3 sm:py-1.5 sm:text-xs">{advisoryCount} ●</span>
              <button onClick={() => setShowCreate(true)} className="rounded-full bg-white px-3.5 py-1.5 text-[12px] font-black text-black hover:bg-slate-100 transition sm:px-4 sm:py-2 sm:text-[13px]">
                ＋ New gist
              </button>
              <button onClick={() => fetchFeed()} className="hidden rounded-full border border-white/15 bg-white/[0.08] px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-white hover:text-black transition sm:inline-flex">
                ↻ refresh
              </button>
            </div>
          </div>
        </div>

        {/* second row: share/save + live WAT clock */}
        <div className="pointer-events-none absolute left-1/2 top-[58px] z-20 flex w-full max-w-[900px] -translate-x-1/2 items-center justify-between gap-2 px-3 sm:px-6">
          <div className="pointer-events-auto flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/70 px-3 py-1.5 backdrop-blur">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
              <span className="font-mono text-[11px] font-bold tracking-wide text-white" style={{ fontVariantNumeric: "tabular-nums" }}>{wat.timePart} WAT</span>
              <span className="hidden font-mono text-[10px] text-slate-400 sm:inline">· {wat.wday} {wat.datePart} · Africa/Lagos GMT+1</span>
              <span className="font-mono text-[10px] text-slate-500 sm:hidden">{wat.datePart}</span>
            </div>
            <button onClick={() => scrollToNow(true)} className="hidden rounded-full border border-violet-400/30 bg-violet-500/20 px-3 py-1.5 text-[11px] font-bold text-violet-200 backdrop-blur hover:bg-violet-500 hover:text-white transition sm:inline-flex">◎ NOW</button>
          </div>
          <div className="pointer-events-auto hidden gap-2 sm:flex">
            <button onClick={() => { navigator.clipboard?.writeText(window.location.href); setToast("link copied — share the road"); }} className="rounded-full border border-white/10 bg-black/70 px-3.5 py-1.5 text-xs font-semibold text-white backdrop-blur">↗ Share</button>
            <button onClick={() => setToast("saved to your map")} className="rounded-full border border-white/10 bg-black/70 px-3.5 py-1.5 text-xs font-semibold text-white backdrop-blur">♡ Save</button>
            <button onClick={() => scrollToNow(true)} className="rounded-full border border-white/10 bg-black/70 px-3.5 py-1.5 text-xs font-semibold text-white backdrop-blur sm:hidden">◎ NOW</button>
          </div>
          <button onClick={() => scrollToNow(true)} className="pointer-events-auto rounded-full border border-violet-400/30 bg-violet-500 px-3 py-1.5 text-[11px] font-black text-white sm:hidden">◎ NOW</button>
        </div>

        <p className="absolute left-1/2 top-[92px] z-10 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/10 bg-black/70 px-3 py-1 font-mono text-[10px] tracking-wide text-slate-400 backdrop-blur sm:hidden">
          {loading ? "LOADING ROAD…" : `${pastCount} BEHIND · NOW · ${upcomingCount} AHEAD`}
        </p>

        {toast && <div className="fixed bottom-28 left-1/2 z-50 -translate-x-1/2 rounded-full bg-white px-5 py-2.5 text-[13px] font-medium text-black shadow-xl">{toast}</div>}

        {/* SCROLLABLE ROAD CONTAINER — endless winding purple road — subtle 3D emboss */}
        <div className="road-3d-wrap relative mx-auto flex h-[calc(100vh-64px)] w-full max-w-[560px] justify-center overflow-hidden pt-[112px] sm:pt-[104px]" style={{ perspective: "800px", perspectiveOrigin: "50% 28%" }}>
          {/* depth gradients on sides — 3D vignette */}
          <div className="pointer-events-none absolute inset-y-0 left-0 w-[18%] z-[4]" style={{ background: "linear-gradient(to right, rgba(0,0,0,0.38) 0%, rgba(0,0,0,0.18) 42%, transparent 100%)" }} />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-[18%] z-[4]" style={{ background: "linear-gradient(to left, rgba(0,0,0,0.38) 0%, rgba(0,0,0,0.18) 42%, transparent 100%)" }} />
          <div
            ref={scrollRef}
            className="road-3d-inner relative flex h-full w-full justify-center overflow-auto pb-[320px] sm:pb-[340px]"
            style={{
              scrollBehavior: "smooth",
              transformStyle: "preserve-3d",
              transform: "perspective(800px) rotateX(4deg)",
              transformOrigin: "center top",
              willChange: "transform",
              clipPath: "ellipse(96% 88% at 50% 46%)",
              borderRadius: "28px",
              WebkitMaskImage: `linear-gradient(to bottom, transparent 0px, black ${VIEWPORT_FADE_TOP}px, black calc(100% - ${VIEWPORT_FADE_BOT}px), transparent 100%)`,
              maskImage: `linear-gradient(to bottom, transparent 0px, black ${VIEWPORT_FADE_TOP}px, black calc(100% - ${VIEWPORT_FADE_BOT}px), transparent 100%)`,
            }}
          >
            {/* map card background — 3D bevel + drop shadow */}
            <div className="pointer-events-none absolute left-1/2 top-[104px] h-[86%] w-[96%] -translate-x-1/2 overflow-hidden rounded-[28px] border border-white/[0.14]" style={{ background: "linear-gradient(180deg, rgba(45,106,79,0.42) 0%, rgba(64,145,108,0.34) 38%, rgba(82,183,136,0.22) 68%, rgba(13,59,42,0.24) 100%), linear-gradient(180deg, #2d6a4f 0%, #40916c 52%, #52b788 100%)", minHeight: svgH, boxShadow: "0 12px 32px rgba(0,0,0,0.6), 0 2px 10px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -2px 8px rgba(0,0,0,0.22)", transform: "translateZ(0px)", transformStyle: "preserve-3d" }} />
            {/* visual ghosts — pure UI candy avatars drifting slowly on purple road (no DB) */}
            <div className="pointer-events-none absolute left-1/2 top-[104px] w-[96%] -translate-x-1/2 overflow-hidden rounded-[28px]" style={{ height: svgH, minHeight: svgH, zIndex: 3 }} aria-hidden>
              {[
                { name: "alex_02", color: "#10b981", bg: "#065f46", top: 168, left: "18%", delay: "0s", dur: "6.2s" },
                { name: "zara_11", color: "#f59e0b", bg: "#78350f", top: 420, left: "74%", delay: "1.1s", dur: "7.1s" },
                { name: "mike_07", color: "#0ea5e9", bg: "#0c4a6e", top: 660, left: "22%", delay: "0.6s", dur: "6.8s" },
                { name: "nini_04", color: "#8b5cf6", bg: "#4c1d95", top: 920, left: "68%", delay: "2.0s", dur: "7.6s" },
              ].map((g) => (
                <div
                  key={g.name}
                  className="absolute flex flex-col items-center"
                  style={{
                    top: g.top,
                    left: g.left,
                    animation: `ghostDrift ${g.dur} ease-in-out infinite`,
                    animationDelay: g.delay,
                  }}
                >
                  <div
                    className="flex h-[36px] w-[36px] items-center justify-center rounded-full border-2 text-[12px] font-black text-white shadow-[0_4px_14px_rgba(0,0,0,0.38)]"
                    style={{
                      background: g.color,
                      borderColor: "rgba(255,255,255,0.88)",
                      boxShadow: `0 0 0 6px ${g.color}22, 0 4px 14px rgba(0,0,0,0.38)`,
                      animation: `ghostPulse 2.8s ease-in-out infinite`,
                      animationDelay: g.delay,
                    }}
                  >
                    {g.name.slice(0, 2).toUpperCase()}
                  </div>
                  <span
                    className="mt-1 rounded-full px-2 py-0.5 font-mono text-[8px] font-bold tracking-wide text-white backdrop-blur"
                    style={{
                      background: `${g.bg}cc`,
                      border: `1px solid ${g.color}66`,
                      animation: `ghostPulse 2.8s ease-in-out infinite`,
                      animationDelay: g.delay,
                    }}
                  >
                    {g.name} · ghost
                  </span>
                </div>
              ))}
            </div>
          {/* trees/mountains */}
          <svg viewBox={`0 0 520 ${svgH}`} className="pointer-events-none absolute left-1/2 top-[104px] h-[86%] w-[96%] -translate-x-1/2 rounded-[28px] overflow-hidden" style={{ height: svgH, minHeight: svgH }}>
            <path d="M -10 210 L 90 78 L 170 175 L 250 54 L 340 168 L 430 92 L 560 210 Z" fill="rgba(13,59,42,0.32)" stroke="rgba(255,255,255,0.10)" strokeWidth={1} />
            <path d="M -10 240 L 70 150 L 145 210 L 250 120 L 370 210 L 470 155 L 560 240 Z" fill="rgba(26,92,58,0.28)" />
            {[42, 92, 410, 462].map((x, i) => (
              <g key={i} opacity={0.32}>
                <path d={`M ${x} 420 L ${x - 22} 462 L ${x + 22} 462 Z`} fill={i % 2 === 0 ? "#0d3b2a" : "#1a5c3a"} />
                <path d={`M ${x} 392 L ${x - 18} 426 L ${x + 18} 426 Z`} fill={i % 2 === 0 ? "#2d6a4f" : "#40916c"} opacity={0.95} />
                <rect x={x - 4} y={462} width={8} height={14} rx={2} fill="#2f3e2a" opacity={0.9} />
              </g>
            ))}
            <g opacity={0.32}>
              <ellipse cx={86} cy={310} rx={22} ry={13} fill="#6b8f71" />
              <ellipse cx={92} cy={306} rx={10} ry={6} fill="#a7c4a0" opacity={0.7} />
              <ellipse cx={438} cy={520} rx={20} ry={12} fill="#7a9e7e" />
              <ellipse cx={430} cy={516} rx={8} ry={5} fill="#d8f3dc" opacity={0.85} />
              <ellipse cx={78} cy={680} rx={18} ry={10} fill="#5a7a5a" />
              <path d="M 430 710 L 452 728 L 418 735 Z" fill="#b7e4c7" opacity={0.9} />
            </g>
          </svg>

          <svg viewBox={`0 0 520 ${svgH}`} className="relative h-auto w-full shrink-0" style={{ minHeight: Math.min(880, svgH), height: svgH }} role="img" aria-label="endless time road">
            <defs>
              <linearGradient id="purpleRoad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#6e45d0" />
                <stop offset="50%" stopColor="#8b5cf6" />
                <stop offset="100%" stopColor="#a78bfa" />
              </linearGradient>
              <filter id="roadShadow"><feDropShadow dx="0" dy="4" stdDeviation={6} floodColor="rgba(0,0,0,0.42)" /></filter>
              <filter id="nodeGlow"><feDropShadow dx="0" dy="2" stdDeviation={5} floodColor="rgba(255,255,255,0.14)" /></filter>
            </defs>

            {/* purple road — subtle depth */}
            <path d={roadD} fill="none" stroke="#1a1033" strokeWidth={52} strokeLinecap="round" strokeLinejoin="round" opacity={0.92} style={{ filter: "url(#roadShadow)" }} />
            {/* soft offset for emboss */}
            <path d={roadD} fill="none" stroke="#4c1d95" strokeWidth={44} strokeLinecap="round" strokeLinejoin="round" opacity={0.88} style={{ transform: "translate(4px, 4px)" } as any} />
            <path d={roadD} fill="none" stroke="url(#purpleRoad)" strokeWidth={44} strokeLinecap="round" strokeLinejoin="round" style={{ filter: "drop-shadow(0 3px 8px rgba(0,0,0,0.32))" } as any} />
            {/* bevel highlight on top edge */}
            <path d={roadD} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth={46} strokeLinecap="round" strokeLinejoin="round" opacity={0} style={{ transform: "translate(-1px, -1.5px)" } as any} />
            <path d={roadD} fill="none" stroke="white" strokeWidth={3.2} strokeLinecap="round" strokeDasharray="14 14" opacity={0.92} style={{ animation: "roadShimmer 1.2s linear infinite" }} />
            <path d={roadD} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={1} opacity={0.5} />

            {/* NOW marker — big pulse */}
            <g style={{ animation: "nowPulse 1.4s ease-in-out infinite" }}>
              <line x1={90} y1={nowY} x2={430} y2={nowY} stroke="rgba(255,255,255,0.92)" strokeWidth={1.2} strokeDasharray="8 6" />
              <rect x={188} y={nowY - 16} width={144} height={32} rx={16} fill="#fff" stroke="#8b5cf6" strokeWidth={2.2} />
              <text x={260} y={nowY + 5.5} textAnchor="middle" fontSize={11} fontWeight={900} fill="#5b21b6" style={{ fontFamily: "ui-monospace, monospace", letterSpacing: "0.08em" }}>◉ NOW · WAT</text>
              <circle cx={260} cy={nowY} r={5} fill="#8b5cf6" stroke="white" strokeWidth={1.5} />
            </g>
            <text x={260} y={nowY + 26} textAnchor="middle" fontSize={7.5} fontWeight={700} fill="rgba(255,255,255,0.92)" style={{ fontFamily: "ui-monospace, monospace", textShadow: "0 1px 6px rgba(0,0,0,0.7)" }}>{wat.timePart} · {wat.datePart}</text>

            {loading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <g key={i} opacity={0.28}>
                    <circle cx={i % 2 === 0 ? 150 : 370} cy={TOP_BUFFER + i * STEP_Y} r={30} fill="rgba(255,255,255,0.08)" />
                  </g>
                ))
              : displayItems.map((item, i) => {
                  const p = nodes[i];
                  const st = stateFor(item);
                  // tile ids have __tile suffix — compare base id so selection stays coherent across loop
                  const baseId = String(item.id).split("__tile")[0];
                  const isActive = selectedId === item.id || selectedId === baseId;
                  const isNew = newIds.has(item.id) || newIds.has(baseId);
                  const isPersonal = item.kind === "personal";
                  const leftSide = p.x < 260;
                  const isPast = item.ms <= now;
                  let nodeR = 30;
                  let scale = 1;
                  let outline: string = (st as any).outline;
                  let anim = "";
                  if ((st as any).key === "canonical") {
                    nodeR = 34;
                    anim = "canonicalPop 420ms cubic-bezier(.2,.8,.3,1.4)";
                    outline = "#10b981";
                  } else if ((st as any).key === "almost") {
                    scale = (st as any).scale || 1.12;
                    nodeR = Math.round(30 * scale);
                    outline = (st as any).outline;
                  } else if ((st as any).key === "personal") {
                    nodeR = 27;
                  }
                  const title = isPersonal ? item.p.title : item.ev.title;
                  const venue = isPersonal ? item.p.venue : item.ev.venue;
                  const date = isPersonal ? item.p.event_date : item.ev.event_date;
                  const time = isPersonal ? item.p.event_time : item.ev.event_time;
                  const label = title.length > 18 ? title.slice(0, 18) + "…" : title;
                  const pillW = Math.max(136, Math.min(188, label.length * 7.2 + 36));
                  const pillX = leftSide ? p.x + 44 : p.x - pillW - 12;
                  const pctVal = !isPersonal
                    ? (() => {
                        const ap = Number(item.ev.authority_points ?? 0);
                        const rp = Number(item.ev.required_points ?? 0);
                        return rp > 0 ? Math.min(100, Math.round((ap / rp) * 100)) : isVerified(item.ev) ? 100 : 0;
                      })()
                    : null;
                  const showPct = pctVal !== null && pctVal > 0 && !isVerified((item as any).ev);
                  const opacity = isPast ? 0.48 : 1;
                  return (
                    <g
                      key={item.id}
                      onClick={() => {
                        // use base id so sheet shows canonical event even when clicking tiled duplicates
                        setSelectedId(baseId);
                        setSheetOpen(true);
                      }}
                      style={{
                        cursor: "pointer",
                        opacity: isPersonal && !isActive ? 0.62 : opacity,
                      }}
                    >
                      {isActive && <circle cx={p.x} cy={p.y} r={nodeR + 20} fill="white" opacity={0.09} />}
                      <circle cx={p.x} cy={p.y + 6} r={nodeR} fill="black" opacity={0.34} />
                      <g
                        className="node-3d"
                        style={{
                          transformOrigin: `${p.x}px ${p.y}px`,
                          transform: (st as any).key === "almost" ? `translateZ(14px) scale(${scale})` : "translateZ(10px)",
                          animation: isNew ? "scaleIn 720ms cubic-bezier(.2,.8,.3,1.2)" : anim || undefined,
                          filter: "drop-shadow(0 12px 18px rgba(0,0,0,0.45))",
                        } as any}
                      >
                        <circle cx={p.x} cy={p.y} r={nodeR} fill={isPersonal ? "#e7e5e4" : "white"} stroke={outline} strokeWidth={isActive ? 3.8 : 3} filter="url(#nodeGlow)" opacity={isPersonal ? 0.72 : 1} style={{ transform: isActive ? "translateZ(18px)" : "translateZ(12px)" } as any} />
                        <circle cx={p.x} cy={p.y} r={nodeR - 10} fill={st.key === "canonical" ? "#ecfdf5" : st.key === "almost" ? "#f7fee7" : st.key === "advisory" ? "#fffbeb" : st.key === "waiting" ? "#eff6ff" : "#f4f4f5"} stroke="rgba(0,0,0,0.06)" strokeWidth={1} />
                        <text x={p.x} y={p.y + 6} textAnchor="middle" fontSize={isPersonal ? 10 : st.key === "canonical" ? 17 : 14} fontWeight={800} fill={st.key === "canonical" ? "#065f46" : st.key === "almost" ? "#3f6212" : st.key === "advisory" ? "#92400e" : st.key === "waiting" ? "#1e40af" : "#52525b"} style={{ fontFamily: "ui-monospace, monospace" }}>
                          {isPersonal ? "◐" : st.key === "canonical" ? "✓" : st.key === "advisory" ? "●" : st.key === "almost" ? "◉" : st.key === "waiting" ? "○" : "●"}
                        </text>
                      </g>
                      {isPast && <text x={p.x} y={p.y + nodeR + 36} textAnchor="middle" fontSize={6.5} fontWeight={700} fill="rgba(255,255,255,0.55)" style={{ fontFamily: "ui-monospace,monospace" }}>PAST</text>}
                      {isPersonal && (
                        <g>
                          <rect x={p.x - 28} y={p.y + nodeR + 8} width={56} height={16} rx={8} fill="rgba(0,0,0,0.72)" stroke="rgba(255,255,255,0.14)" />
                          <text x={p.x} y={p.y + nodeR + 19} textAnchor="middle" fontSize={7.5} fontWeight={700} fill="#a1a1aa" style={{ fontFamily: "ui-monospace,monospace" }}>LIGHT OFF</text>
                        </g>
                      )}
                      <g opacity={isPersonal ? 0.82 : isPast ? 0.62 : 1}>
                        <rect x={pillX} y={p.y - 38} width={pillW} height={28} rx={14} fill={isActive ? "white" : "rgba(0,0,0,0.62)"} stroke={isActive ? "white" : "rgba(255,255,255,0.18)"} />
                        <text x={pillX + pillW / 2} y={p.y - 19} textAnchor="middle" fontSize={12} fontWeight={750} fill={isActive ? "#000" : "white"}>{label}</text>
                      </g>
                      <g opacity={isPast ? 0.56 : 0.96}>
                        <rect x={pillX} y={p.y + 24} width={pillW} height={18} rx={9} fill="rgba(0,0,0,0.74)" stroke="rgba(255,255,255,0.12)" />
                        <text x={pillX + pillW / 2} y={p.y + 35.5} textAnchor="middle" fontSize={8.5} fontWeight={600} fill="#cbd5e1" style={{ fontFamily: "ui-monospace,monospace" }}>{venue.slice(0, 14)} · {fmtDate(date)} {fmtTime(time)}</text>
                      </g>
                      {isPersonal ? (
                        <g>
                          <circle cx={leftSide ? p.x + 38 : p.x - 38} cy={p.y - 22} r={13} fill="#18181b" stroke="rgba(255,255,255,0.16)" />
                          <text x={leftSide ? p.x + 38 : p.x - 38} y={p.y - 17.5} textAnchor="middle" fontSize={7} fontWeight={800} fill={item.p.quorumPct >= 80 ? "#facc15" : "#a1a1aa"}>{item.p.quorumPct >= 80 ? `${item.p.countdown}s` : `${item.p.quorumPct}%`}</text>
                        </g>
                      ) : (
                        showPct && (
                          <g>
                            <circle cx={leftSide ? p.x + 38 : p.x - 38} cy={p.y - 22} r={11} fill="#0f0a1e" stroke="rgba(255,255,255,0.16)" />
                            <text x={leftSide ? p.x + 38 : p.x - 38} y={p.y - 17.8} textAnchor="middle" fontSize={7.5} fontWeight={800} fill={pctVal! >= 85 ? "#a3e635" : "#fbbf24"}>{pctVal}%</text>
                          </g>
                        )
                      )}
                    </g>
                  );
                })}
          </svg>
          </div>
        </div>
        {/* viewport-fixed infinite edge fades — ensures no hard start/end even without mask support — purple road never terminates */}
        <div className="pointer-events-none absolute left-1/2 top-[104px] z-[15] h-[96px] w-[96%] max-w-[560px] -translate-x-1/2 rounded-t-[28px]" style={{ background: "linear-gradient(to bottom, rgba(13,59,42,0.98) 0%, rgba(13,59,42,0.84) 34%, rgba(13,59,42,0.42) 68%, transparent 100%)" }} />
        <div className="pointer-events-none absolute bottom-0 left-1/2 z-[15] h-[140px] w-[96%] max-w-[560px] -translate-x-1/2 rounded-b-[28px]" style={{ background: "linear-gradient(to top, rgba(13,59,42,0.98) 0%, rgba(13,59,42,0.72) 36%, transparent 100%)" }} />

        {/* create modal */}
        {showCreate && (
          <div className="absolute inset-0 z-40 flex items-start justify-center bg-black/70 px-3 pt-[86px] backdrop-blur-sm sm:pt-[90px]">
            <form onSubmit={handleCreate} className="w-full max-w-[520px] rounded-[20px] border border-white/10 bg-[#0b0f1e] p-5 shadow-2xl">
              <div className="flex items-center justify-between">
                <h3 className="text-[16px] font-bold text-white">New gist — light-off bubble</h3>
                <button type="button" onClick={() => setShowCreate(false)} className="rounded-full bg-white/10 px-3 py-1 text-sm text-white">✕</button>
              </div>
              <p className="mt-1 text-[12.5px] leading-5 text-slate-400">Creates a dimmed personal bubble. We wait for <b className="text-slate-200">80% of target active 10s</b> then broadcast. Pops onto road at its time position.</p>
              <div className="mt-4 grid gap-3">
                <input value={fTitle} onChange={(e) => setFTitle(e.target.value)} placeholder="Title e.g. LT2 moved to LT5" className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none focus:border-violet-500" required />
                <input value={fVenue} onChange={(e) => setFVenue(e.target.value)} placeholder="Venue e.g. LT5" className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none focus:border-violet-500" required />
                <div className="grid grid-cols-2 gap-3">
                  <input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-sm text-white outline-none" required />
                  <input type="time" value={fTime} onChange={(e) => setFTime(e.target.value)} className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-sm text-white outline-none" required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <select value={fScope} onChange={(e) => setFScope(e.target.value)} className="rounded-xl border border-white/10 bg-[#12172a] px-3 py-2.5 text-sm text-white outline-none">
                    <option value="whole_school">whole_school — all ({statsUsers})</option>
                    <option value="level">level — ~{Math.max(3, Math.ceil(statsUsers * 0.25))} target</option>
                    <option value="programme">programme</option>
                    <option value="general">general</option>
                  </select>
                  <input value={fScopeVal} onChange={(e) => setFScopeVal(e.target.value)} placeholder={fScope === "level" ? "e.g. 300L" : "scope value (optional)"} className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none" />
                </div>
              </div>
              <div className="mt-2 rounded-xl bg-violet-500/10 px-3 py-2.5 text-[11px] leading-4 text-violet-200">
                Quorum: <b>{fScope === "whole_school" ? `80% of ${statsUsers} ≈ ${Math.ceil(statsUsers * 0.8)} active` : `80% of ~${Math.max(3, Math.ceil(statsUsers * 0.25))} ≈ ${Math.ceil(Math.max(3, Math.ceil(statsUsers * 0.25)) * 0.8)} active`}</b> for 10s → broadcast. Light stays off until then. Road sorts by WAT time.
              </div>
              <div className="mt-4 flex gap-2">
                <button type="submit" disabled={creating} className="flex-1 rounded-full bg-white py-2.5 text-sm font-black text-black hover:bg-slate-100 disabled:opacity-60">{creating ? "…" : "Create bubble (light off)"}</button>
                <button type="button" onClick={() => setShowCreate(false)} className="rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white">Cancel</button>
              </div>
            </form>
          </div>
        )}

        {/* bottom sheet */}
        <div className={`absolute inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-3 sm:px-6 sm:pb-4 transition-transform duration-300 ${sheetOpen ? "translate-y-0" : "translate-y-[calc(100%-44px)]"}`}>
          <div className="w-full max-w-[680px] overflow-hidden rounded-[24px] border border-white/[0.09] bg-[#080c18]/95 shadow-[0_16px_64px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl">
            <button onClick={() => setSheetOpen((v) => !v)} className="flex w-full items-center justify-center gap-2 border-b border-white/[0.06] bg-white/[0.03] py-2.5">
              <span className="h-1.5 w-9 rounded-full bg-white/20" />
              <span className="font-mono text-[10.5px] tracking-wide text-slate-400">{sheetOpen ? "tap to collapse" : "tap to expand · details"}</span>
              <span className="text-xs text-slate-500">{sheetOpen ? "⌄" : "⌃"}</span>
            </button>
            <div className="max-h-[58vh] overflow-auto p-4 sm:p-5">
              {err ? (
                <div className="rounded-2xl border border-red-400/20 bg-red-400/10 p-5 text-center">
                  <p className="text-sm font-medium text-red-200">road is down</p><p className="mt-1 font-mono text-xs text-red-200/70">{err}</p>
                  <button onClick={() => fetchFeed()} className="mt-3 rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-black">try again</button>
                </div>
              ) : loading ? (
                <div className="space-y-3"><div className="h-5 w-1/2 animate-pulse rounded bg-white/10" /><div className="h-3 w-3/4 animate-pulse rounded bg-white/5" /><div className="h-3 w-2/3 animate-pulse rounded bg-white/5" /></div>
              ) : selectedPersonal ? (
                (() => { const p = selectedPersonal; const target = quorumTarget(p.scope_type); const need = Math.ceil(target * 0.8); const activeEst = Math.round((p.quorumPct / 80) * need); return (
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-700 text-sm font-black text-white">◐</span>
                        <div>
                          <h2 className="text-[17px] font-bold leading-tight text-white">{p.title} <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold tracking-wide text-slate-300">LIGHT OFF</span></h2>
                          <p className="font-mono text-[11px] tracking-wide text-slate-500">{p.venue} · {fmtDate(p.event_date)} {fmtTime(p.event_time)} · {p.scope_type}{p.scope_value ? ` · ${p.scope_value}` : ""}</p>
                        </div>
                      </div>
                      <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 font-mono text-[11px] font-bold text-slate-300">personal · not broadcast</span>
                    </div>
                    <div className="mt-4 rounded-2xl border border-white/10 bg-black/40 p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-black text-sm" style={{ animation: "tickPulse 1s ease-in-out infinite" }}>◷</span>
                          <div>
                            <p className="font-mono text-[11px] font-bold tracking-wide text-white" style={{ fontVariantNumeric: "tabular-nums" }}>{wat.timePart} WAT <span className="text-slate-500">· ticking</span></p>
                            <p className="font-mono text-[10px] text-slate-500">personal bubble · dimmed until quorum</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-mono text-[11px] font-bold text-amber-300">{p.quorumPct >= 80 ? `broadcast in ${p.countdown}s` : `waiting for quorum`}</p>
                          <p className="font-mono text-[10px] text-slate-500">{activeEst}/{need} active · target {target} ({p.scope_type})</p>
                        </div>
                      </div>
                      <div className="mt-3">
                        <div className="flex justify-between font-mono text-[10px] text-slate-500"><span>quorum {p.quorumPct}%</span><span>need 80% for 10s</span></div>
                        <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10">
                          <div className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-400 transition-all duration-500" style={{ width: `${p.quorumPct}%` }} />
                        </div>
                        {p.quorumPct >= 80 && <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-amber-400 transition-all" style={{ width: `${(10 - p.countdown) / 10 * 100}%` }} /></div>}
                        <p className="mt-2 font-mono text-[10.5px] text-slate-400">{p.quorumPct < 80 ? `Gathering — need ${need} of ${target} active. Your bub is light-off; nobody else sees it yet.` : p.broadcasting ? "Broadcasting to Neon…" : `✓ 80% active reached — holding ${10 - p.countdown}/10s then broadcast → amber advisory on road.`}</p>
                      </div>
                    </div>
                    <div className="mt-4 flex gap-2">
                      <button onClick={() => setPersonal((pr) => pr.filter((x) => x.localId !== p.localId))} className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-300">Discard</button>
                      <button onClick={() => { if (p.quorumPct >= 80) { setPersonal((pr) => pr.map((x) => x.localId === p.localId ? { ...x, countdown: 0 } : x)); } else setToast("still waiting for 80% — tell coursemates to open app"); }} className="rounded-full bg-white px-4 py-2 text-sm font-bold text-black">Force broadcast</button>
                    </div>
                    <p className="mt-3 font-mono text-[10px] text-slate-600">Whole school vs level quorum: whole_school needs more actives. Level gist broadcasts faster.</p>
                  </div>
                ); })()
              ) : selectedEvent ? (
                (() => {
                  const ev = selectedEvent;
                  const verified = isVerified(ev);
                  const ap = Number(ev.authority_points ?? 0);
                  const rp = Number(ev.required_points ?? 0);
                  const pct = rp > 0 ? Math.min(100, Math.round((ap / rp) * 100)) : verified ? 100 : 0;
                  const isAlmost = pct >= 85 && !verified;
                  const isAdvisory = ev.status === "pending" && !verified && !isAlmost;
                  return (
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[15px] font-black text-white shadow ${verified ? "bg-emerald-500" : isAlmost ? "bg-lime-500" : isAdvisory ? "bg-amber-500" : "bg-blue-600"}`}>{verified ? "✓" : isAlmost ? "◉" : isAdvisory ? "●" : "○"}</span>
                          <div>
                            <h2 className="text-[17px] font-bold leading-tight text-white">{ev.title}</h2>
                            <p className="font-mono text-[11px] tracking-wide text-slate-500">{ev.venue} · {fmtDate(ev.event_date)} {fmtTime(ev.event_time)} · {ev.scope_type}{ev.scope_value ? ` · ${ev.scope_value}` : ""}</p>
                          </div>
                        </div>
                        <span className={`shrink-0 rounded-full px-3 py-1.5 font-mono text-[11px] font-bold ${verified ? "bg-emerald-500 text-white" : isAlmost ? "bg-lime-400 text-black" : isAdvisory ? "border border-amber-400/20 bg-amber-400/10 text-amber-200" : "border border-blue-400/20 bg-blue-500/10 text-blue-200"}`}>{verified ? "✓ canonical" : isAlmost ? "◉ almost" : isAdvisory ? "● advisory" : "○ waiting"}</span>
                      </div>
                      <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-black text-xs font-bold" style={{ animation: "tickPulse 1s ease-in-out infinite" }}>◷</span>
                        <span className="font-mono text-[11px] font-semibold tracking-wide text-white" style={{ fontVariantNumeric: "tabular-nums" }}>{fmtTime(ev.event_time)} · {fmtDate(ev.event_date)}</span>
                        <span className="font-mono text-[10px] text-slate-500">· WAT · {wat.timePart} tick</span>
                        <span className="ml-auto font-mono text-[10px] text-slate-500">target {quorumTarget(ev.scope_type)} · {ev.scope_type}</span>
                      </div>
                      {rp > 0 && (
                        <div className="mt-4">
                          <div className="flex items-center justify-between font-mono text-[11px] text-slate-500"><span>{ap}/{rp} points</span><span className={verified ? "text-emerald-300" : isAlmost ? "text-lime-300" : "text-amber-300"}>{pct}% to green</span></div>
                          <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-white/10">
                            <div className={`h-full transition-all duration-700 ${verified ? "bg-emerald-400" : isAlmost ? "bg-gradient-to-r from-amber-400 to-emerald-400" : isAdvisory ? "bg-amber-400" : "bg-blue-400"}`} style={{ width: `${pct}%`, transform: isAlmost ? `scaleY(1.2)` : undefined, transformOrigin: "left" }} />
                          </div>
                          <p className="mt-1.5 font-mono text-[11px] text-slate-500">{verified ? "✓ canonical pop — enough Yes to trust" : isAlmost ? "amber → green scaling — almost verified, one more Yes to pop" : "needs more Yes taps to flip to green tick"}</p>
                        </div>
                      )}
                      {!rp && verified && <p className="mt-4 rounded-xl bg-emerald-500/10 px-3 py-2.5 text-[12.5px] text-emerald-200">Verified — coursemates confirmed this happened.</p>}
                      {!rp && !verified && <p className="mt-4 rounded-xl bg-amber-500/10 px-3 py-2.5 text-[12.5px] text-amber-200">Advisory — fresh gist, waiting for confirmations.</p>}
                      <div className="mt-4">
                        <p className="font-mono text-[11px] uppercase tracking-wide text-slate-500">Were you there?</p>
                        <div className="mt-2.5 flex flex-wrap items-center gap-2">
                          <button onClick={() => vote(ev.id, "YES")} disabled={!!voteBusy} className="rounded-full border border-emerald-500/30 bg-emerald-500/15 px-5 py-2.5 text-[13.5px] font-semibold text-emerald-300 hover:bg-emerald-500 hover:text-white transition disabled:opacity-50">{voteBusy === ev.id + "YES" ? "…" : "Yes ✓"}</button>
                          <button onClick={() => vote(ev.id, "NO")} disabled={!!voteBusy} className="rounded-full border border-white/10 bg-white/[0.05] px-5 py-2.5 text-[13.5px] font-medium text-slate-200 hover:bg-white hover:text-black transition disabled:opacity-50">{voteBusy === ev.id + "NO" ? "…" : "No ✕"}</button>
                          <button onClick={() => vote(ev.id, "CANCEL")} disabled={!!voteBusy} className="rounded-full border border-white/10 bg-white/[0.02] px-5 py-2.5 text-[13.5px] font-medium text-slate-400 hover:bg-white/[0.08] hover:text-white transition disabled:opacity-50">{voteBusy === ev.id + "CANCEL" ? "…" : "Skip"}</button>
                          <span className="font-mono text-[11px] text-slate-600">uses physi_profile</span>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button onClick={() => fetchFeed()} className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[13px] font-medium text-slate-200">↻ refresh road</button>
                        <button onClick={() => scrollToNow(true)} className="rounded-full border border-violet-400/20 bg-violet-500/15 px-4 py-2 text-[13px] font-medium text-violet-200">◎ center NOW</button>
                        <a href="/app/timetable" className="rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-black">Open timetable →</a>
                      </div>
                      <div className="mt-4 flex gap-1.5 overflow-auto pb-1">
                        {events.slice(0, 12).map((e) => {
                          const v = isVerified(e); const adv = e.status === "pending" && !v;
                          return <button key={e.id} onClick={() => { setSelectedId(e.id); setSheetOpen(true); }} className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-medium transition ${selectedId === e.id ? "border-white bg-white text-black" : v ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : adv ? "border-amber-400/30 bg-amber-500/10 text-amber-200" : "border-white/10 bg-white/[0.03] text-slate-400"}`}>{e.title.slice(0, 14)}</button>;
                        })}
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div className="text-center py-6">
                  <p className="text-sm text-slate-300">No events yet — create a gist to see light-off bubble.</p>
                  <button onClick={() => setShowCreate(true)} className="mt-3 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-black">＋ Create first gist</button>
                  <p className="mt-3 font-mono text-[10px] text-slate-500">Road sorts by WAT time · NOW at center · {wat.timePart}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
