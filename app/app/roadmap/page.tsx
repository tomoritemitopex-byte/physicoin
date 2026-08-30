"use client";
import { Fredoka } from "next/font/google";
const fredoka = Fredoka({ subsets: ["latin"], weight: ["400","500","600","700"], display: "swap", variable: "--font-fredoka" });
import { useEffect, useState, useCallback, useMemo, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { logError, getErrorMessage } from "@/lib/adapters/error";
import SearchBar from "@/components/road/SearchBar";
import QuorumBar from "@/components/road/QuorumBar";
const RepExplainer = dynamic(()=> import("@/components/road/RepExplainer"), { ssr: false, loading: ()=> null }) as any;
const RepBoard = dynamic(()=> import("@/components/road/RepBoard"), { ssr: false, loading: ()=> null }) as any;
const ShareCard = dynamic(()=> import("@/components/road/ShareCard"), { ssr: false, loading: ()=> null });

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
  created_by?: string | null;
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

function timeToMin(t: string): number { const p = String(t ?? "00:00").slice(0,5).split(":"); const h = parseInt(p[0]||"0",10)||0; const m = parseInt(p[1]||"0",10)||0; return h*60+m; }
function isConflictPair(a: EventRow, b: EventRow): boolean {
  if (String(a.event_date).slice(0,10) !== String(b.event_date).slice(0,10)) return false;
  const diff = Math.abs(timeToMin(a.event_time) - timeToMin(b.event_time));
  if (diff > 30) return false;
  const va = String(a.venue||"").trim().toLowerCase();
  const vb = String(b.venue||"").trim().toLowerCase();
  if (!va || !vb) return false;
  if (va === vb) return false;
  return true;
}

// --- Levels helper ---
type LevelInfo = { lvl: number; name: string; min: number; max: number|null; progress: number; nextAt: number|null };
const LEVEL_NAMES: Record<number,string> = {1:"Explorer",2:"Scout",3:"Guide",4:"Sage",5:"Legend"};
function getLevelInfo(rep: number): LevelInfo {
  const r = Number(rep) || 0;
  if (r >= 60) return { lvl:5, name: LEVEL_NAMES[5], min:60, max:null, progress:1, nextAt:null };
  if (r >= 30) return { lvl:4, name: LEVEL_NAMES[4], min:30, max:60, progress:(r-30)/(60-30), nextAt:60 };
  if (r >= 15) return { lvl:3, name: LEVEL_NAMES[3], min:15, max:30, progress:(r-15)/(30-15), nextAt:30 };
  if (r >= 5) return { lvl:2, name: LEVEL_NAMES[2], min:5, max:15, progress:(r-5)/(15-5), nextAt:15 };
  return { lvl:1, name: LEVEL_NAMES[1], min:0, max:5, progress:r/5, nextAt:5 };
}
// --- Rep sparkline: 60x16 mini SVG from localStorage history or synthetic fallback
function RepSparkline({ rep }: { rep: number }) {
  const [pts, setPts] = useState<number[] | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("physi_rep_history");
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr) && arr.length >= 2) {
          const nums = arr.map((n: any) => Number(n)).filter((n: number) => isFinite(n)).slice(-7);
          if (nums.length >= 2) { setPts(nums); return; }
        }
      }
    } catch {}
    // fallback synthetic trend based on rep: gentle rise to current rep
    const r = Number(rep) || 0;
    const base = Math.max(0.6, r * 0.52);
    const synth = Array.from({ length: 7 }, (_, i) => {
      const t = i / 6;
      const wiggle = Math.sin(i * 1.7) * 0.35 + Math.cos(i * 0.9) * 0.22;
      const v = base + (r - base) * (0.35 + 0.65 * t) + wiggle;
      return Math.max(0.15, Number(v.toFixed(2)));
    });
    setPts(synth);
  }, [rep]);
  // persist rep history (push on change, keep 30)
  useEffect(() => {
    try {
      const r = Number(rep);
      if (!isFinite(r)) return;
      const raw = localStorage.getItem("physi_rep_history");
      let arr: number[] = [];
      if (raw) { try { const p = JSON.parse(raw); if (Array.isArray(p)) arr = p.map((n:any)=>Number(n)).filter((n:number)=>isFinite(n)); } catch {} }
      if (arr.length === 0 || arr[arr.length - 1] !== r) {
        arr.push(r);
        if (arr.length > 30) arr = arr.slice(-30);
        localStorage.setItem("physi_rep_history", JSON.stringify(arr));
      }
    } catch {}
  }, [rep]);
  if (!pts || pts.length < 2) return null;
  const w = 60, h = 16, pad = 1.5;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const range = max - min || 1;
  const stepX = (w - pad * 2) / (pts.length - 1);
  const points = pts.map((v, i) => {
    const x = pad + i * stepX;
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
  const filled = points + ` L ${(pad + (pts.length - 1) * stepX).toFixed(1)} ${(h - pad).toFixed(1)} L ${pad.toFixed(1)} ${(h - pad).toFixed(1)} Z`;
  const lastUp = pts[pts.length - 1] >= pts[0];
  const col = lastUp ? "#10b981" : "#f59e0b";
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0" aria-hidden>
      <path d={filled} fill={col} opacity={0.14} />
      <path d={points} fill="none" stroke={col} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function todayWAT(): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone:"Africa/Lagos", year:"numeric", month:"2-digit", day:"2-digit" }).format(new Date());
  } catch { return new Date().toISOString().slice(0,10); }
}
function isTodayWAT(dateStr: string): boolean {
  const d = String(dateStr).slice(0,10);
  return d === todayWAT();
}
function vibrate(ms: number){ try{ if(typeof navigator!=="undefined" && navigator.vibrate) navigator.vibrate(ms); }catch{} }
function playPop(){
  try{
    const ctx = new (window as any).AudioContext() || new (window as any).webkitAudioContext();
    if(!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(880, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.12);
    g.gain.setValueAtTime(0.28, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.14);
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + 0.15);
  }catch{}
}

const GHOST_REP: { handle: string; rep: number; color: string; bg: string }[] = [
  { handle: "alex_02", rep: 12.4, color: "#10b981", bg: "#065f46" },
  { handle: "zara_11", rep: 10.2, color: "#f59e0b", bg: "#78350f" },
  { handle: "mike_07", rep: 9.8, color: "#0ea5e9", bg: "#0c4a6e" },
  { handle: "nini_04", rep: 8.1, color: "#8b5cf6", bg: "#4c1d95" },
  { handle: "tomi_09", rep: 7.5, color: "#ec4899", bg: "#831843" },
];

function RoadmapInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deepPulseId, setDeepPulseId] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [mineHasNew, setMineHasNew] = useState(false);
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
  // swipe verify state
  const [drag, setDrag] = useState({ x: 0, y: 0, active: false });
  const [candy, setCandy] = useState<string | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const dragPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const draggingRef = useRef(false);
  // quest
  const [qTap, setQTap] = useState(false);
  const [qSwipe, setQSwipe] = useState(false);
  const [qRep, setQRep] = useState(false);
  const [questDone, setQuestDone] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  // daily quest: Verify 3 today → +5 bonus (WAT date, localStorage)
  const [dailyCount, setDailyCount] = useState(0);
  const [dailyBonusDone, setDailyBonusDone] = useState(false);
  // pulse ghost toasts
  const [pulseMsg, setPulseMsg] = useState<string | null>(null);
  const [pulseShow, setPulseShow] = useState(false);
  // FAB direct create
  const [fabOpen, setFabOpen] = useState(false);
  const [fabBusy, setFabBusy] = useState(false);
  const [fabTitle, setFabTitle] = useState("");
  const [fabVenue, setFabVenue] = useState("");
  const [fabDate, setFabDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [fabTime, setFabTime] = useState("10:00");
  // rep board + streak + invite
  const [repBoard, setRepBoard] = useState<typeof GHOST_REP>(GHOST_REP);
  const [repSheetOpen, setRepSheetOpen] = useState(false);
  const [youHandle, setYouHandle] = useState<string | null>(null);
  const [streak, setStreak] = useState<number>(0);
  const [inviteNudge, setInviteNudge] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  // inline handle picker modal
  const PICKER_COLORS = ["#10b981","#0ea5e9","#8b5cf6","#f59e0b"] as const;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerHandle, setPickerHandle] = useState("");
  const [pickerColor, setPickerColor] = useState<string>(PICKER_COLORS[0]);
  const [pickerBusy, setPickerBusy] = useState(false);
  const [pickerErr, setPickerErr] = useState<string|null>(null);
  const pendingActionRef = useRef<{type:"vote", id:string, vote:"YES"|"NO"|"CANCEL", isFlag?:boolean} | {type:"fab"} | null>(null);
  // filter + levels + juice + search
  const [filter, setFilter] = useState<"all"|"my_level"|"today"|"verified"|"advisory"|"mine">("all");
  const [viewMode, setViewMode] = useState<"map"|"list">("map");
  const [searchQuery, setSearchQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false); // mobile drawer — frees 80px when closed
  const [searchPulseId, setSearchPulseId] = useState<string | null>(null);
  const [myLevel, setMyLevel] = useState<string|null>(null);
  const [myRep, setMyRep] = useState<number>(0);
  const [parallaxY, setParallaxY] = useState(0);
  // facepile — voters for selectedEvent
  const [facepile, setFacepile] = useState<{ yes: { id:string; handle:string; color:string; bg:string }[]; yesCount:number; noCount:number } | null>(null);
  const [facepileLoading, setFacepileLoading] = useState(false);
  const [facepileTick, setFacepileTick] = useState(0);
  // quorum + bell + virtualize
  const quorumActive = statsUsers; // alias for /api/stats active users
  const quorumThreshold = useMemo(()=> {
    const a = Number(quorumActive);
    if (!a || isNaN(a) || a <= 0) return 8;
    const t = Math.ceil(a * 0.8);
    return t > 0 ? t : 8;
  }, [quorumActive]);
  const [bellOpen, setBellOpen] = useState(false);
  const [bellCount, setBellCount] = useState(0);
  const [bellItems, setBellItems] = useState<{id:string; title:string; ts:number; sub:string}[]>([]);
  const [scrollPos, setScrollPos] = useState(0);
  const [viewH, setViewH] = useState(800);
  const bellSeenRef = useRef<number>(0);
  // shareable Rep card — lazy-loaded via dynamic ShareCard
  const [shareOpen, setShareOpen] = useState(false);
  const [repExplainerOpen, setRepExplainerOpen] = useState(false);

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

  // rep board: poll /api/stats or fallback ghosts, 30s live
  const fetchRepBoard = useCallback(async () => {
    try {
      const r = await fetch("/api/stats", { cache: "no-store" });
      const j = await r.json().catch(()=> ({} as any));
      // try to extract top rep list from various shapes, else keep ghosts
      let list: any[] | null = null;
      if (Array.isArray(j?.top)) list = j.top;
      else if (Array.isArray(j?.leaderboard)) list = j.leaderboard;
      else if (Array.isArray(j?.users)) list = j.users;
      else if (Array.isArray(j?.ranking)) list = j.ranking;
      else if (Array.isArray(j?.metrics?.top)) list = (j.metrics as any).top;
      if (list && list.length) {
        const mapped = list.slice(0,5).map((u:any, i:number) => {
          const h = u.nickname || u.handle || u.name || u.id || GHOST_REP[i]?.handle || "user_"+i;
          const rep = Number(u.authority_final ?? u.rep ?? u.score ?? u.mining_balance ?? GHOST_REP[i]?.rep ?? (10 - i));
          const g = GHOST_REP[i % GHOST_REP.length];
          return { handle: String(h), rep: rep || g.rep, color: g.color, bg: g.bg };
        });
        if (mapped.length) setRepBoard(mapped);
      }
    } catch {}
  }, []);

  useEffect(() => {
    const fallback = setTimeout(() => setLoading(false), 1500);
    fetchFeed();
    fetchStats();
    fetchRepBoard();
    const iv = setInterval(fetchRepBoard, 30000);
    return () => { clearTimeout(fallback); clearInterval(iv); };
  }, [fetchFeed, fetchStats, fetchRepBoard]);

  // parallax on scroll + keep myRep synced with repBoard you entry
  const levelInfo = getLevelInfo(myRep);
  useEffect(()=>{
    const el = scrollRef.current;
    if(!el) return;
    function onScroll(){ setParallaxY(el!.scrollTop * 0.08); }
    el.addEventListener("scroll", onScroll, { passive:true });
    return ()=> el.removeEventListener("scroll", onScroll);
  }, [scrollRef]);
  // keep myRep in sync with repBoard if youHandle matches a board entry with higher rep
  useEffect(()=>{
    if(!youHandle) return;
    const me = repBoard.find(u=> String(u.handle).toLowerCase()===youHandle);
    if(me){
      const r = Number(me.rep)||0;
      setMyRep(prev=> r>prev? r : prev);
    }
  }, [repBoard, youHandle]);

  // read ?filter=advisory from URL (zombie verify redirect) + view + event handled via searchParams
  useEffect(()=>{
    try{
      const sp = new URLSearchParams(window.location.search);
      const f = sp.get("filter");
      if(f && ["all","my_level","today","verified","advisory","mine"].includes(f)){
        setFilter(f as any);
      }
      const v = sp.get("view");
      if(v && ["map","list"].includes(v)){
        setViewMode(v as any);
      }
    }catch{}
  }, []);

  // URL sync — on filter/viewMode/deepPulseId/selectedId change, router.replace keeping existing params
  useEffect(()=>{
    try{
      const sp = new URLSearchParams(window.location.search);
      sp.set("filter", filter);
      sp.set("view", viewMode);
      const ev = (deepPulseId ? String(deepPulseId).split("__tile")[0] : (selectedId ? String(selectedId).split("__tile")[0] : ""));
      if(ev) sp.set("event", ev);
      else sp.delete("event");
      const qs = sp.toString();
      const cur = typeof window !== "undefined" ? window.location.search.replace(/^\?/,"") : "";
      if(qs !== cur){
        router.replace(`?${qs}`, { scroll: false } as any);
      }
    }catch{}
  }, [filter, viewMode, deepPulseId, selectedId, router]);

  // you highlight via physi_profile + streak via /api/mining or localStorage physi_streak
  useEffect(() => {
    try {
      const raw = localStorage.getItem("physi_profile");
      if (raw) {
        const p = JSON.parse(raw);
        if (p?.id) setMyUserId(String(p.id));
        const h = p?.nickname || p?.handle || p?.name || null;
        if (h) setYouHandle(String(h).toLowerCase());
        else if (p?.id) setYouHandle(String(p.id).slice(0,8).toLowerCase());
        if (p?.level) setMyLevel(String(p.level));
        const repVal = Number(p?.mining_balance ?? p?.authority_final ?? p?.authority_base ?? 0);
        if (!isNaN(repVal)) setMyRep(repVal);
      }
    } catch {}
    // streak: try localStorage first
    try {
      const s = localStorage.getItem("physi_streak");
      if (s) setStreak(Number(s) || 0);
    } catch {}
    // then try server /api/mining?user_id=
    (async () => {
      try {
        const raw = localStorage.getItem("physi_profile");
        if (!raw) return;
        const p = JSON.parse(raw);
        const uid = p?.id;
        if (!uid) return;
        const r = await fetch(`/api/mining?user_id=${encodeURIComponent(uid)}`, { cache: "no-store" });
        const j = await r.json().catch(()=> ({} as any));
        if (j?.ok && Array.isArray(j.logs) && j.logs.length) {
          // compute streak: consecutive days with a log (today/yesterday chain)
          const days = new Set<string>(j.logs.map((l:any)=> String(l.created_at).slice(0,10)));
          let cur = 0;
          const d = new Date();
          for (let i=0;i<30;i++) {
            const iso = d.toISOString().slice(0,10);
            if (days.has(iso)) { cur++; d.setDate(d.getDate()-1); } else break;
          }
          if (cur>0) {
            setStreak((prev)=> Math.max(prev, cur));
            try { localStorage.setItem("physi_streak", String(Math.max(cur, Number(localStorage.getItem("physi_streak")||0)))); } catch {}
          }
        }
      } catch {}
    })();
  }, []);

  function bumpStreakDaily() {
    try {
      const today = new Date().toISOString().slice(0,10);
      const last = localStorage.getItem("physi_streak_last");
      if (last === today) return;
      const cur = Number(localStorage.getItem("physi_streak") || String(streak) || "0") || 0;
      const next = cur + 1;
      localStorage.setItem("physi_streak", String(next));
      localStorage.setItem("physi_streak_last", today);
      setStreak(next);
    } catch {
      setStreak((s)=> s+1);
    }
  }
  // quest: load from localStorage + daily quest WAT reset
  useEffect(() => {
    try {
      const v = localStorage.getItem("physi_quest_done");
      if (v === "1" || v === "true") {
        setQTap(true); setQSwipe(true); setQRep(true); setQuestDone(true);
      }
    } catch {}
    // daily quest init: check WAT date reset
    try {
      const today = todayWAT();
      const storedDate = localStorage.getItem("physi_daily_date");
      const storedCnt = parseInt(localStorage.getItem("physi_daily_verified") || "0", 10) || 0;
      const storedBonus = localStorage.getItem("physi_daily_bonus") === "1";
      if (storedDate !== today) {
        localStorage.setItem("physi_daily_date", today);
        localStorage.setItem("physi_daily_verified", "0");
        localStorage.removeItem("physi_daily_bonus");
        setDailyCount(0); setDailyBonusDone(false);
      } else {
        setDailyCount(Math.min(3, storedCnt));
        setDailyBonusDone(storedBonus);
      }
    } catch {}
    // check midnight WAT reset every 60s
    const iv = setInterval(() => {
      try {
        const today = todayWAT();
        const storedDate = localStorage.getItem("physi_daily_date");
        if (storedDate !== today) {
          localStorage.setItem("physi_daily_date", today);
          localStorage.setItem("physi_daily_verified", "0");
          localStorage.removeItem("physi_daily_bonus");
          setDailyCount(0); setDailyBonusDone(false);
        }
      } catch {}
    }, 60000);
    return () => clearInterval(iv);
  }, []);
  // deep link ?event=<id> : read searchParams, find node, scroll + pulse
  useEffect(() => {
    try {
      const ev = searchParams.get("event");
      const f = searchParams.get("filter");
      if (f && ["all","my_level","today","verified","advisory","mine"].includes(f)) setFilter(f as any);
      const v = searchParams.get("view");
      if (v && ["map","list"].includes(v)) setViewMode(v as any);
      if (ev) {
        // set deep pulse id immediately; actual scroll happens when events loaded
        setDeepPulseId(ev);
        // if we already have events, select now
        if (ev) {
          setSelectedId(ev);
          setSheetOpen(true);
        }
      }
    } catch {}
  }, [searchParams]);
  // when events load and deepPulseId is set, scroll to node and keep pulse for 3.5s
  useEffect(() => {
    if (!deepPulseId || events.length === 0) return;
    const targetId = deepPulseId.split("__tile")[0];
    const exists = events.some(e => e.id === targetId) || personal.some(p => p.localId === targetId);
    if (!exists) return;
    setSelectedId(targetId);
    setSheetOpen(true);
    // scroll to node's Y via nodes index (use filtered or display index)
    const doScroll = () => {
      try {
        // try DOM scroll to element if present
        const el = document.getElementById(`node-${targetId}`);
        if (el && scrollRef.current) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        } else {
          // fallback: compute Y from roadItems
          const idx = [...events].sort((a,b)=> eventInstant(a.event_date,a.event_time)-eventInstant(b.event_date,b.event_time)).findIndex(e=> e.id===targetId);
          if (idx >=0 && scrollRef.current) {
            const y = 320 + idx * 128;
            const vh = scrollRef.current.clientHeight;
            scrollRef.current.scrollTo({ top: Math.max(0, y - vh/2 + 44), behavior: "smooth" });
          }
        }
      } catch {}
    };
    const t = setTimeout(doScroll, 220);
    const clear = setTimeout(()=> setDeepPulseId(null), 3800);
    return () => { clearTimeout(t); clearTimeout(clear); };
  }, [deepPulseId, events, personal]);
  // Mine polling: check for new verifications on user's events
  useEffect(() => {
    if (!myUserId) return;
    let cancelled=false;
    async function pollMine(){
      try{
        const r= await fetch("/api/timetable?limit=200",{ cache:"no-store"});
        const j= await r.json().catch(()=> ({} as any));
        const evs: EventRow[] = j.events ?? [];
        const mine = evs.filter(e=> String(e.created_by||"")===String(myUserId));
        if (cancelled) return;
        if (mine.length===0) { setMineHasNew(false); return; }
        const totalAp = mine.reduce((s,e)=> s+ Number(e.authority_points||0), 0);
        const totalVerified = mine.filter(isVerified).length;
        const key = `physi_mine_seen_${myUserId}`;
        const last = Number(localStorage.getItem(key) || "0");
        const seenCountKey = `physi_mine_seen_count_${myUserId}`;
        const lastCount = Number(localStorage.getItem(seenCountKey) || "0");
        // new activity if authority grew or new verified or new count
        if (totalAp > last || totalVerified > 0 && totalAp !== last || mine.length > lastCount) {
          // if user is currently on Mine filter, consider seen
          if (filter==="mine") {
            localStorage.setItem(key, String(totalAp));
            localStorage.setItem(seenCountKey, String(mine.length));
            setMineHasNew(false);
          } else {
            // only show dot if strictly bigger than last seen and not first load where last===0
            if (last>0 && totalAp>last) setMineHasNew(true);
            else if (mine.length>lastCount && lastCount>0) setMineHasNew(true);
            else {
              // first time seeing mine events - initialize without dot
              localStorage.setItem(key, String(totalAp));
              localStorage.setItem(seenCountKey, String(mine.length));
            }
          }
        }
        // also store current for external nav dot (layout reads same keys)
        try { localStorage.setItem("physi_mine_has_new", mineHasNew ? "1" : "0"); } catch{}
      }catch{}
    }
    pollMine();
    const iv=setInterval(pollMine,30000);
    return ()=>{ cancelled=true; clearInterval(iv); };
  }, [myUserId, filter]);
  // clear mine dot when user switches to Mine chip
  useEffect(()=>{
    if(filter==="mine" && myUserId){
      setMineHasNew(false);
      try{
        const r= events.filter(e=> String(e.created_by||"")===String(myUserId));
        const totalAp = r.reduce((s,e)=> s+ Number(e.authority_points||0),0);
        localStorage.setItem(`physi_mine_seen_${myUserId}`, String(totalAp));
        localStorage.setItem(`physi_mine_seen_count_${myUserId}`, String(r.length));
        localStorage.setItem("physi_mine_has_new","0");
        // dispatch to layout
        window.dispatchEvent(new CustomEvent("physi-mine-seen"));
      }catch{}
    }
  }, [filter, myUserId, events]);
  // quest complete -> confetti + persist
  const questProgress = (qTap?1:0)+(qSwipe?1:0)+(qRep?1:0);
  useEffect(() => {
    if (questProgress===3 && !questDone) {
      setQuestDone(true);
      setShowConfetti(true);
      try { localStorage.setItem("physi_quest_done","1"); } catch {}
      setToast("Quest complete — +5 Rep! 🎉");
      setTimeout(()=>setShowConfetti(false), 3200);
    }
  }, [questProgress, questDone]);
  // when candy earned, mark rep
  useEffect(() => { if (candy) setQRep(true); }, [candy]);
  // pulse toasts every 12s - pure UI ghosts
  useEffect(() => {
    const ghosts = ["zara_11","alex_02","mike_07","nini_04","tomi_09","chidi_12","sola_08","amaka_03"];
    const courses = ["BIO 101","CHM 111","PHY 101","MTH 101","GST 103","BIO 102","PHY 102"];
    const verbs = ["verified","confirmed","was there for","checked in to"];
    let timer: any;
    let hideTimer: any;
    function trigger() {
      const g = ghosts[Math.floor(Math.random()*ghosts.length)];
      const c = courses[Math.floor(Math.random()*courses.length)];
      const v = verbs[Math.floor(Math.random()*verbs.length)];
      const m = 1 + Math.floor(Math.random()*5);
      setPulseMsg(`${g} ${v} ${c} · ${m}m ago`);
      setPulseShow(true);
      clearTimeout(hideTimer);
      hideTimer = setTimeout(()=> setPulseShow(false), 2800);
    }
    const start = setTimeout(()=>{ trigger(); timer = setInterval(trigger, 12000); }, 3500);
    return ()=>{ clearTimeout(start); clearInterval(timer); clearTimeout(hideTimer); };
  }, []);
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

  // Facepile — fetch verifications for selectedEvent, show YES voters candy avatars
  useEffect(()=>{
    if(!selectedEvent){
      setFacepile(null);
      return;
    }
    let cancelled=false;
    const baseId = String(selectedEvent.id).split("__tile")[0];
    setFacepileLoading(true);
    (async()=>{
      try{
        const r = await fetch(`/api/verify?event_id=${encodeURIComponent(baseId)}`, { cache:"no-store" });
        const j = await r.json().catch(()=> ({} as any));
        const rows: any[] = j.verifications ?? j.rows ?? j.data ?? [];
        const yesRows = rows.filter((x:any)=> String(x.vote).toUpperCase()==="YES");
        const noRows = rows.filter((x:any)=> String(x.vote).toUpperCase()==="NO");
        const yes: { id:string; handle:string; color:string; bg:string }[] = [];
        for(let i=0;i<yesRows.length;i++){
          const v = yesRows[i];
          let handle: string | null = null;
          let color = GHOST_REP[i % GHOST_REP.length].color;
          let bg = GHOST_REP[i % GHOST_REP.length].bg;
          try{
            const pr = await fetch(`/api/profile?id=${encodeURIComponent(String(v.verifier_id))}`, { cache:"no-store" });
            const pj = await pr.json().catch(()=> ({} as any));
            if(pj?.user?.nickname) handle = String(pj.user.nickname);
            else if(pj?.user?.handle) handle = String(pj.user.handle);
            else if(pj?.user?.name) handle = String(pj.user.name);
            if(handle){
              // use profile candy color if present
              const c = (pj.user as any)?.candy_color || (pj.user as any)?.color || null;
              if(c && typeof c === "string" && /^#/.test(c)) color = c;
            }
          }catch{}
          if(!handle){
            const g = GHOST_REP[i % GHOST_REP.length];
            handle = g.handle;
            color = g.color;
            bg = g.bg;
          }
          yes.push({ id: String(v.verifier_id), handle: handle!, color, bg });
        }
        if(!cancelled){
          setFacepile({ yes, yesCount: yesRows.length, noCount: noRows.length });
        }
      }catch{
        if(!cancelled) setFacepile({ yes: [], yesCount: 0, noCount: 0 });
      } finally {
        if(!cancelled) setFacepileLoading(false);
      }
    })();
    return ()=>{ cancelled=true; };
  }, [selectedEvent?.id, facepileTick]);

  // --- Bell inbox: poll mine verifications + recent verifies -> dropdown items
  useEffect(()=>{
    if(!myUserId) return;
    let cancel=false;
    async function pollBell(){
      try{
        const r=await fetch("/api/timetable?limit=200",{cache:"no-store"});
        const j=await r.json().catch(()=>({} as any));
        const evs: EventRow[] = j.events ?? [];
        const mine = evs.filter(e=> String(e.created_by||"")===String(myUserId));
        const newlyVerified = mine.filter(isVerified);
        // build bell items from newly verified mine gists
        const items:{id:string; title:string; ts:number; sub:string}[] = newlyVerified.slice(0,8).map(e=> ({
          id: e.id, title: e.title, ts: Date.parse(e.created_at)||Date.now(), sub: "Your gist got verified ✓"
        }));
        // also add recent general verifications as fallback if mine empty (poll /api/verify recent via events)
        if(items.length===0 && evs.length){
          const recentVerified = evs.filter(isVerified).slice(0,5).map(e=> ({
            id: e.id, title: e.title, ts: Date.parse(e.created_at)||Date.now(), sub: "Gist verified · road"
          }));
          if(!cancel) setBellItems(recentVerified);
        } else {
          if(!cancel) setBellItems(items);
        }
        // badge count: unseen vs bellSeenRef
        const unseen = items.filter(it=> it.ts > bellSeenRef.current).length;
        // also respect mineHasNew badge: at least 1 if mineHasNew and items exist
        const count = unseen > 0 ? unseen : (mineHasNew && items.length>0 ? items.length : 0);
        if(!cancel) setBellCount(count);
      }catch{}
    }
    pollBell();
    const iv=setInterval(pollBell, 30000);
    // also listen for mine seen
    function onSeen(){ bellSeenRef.current = Date.now(); setBellCount(0); }
    if(typeof window!=="undefined") window.addEventListener("physi-mine-seen", onSeen as any);
    return ()=>{ cancel=true; clearInterval(iv); if(typeof window!=="undefined") window.removeEventListener("physi-mine-seen", onSeen as any); };
  }, [myUserId, mineHasNew]);

  // --- Virtualize: track scrollTop + viewport height (400px buffer)
  useEffect(()=>{
    const el = scrollRef.current;
    if(!el) return;
    function onScroll(){
      setScrollPos(el!.scrollTop);
    }
    function onResize(){
      setViewH(typeof window!=="undefined" ? window.innerHeight : 800);
      if(el) setScrollPos(el.scrollTop);
    }
    onResize();
    el.addEventListener("scroll", onScroll, {passive:true});
    window.addEventListener("resize", onResize);
    return ()=>{ el.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onResize); };
  }, [scrollRef]);

  // combined road items chronologically sorted
  type DemoItem = { kind: "demo"; localId: string; id: string; ms: number; title: string; venue: string; event_date: string; event_time: string; hint: string };
  type ForkItem = { kind: "fork"; id: string; ms: number; events: EventRow[]; ids: string[] };
  type RoadItem = { kind: "personal"; p: PersonalBubble; id: string; ms: number } | { kind: "event"; ev: EventRow; id: string; ms: number } | DemoItem | ForkItem;
  const roadItems: RoadItem[] = useMemo(() => {
    const pers: RoadItem[] = personal.map((p) => ({ kind: "personal", p, id: p.localId, ms: eventInstant(p.event_date, p.event_time) } as RoadItem));
    const evs: RoadItem[] = events.map((ev) => ({ kind: "event", ev, id: ev.id, ms: eventInstant(ev.event_date, ev.event_time) } as RoadItem));
    let all: RoadItem[] = [...pers, ...evs];
    // 3 local-only demo nodes when empty (hidden once real events exist, no DB)
    if (events.length === 0) {
      const nowMs = Date.now();
      // use today date for demo nodes so they land near NOW
      const today = new Date(nowMs);
      const isoDate = today.toISOString().slice(0,10);
      // stagger times around now: -30min, +90min, +240min
      const timeFromOffset = (mins: number)=>{
        const d=new Date(nowMs + mins*60*1000);
        return String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");
      };
      const demos: RoadItem[] = [
        { kind:"demo", localId:"demo_welcome", id:"demo_welcome", title:"Welcome — tap me", venue:"LT1", event_date: isoDate, event_time: timeFromOffset(-30), ms: eventInstant(isoDate, timeFromOffset(-30)), hint:"Tap a node to see details" },
        { kind:"demo", localId:"demo_swipe", id:"demo_swipe", title:"Swipe demo → Yes", venue:"LT2", event_date: isoDate, event_time: timeFromOffset(90), ms: eventInstant(isoDate, timeFromOffset(90)), hint:"Swipe card → Yes · ← No" },
        { kind:"demo", localId:"demo_create", id:"demo_create", title:"+ to gist", venue:"LT3", event_date: isoDate, event_time: timeFromOffset(240), ms: eventInstant(isoDate, timeFromOffset(240)), hint:"Hit + to post your gist" },
      ];
      all = [...all, ...demos];
    }
    all.sort((a, b) => a.ms - b.ms);
    return all;
  }, [personal, events]);

  // filtered road items by chip + search (live title/venue/event_date contains)
  const searchQ = searchQuery.trim().toLowerCase();
  const filteredRoadItems: RoadItem[] = useMemo(()=>{
    const hasDemo = roadItems.some(r=> r.kind==="demo");
    const demoBypass = hasDemo && events.length===0;
    let base: RoadItem[];
    if (demoBypass) base = roadItems;
    else if (filter==="all") base = roadItems;
    else {
      base = roadItems.filter(it=>{
        if((it as any).kind==="fork") return true;
        if(it.kind==="demo") return true;
        if(it.kind==="personal") return filter!=="verified";
        const ev = (it as any).ev as EventRow;
        if(filter==="mine") return myUserId ? String(ev.created_by||"")===String(myUserId) : false;
        if(filter==="verified") return isVerified(ev);
        if(filter==="advisory") return !isVerified(ev) && ev.status==="pending";
        if(filter==="today") return isTodayWAT(ev.event_date);
        if(filter==="my_level"){
          if(!myLevel) return false;
          const scopeMatch = String(ev.scope_value||"").toLowerCase()===String(myLevel).toLowerCase();
          const typeMatch = String(ev.scope_type||"").toLowerCase().includes("level");
          if(typeMatch && scopeMatch) return true;
          if(scopeMatch) return true;
          return false;
        }
        return true;
      });
    }
    if (!searchQ) return base;
    return base.filter(it=>{
      if (it.kind==="demo") {
        const d = it as DemoItem;
        return `${d.title} ${d.venue} ${d.event_date}`.toLowerCase().includes(searchQ);
      }
      if (it.kind==="personal") {
        const p = it.p;
        return `${p.title} ${p.venue} ${p.event_date}`.toLowerCase().includes(searchQ);
      }
      const ev = (it as any).ev as EventRow;
      return `${ev.title} ${ev.venue} ${ev.event_date}`.toLowerCase().includes(searchQ);
    });
  }, [roadItems, filter, myLevel, myUserId, events.length, searchQ]);

  const searchMatchCount = searchQ ? filteredRoadItems.filter(it=> it.kind!=="demo" || true).length : 0;

  // --- Fork Road: detect conflicts (same date, within 30min, different venue case-insensitive) ---
  const FORK_THRESHOLD = 8;
  const FORK_OFFSET = 28;
  const conflictGroups: EventRow[][] = useMemo(()=>{
    const evs = events; // base events, not filtered, to detect global conflicts
    const n = evs.length;
    if (n < 2) return [];
    const adj: number[][] = Array.from({length:n},()=>[]);
    for(let i=0;i<n;i++) for(let j=i+1;j<n;j++) if(isConflictPair(evs[i], evs[j])){ adj[i].push(j); adj[j].push(i); }
    const vis = new Array(n).fill(false);
    const groups: EventRow[][] = [];
    for(let i=0;i<n;i++) if(!vis[i] && adj[i].length>0){
      const stack=[i]; vis[i]=true; const comp:number[]=[];
      while(stack.length){ const u=stack.pop()!; comp.push(u); for(const v of adj[u]) if(!vis[v]){vis[v]=true; stack.push(v);} }
      if(comp.length>=2) groups.push(comp.map(idx=>evs[idx]));
    }
    return groups;
  }, [events]);

  // Map event id -> group index
  const conflictMap = useMemo(()=>{
    const m = new Map<string, number>();
    conflictGroups.forEach((g, gi)=> g.forEach(ev=> m.set(String(ev.id), gi)));
    return m;
  }, [conflictGroups]);

  // Fork-grouped view of filteredRoadItems: collapse conflict events into single fork node
  const forkGroupedRoadItems: RoadItem[] = useMemo(()=>{
    if (conflictGroups.length===0) return filteredRoadItems;
    // Build groups relevant to filtered view: only groups where at least 2 members pass current filter
    // Determine which filtered event ids are present
    const filteredIds = new Set(filteredRoadItems.filter(it=> (it as any).kind==="event").map(it=> String((it as any).ev.id)));
    // For each conflict group, collect members that are in filtered view
    const relevant = conflictGroups.map(g=> g.filter(ev=> filteredIds.has(String(ev.id)))).filter(g=> g.length>=2);
    if (relevant.length===0) return filteredRoadItems;
    const groupById = new Map<string, number>();
    relevant.forEach((g, gi)=> g.forEach(ev=> groupById.set(String(ev.id), gi)));
    const seen = new Set<number>();
    const out: RoadItem[] = [];
    for(const it of filteredRoadItems){
      if((it as any).kind !== "event"){ out.push(it as any); continue; }
      const evId = String((it as any).ev.id);
      const gi = groupById.get(evId);
      if(gi===undefined){ out.push(it as any); continue; }
      if(seen.has(gi)) continue;
      seen.add(gi);
      const grp = relevant[gi];
      const ms = Math.min(...grp.map(e=> eventInstant(e.event_date, e.event_time)));
      const fid = grp.map(e=> String(e.id)).join("__fork__") + "__fork";
      out.push({ kind: "fork", id: fid, ms, events: grp, ids: grp.map(e=> String(e.id)) } as ForkItem);
    }
    // Ensure chronological order after collapse
    out.sort((a,b)=> a.ms - b.ms);
    return out;
  }, [filteredRoadItems, conflictGroups]);
  const handleJump = useCallback(()=>{
    if (!searchQ || filteredRoadItems.length===0) { setToast("no match for search"); return; }
    const first = filteredRoadItems[0];
    const baseId = String(first.id).split("__tile")[0];
    setSelectedId(baseId);
    setSheetOpen(true);
    setDeepPulseId(baseId);
    setSearchPulseId(baseId);
    setTimeout(()=> setSearchPulseId(null), 2200);
    setTimeout(()=>{
      try{
        const el = document.getElementById(`node-${baseId}`);
        if (el && scrollRef.current) el.scrollIntoView({ behavior:"smooth", block:"center" });
        else {
          const idx = filteredRoadItems.findIndex(x=> String(x.id).split("__tile")[0]===baseId);
          if (idx>=0 && scrollRef.current) {
            const y = TOP_BUFFER + idx * STEP_Y;
            const vh = scrollRef.current.clientHeight;
            scrollRef.current.scrollTo({ top: Math.max(0, y - vh/2 + 44), behavior:"smooth" });
          }
        }
      }catch{}
    }, 80);
    setTimeout(()=> setDeepPulseId(null), 3500);
  }, [searchQ, filteredRoadItems]);

  // find NOW index (first item after now) — based on filtered view
  const nowIdx = useMemo(() => {
    const src = filteredRoadItems.length ? filteredRoadItems : roadItems;
    if (src.length === 0) return 0;
    const n = now;
    let idx = src.findIndex((it) => it.ms > n);
    if (idx === -1) idx = src.length;
    return idx;
  }, [filteredRoadItems, roadItems, now]);

  const selectedDemo = useMemo(() => roadItems.find(r=> r.kind==="demo" && (r.id===selectedId || (r as DemoItem).localId===selectedId)) as DemoItem | null ?? null, [roadItems, selectedId]);

  const wat = useMemo(() => formatWAT(now), [now]);

  // --- infinite loop road constants (no hard start/end — seamless endless) ---
  const STEP_Y = 128;
  const TOP_BUFFER = 320; // replaces hard START_Y cap — road extends far beyond viewport so caps never visible
  const BOTTOM_BUFFER = 480;
  const MIN_TILE = 18; // ensure road feels endless even with few events
  const ROAD_EXTEND = 420; // extra path length beyond first/last node — purple striped line never terminates, hidden by fade masks
  const VIEWPORT_FADE_TOP = 96; // mask fade top
  const VIEWPORT_FADE_BOT = 128; // mask fade bottom

  // tiled display items: duplicate to fill infinite illusion when few events (filtered+forked)
  const displayItems = useMemo(() => {
    const src: RoadItem[] = (forkGroupedRoadItems as RoadItem[]);
    if (src.length === 0) return [] as typeof roadItems;
    if (src.length >= MIN_TILE) return src as any;
    const repeats = Math.ceil(MIN_TILE / src.length);
    const out: typeof roadItems = [];
    for (let r = 0; r < repeats; r++) {
      for (let i = 0; i < src.length; i++) {
        const it: any = src[i];
        const tileId = it.id + "__tile" + r;
        out.push({ ...it, id: tileId } as any);
      }
    }
    return out as any;
  }, [forkGroupedRoadItems]);

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
    return displayItems.map((it: any, i: number) => {
      const y = TOP_BUFFER + i * STEP_Y;
      if (it.kind === "fork") return { x: 260, y };
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
    const baseLen = filteredRoadItems.length || roadItems.length;
    if (baseLen > 0 && baseLen < MIN_TILE) {
      return TOP_BUFFER + Math.floor(displayItems.length / 2) * STEP_Y;
    }
    return TOP_BUFFER + nowIdx * STEP_Y;
  }, [nowIdx, displayItems.length, filteredRoadItems.length, roadItems.length]);

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
    if ((item as any).kind === "fork") {
      // fork state derived from first event winner etc.
      const ev0 = (item as ForkItem).events[0];
      const ap = Number(ev0.authority_points ?? 0);
      const rp = Number(ev0.required_points ?? 0);
      const pct = rp > 0 ? Math.min(100, Math.round((ap / rp) * 100)) : isVerified(ev0) ? 100 : 0;
      if (isVerified(ev0)) return { key: "canonical", label: "FORK ✓", color: "#10b981", outline: "#8b5cf6", pct } as const;
      return { key: "advisory", label: "FORK ●", color: "#8b5cf6", outline: "#8b5cf6", pct } as const;
    }
    if (item.kind === "personal") {
      return { key: "personal", label: "light off", color: "#a1a1aa", outline: "#52525b", dimmed: true } as const;
    }
    if (item.kind === "demo") {
      return { key: "demo", label: item.hint, color: "#8b5cf6", outline: "#8b5cf6", dashed: true } as const;
    }
    const ev = (item as any).ev as EventRow;
    const ap = Number(ev.authority_points ?? 0);
    const rp = Number(ev.required_points ?? 0);
    const pct = rp > 0 ? Math.min(100, Math.round((ap / rp) * 100)) : isVerified(ev) ? 100 : 0;
    if (isVerified(ev)) return { key: "canonical", label: "canonical ✓", color: "#10b981", outline: "#10b981", pct, pop: true } as const;
    if (pct >= 85) return { key: "almost", label: "almost ●", color: "#84cc16", outline: "#a3e635", pct, scale: 1 + (pct - 85) / 80 } as const;
    if (ev.status === "pending") return { key: "advisory", label: "advisory ●", color: "#f59e0b", outline: "#f59e0b", pct } as const;
    if (ev.status === "waiting" || pct < 50) return { key: "waiting", label: "waiting ○", color: "#3b82f6", outline: "#3b82f6", pct } as const;
    return { key: "advisory", label: "advisory ●", color: "#f59e0b", outline: "#f59e0b", pct } as const;
  }

  function incrementDailyQuest() {
    try {
      const today = todayWAT();
      let storedDate = localStorage.getItem("physi_daily_date");
      if (storedDate !== today) {
        localStorage.setItem("physi_daily_date", today);
        localStorage.setItem("physi_daily_verified", "0");
        localStorage.removeItem("physi_daily_bonus");
        setDailyCount(0); setDailyBonusDone(false);
        storedDate = today;
      }
      const cur = parseInt(localStorage.getItem("physi_daily_verified") || "0", 10) || 0;
      const next = Math.min(3, cur + 1);
      localStorage.setItem("physi_daily_verified", String(next));
      localStorage.setItem("physi_daily_date", today);
      setDailyCount(next);
      if (next === 3) {
        const already = localStorage.getItem("physi_daily_bonus") === "1";
        if (!already) {
          localStorage.setItem("physi_daily_bonus", "1");
          setDailyBonusDone(true);
          setShowConfetti(true);
          setTimeout(()=> setShowConfetti(false), 3200);
          vibrate(50); playPop();
          setMyRep((prev)=> prev + 5);
          try{ const raw=localStorage.getItem("physi_profile"); if(raw){ const p=JSON.parse(raw); const nb=Number(p.mining_balance||0)+5; p.mining_balance=nb; localStorage.setItem("physi_profile", JSON.stringify(p)); } }catch{}
          setCandy("+5 bonus!");
          setTimeout(()=> setCandy(null), 1400);
          setToast("Daily quest complete — +5 bonus! 🎉");
        }
      }
    } catch {}
  }

  // ghost quorum — pure UI, no DB write. After user YES vote, 2-3s pick 1-2 ghosts, bump authority_points locally, show 7/8→8/8 and canonical pop/confetti.
  const ghostTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function triggerGhostQuorum(eventId: string) {
    if (ghostTimerRef.current) clearTimeout(ghostTimerRef.current);
    const delay = 2000 + Math.random() * 1000; // 2-3s
    ghostTimerRef.current = setTimeout(() => {
      const count = Math.random() > 0.45 ? 2 : 1;
      const picks = [...GHOST_REP].sort(() => 0.5 - Math.random()).slice(0, count);
      let didCanonical = false;
      setEvents((prev) =>
        prev.map((e) => {
          if (e.id !== eventId) return e;
          const ap = Number(e.authority_points ?? 0);
          const rpRaw = Number(e.required_points ?? 0);
          const rp = rpRaw > 0 ? rpRaw : quorumThreshold || 8;
          const newAp = ap + picks.length;
          const wasCanonical = rp > 0 ? ap >= rp : false;
          const nowCanonical = newAp >= rp;
          if (!wasCanonical && nowCanonical) didCanonical = true;
          // update status to verified if threshold reached for pop animation
          return { ...e, authority_points: newAp, status: nowCanonical ? "verified" : e.status } as EventRow;
        })
      );
      // facepile boost — add ghosts to YES pile locally
      setFacepile((prev) => {
        if (!prev) return prev;
        const ghosts = picks.map((g, i) => ({ id: `ghost_${g.handle}_${Date.now()}_${i}`, handle: g.handle, color: g.color, bg: g.bg }));
        return { ...prev, yes: [...prev.yes, ...ghosts], yesCount: prev.yesCount + picks.length };
      });
      setFacepileTick((t) => t + 1);
      if (didCanonical) {
        vibrate(60);
        playPop();
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 3200);
        setToast(`ghost quorum — ${picks.map((p) => p.handle).join(", ")} verified → canonical ✓`);
        setCandy("canonical ✓");
        setTimeout(() => setCandy(null), 1400);
      } else {
        vibrate(30);
        const cur = events.find((x) => x.id === eventId);
        const ap0 = cur ? Number(cur.authority_points ?? 0) + 1 /* user already +1 optimistically */ : 7;
        const rp0 = cur ? Number(cur.required_points ?? 0) || quorumThreshold || 8 : 8;
        const after = ap0 + picks.length;
        setToast(`ghost quorum — ${picks.map((p) => p.handle).join(", ")} also verified · ${after}/${rp0}`);
      }
    }, delay);
  }
  useEffect(() => () => { if (ghostTimerRef.current) clearTimeout(ghostTimerRef.current); }, []);

  async function vote(id: string, v: "YES" | "NO" | "CANCEL", isFlag?: boolean) {
    let verifierId: string | null = null;
    try {
      const raw = localStorage.getItem("physi_profile");
      if (raw) verifierId = JSON.parse(raw)?.id ?? null;
    } catch {}
    if (!verifierId) {
      openPickerForVote(id, v, isFlag);
      return;
    }
    // optimistic: instantly show +0.3 Rep and update local state before POST confirms
    const prevEvents = events;
    const prevRep = myRep;
    vibrate(v === "CANCEL" ? 20 : 35);
    playPop();
    setCandy("+0.3 Rep");
    setMyRep((prev)=> prev + 0.3);
    try{ const raw=localStorage.getItem("physi_profile"); if(raw){ const p=JSON.parse(raw); const nb=Number(p.mining_balance||0)+0.3; p.mining_balance=nb; localStorage.setItem("physi_profile", JSON.stringify(p)); } }catch{}
    setTimeout(() => setCandy(null), 1100);
    // optimistic event authority bump
    setEvents((prev)=> prev.map(e=> e.id===id ? { ...e, authority_points: Number(e.authority_points||0)+ (v==="YES"?1:0) } as any : e));
    setVoteBusy(id + v);
    try {
      const r = await fetch("/api/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ verifier_id: verifierId, event_id: id, vote: v }),
      });
      const j = await r.json();
      if (!r.ok || j.ok === false) throw new Error(j.error || "vote failed");
      incrementDailyQuest();
      if (isFlag) setToast("Thanks — flagged for review ✓"); else setToast(v === "YES" ? "you said you were there — thanks!" : v === "NO" ? "marked as not there" : "skipped — all good");
      setInviteNudge(true);
      setInviteCopied(false);
      bumpStreakDaily();
      // ghost quorum — pure UI, no DB, after Yes vote
      if (v === "YES" && !isFlag) triggerGhostQuorum(id);
      fetchFeed();
      fetchRepBoard();
      setFacepileTick(t=>t+1);
    } catch (e: unknown) {
      // revert optimistic on failure
      setEvents(prevEvents);
      setMyRep(prevRep);
      try{ const raw=localStorage.getItem("physi_profile"); if(raw){ const p=JSON.parse(raw); const nb=Math.max(0, Number(p.mining_balance||0)-0.3); p.mining_balance=nb; localStorage.setItem("physi_profile", JSON.stringify(p)); } }catch{}
      logError("VERIFY_SUBMIT_FAILED", e, { page: "roadmap" });
      setToast(getErrorMessage("VERIFY_SUBMIT_FAILED"));
    } finally {
      setVoteBusy(null);
    }
  }

  // --- picker helpers ---
  function ensureProfile(): string | null {
    try {
      const raw = localStorage.getItem("physi_profile");
      if (raw) {
        const p = JSON.parse(raw);
        if (p?.id) return String(p.id);
      }
    } catch {}
    return null;
  }
  function openPickerForVote(id: string, v: "YES"|"NO"|"CANCEL", isFlag?:boolean) {
    pendingActionRef.current = { type: "vote", id, vote: v, isFlag };
    setPickerHandle("");
    setPickerColor(PICKER_COLORS[Math.floor(Math.random()*PICKER_COLORS.length)]);
    setPickerErr(null);
    setPickerOpen(true);
  }
  function openPickerForFab() {
    pendingActionRef.current = { type: "fab" };
    setPickerHandle("");
    setPickerColor(PICKER_COLORS[Math.floor(Math.random()*PICKER_COLORS.length)]);
    setPickerErr(null);
    setPickerOpen(true);
  }
  async function handlePickerConfirm(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const h = pickerHandle.trim().toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0,16);
    if (!h || h.length < 2) { setPickerErr("pick a handle — 2-16 chars, letters/numbers/_"); return; }
    if (h.length < 2) { setPickerErr("too short"); return; }
    setPickerBusy(true); setPickerErr(null);
    try {
      const body = { nickname: h, full_name: h, programme: "Physiology", level: myLevel || "100L", statuses: [], authority_base: 1.0, authority_final: 1.0, candy_color: pickerColor };
      const r = await fetch("/api/profile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(()=> ({} as any));
      if (!r.ok || j.ok === false) throw new Error(j.error || j.hint || "could not create handle — maybe taken, try another");
      const user = j.user;
      try { localStorage.setItem("physi_profile", JSON.stringify({ ...user, candy_color: pickerColor })); } catch {}
      setMyUserId(String(user.id));
      setYouHandle(String(user.nickname || h).toLowerCase());
      setPickerOpen(false);
      setToast(`welcome @${h} ✓`);
      // retry pending action
      const pending = pendingActionRef.current;
      pendingActionRef.current = null;
      if (pending) {
        if (pending.type === "vote") {
          setTimeout(()=> vote(pending.id, pending.vote, pending.isFlag), 120);
        } else if (pending.type === "fab") {
          setTimeout(()=> { handleFabCreate(new Event("submit") as any); }, 120);
        }
      }
    } catch (err:any) {
      setPickerErr(err?.message || "could not create handle");
    } finally { setPickerBusy(false); }
  }

  // swipe handlers for detail bottom sheet (touch + mouse drag)
  function swipeStart(clientX: number, clientY: number) {
    dragStartRef.current = { x: clientX, y: clientY };
    dragPosRef.current = { x: 0, y: 0 };
    draggingRef.current = true;
    setDrag({ x: 0, y: 0, active: true });
  }
  function swipeMove(clientX: number, clientY: number) {
    if (!draggingRef.current || !dragStartRef.current) return;
    const dx = clientX - dragStartRef.current.x;
    const dy = clientY - dragStartRef.current.y;
    const cx = Math.max(-160, Math.min(160, dx));
    const cy = Math.max(-160, Math.min(60, dy));
    dragPosRef.current = { x: cx, y: cy };
    setDrag({ x: cx, y: cy, active: true });
  }
  function swipeEnd() {
    if (!draggingRef.current) {
      setDrag({ x: 0, y: 0, active: false });
      return;
    }
    const { x, y } = dragPosRef.current;
    draggingRef.current = false;
    dragStartRef.current = null;
    if (Math.abs(x) > 30 || y < -30) setQSwipe(true);
    const shouldVote = selectedEvent && !selectedPersonal && !voteBusy;
    if (shouldVote) {
      if (!ensureProfile()) {
        if (x > 80) openPickerForVote(selectedEvent.id, "YES");
        else if (x < -80) openPickerForVote(selectedEvent.id, "NO");
        else if (y < -80) openPickerForVote(selectedEvent.id, "CANCEL");
        setDrag({ x: 0, y: 0, active: false });
        return;
      }
      if (x > 80) { vibrate(35); vote(selectedEvent.id, "YES"); }
      else if (x < -80) { vibrate(35); vote(selectedEvent.id, "NO"); }
      else if (y < -80) { vibrate(20); vote(selectedEvent.id, "CANCEL"); }
    }
    setDrag({ x: 0, y: 0, active: false });
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

  async function handleFabCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!fabTitle.trim() || !fabVenue.trim() || !fabDate || !fabTime) { setToast("fill title, venue, date, time"); return; }
    if (!ensureProfile()) { openPickerForFab(); return; }
    setFabBusy(true);
    try {
      let createdBy: string | null = null;
      try { const raw = localStorage.getItem("physi_profile"); if (raw) createdBy = JSON.parse(raw)?.id ?? null; } catch {}
      const body: any = { title: fabTitle.trim(), venue: fabVenue.trim(), event_date: fabDate, event_time: fabTime, scope_type: "whole_school", scope_value: null, status: "pending", authority_points: 0, required_points: 5 };
      if (createdBy) body.created_by = createdBy;
      const r = await fetch("/api/timetable", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok || j.ok === false) throw new Error(j.error || "create failed");
      const wasFirst = (()=>{ try{ if(localStorage.getItem("physi_first_gist_done")==="1") return false; const c = myUserId ? events.filter(e=> String(e.created_by||"")===String(myUserId)).length : 0; return c===0; } catch{ return false; } })();
      if (wasFirst) {
        try{ localStorage.setItem("physi_first_gist_done","1"); localStorage.setItem("physi_first_gist_at", String(Date.now())); }catch{}
        setMyRep(prev=> prev+5);
        try{ const raw=localStorage.getItem("physi_profile"); if(raw){ const p=JSON.parse(raw); const nb=Number(p.mining_balance||0)+5; p.mining_balance=nb; localStorage.setItem("physi_profile", JSON.stringify(p)); } }catch{}
        setCandy("+5 bonus!");
        setTimeout(()=> setCandy(null), 1600);
        setToast(`first gist! +5 bonus 🎉`);
      } else {
        setToast(`created “${fabTitle.trim()}” ✓`);
      }
      setFabOpen(false); setFabTitle(""); setFabVenue(""); setFabTime("10:00"); setFabDate(new Date().toISOString().slice(0,10));
      fetchFeed();
    } catch (err:any) { logError("TIMETABLE_CREATE_FAILED", err, { page: "roadmap" }); setToast(getErrorMessage("TIMETABLE_CREATE_FAILED")); }
    finally { setFabBusy(false); }
  }

  const pastCount = nowIdx;
  const upcomingCount = (filteredRoadItems.length ? filteredRoadItems.length : roadItems.length) - nowIdx;

  return (
    <div className={`${fredoka.className} ${fredoka.variable} relative -mx-4 -mt-5 w-[100vw] max-w-[100vw] sm:-mx-6 lg:-mx-8`}>
      <style>{`@keyframes canonicalPop{0%{transform:scale(0.72)}50%{transform:scale(1.22)}100%{transform:scale(1)}} @keyframes tickPulse{0%,100%{opacity:1}50%{opacity:.55}} @keyframes roadShimmer{0%{stroke-dashoffset:0}100%{stroke-dashoffset:28}} @keyframes scaleIn{0%{transform:scale(0.35);opacity:0}60%{transform:scale(1.14);opacity:1}100%{transform:scale(1);opacity:1}} @keyframes nowPulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.06);opacity:.94}} @keyframes ghostDrift{0%{transform:translateY(0) translateX(0)}25%{transform:translateY(-10px) translateX(7px)}50%{transform:translateY(-16px) translateX(-5px)}75%{transform:translateY(-8px) translateX(4px)}100%{transform:translateY(0) translateX(0)}} @keyframes ghostPulse{0%,100%{opacity:.92}50%{opacity:.56}} @keyframes candyPop{0%{transform:translate(-50%,-10px) scale(0.5);opacity:0}18%{transform:translate(-50%,-18px) scale(1.18);opacity:1}72%{transform:translate(-50%,-42px) scale(1);opacity:1}100%{transform:translate(-50%,-64px) scale(0.9);opacity:0}} @keyframes pulseSlideIn{0%{transform:translate(-50%,-18px);opacity:0}12%{transform:translate(-50%,0);opacity:1}88%{transform:translate(-50%,0);opacity:1}100%{transform:translate(-50%,-18px);opacity:0}} @keyframes confettiFall{0%{transform:translateY(-10vh) rotate(0deg);opacity:1}100%{transform:translateY(110vh) rotate(720deg);opacity:0}} @keyframes skeletonPulse{0%,100%{opacity:0.55}50%{opacity:1}} @keyframes questFill{0%{width:0}100%{width:var(--fill)}} @keyframes forkMerge{0%{transform:translateX(0)}100%{transform:translateX(0)}} @keyframes forkWinnerPulse{0%,100%{filter:drop-shadow(0 0 0 rgba(16,185,129,0))}50%{filter:drop-shadow(0 0 8px rgba(16,185,129,0.9))}} @keyframes fabPulse{0%{transform:scale(1);box-shadow:0 8px 24px rgba(139,92,246,0.5),0 4px 12px rgba(0,0,0,0.3)}50%{transform:scale(1.08);box-shadow:0 12px 36px rgba(139,92,246,0.75),0 6px 18px rgba(0,0,0,0.4)}100%{transform:scale(1);box-shadow:0 8px 24px rgba(139,92,246,0.5),0 4px 12px rgba(0,0,0,0.3)}} @keyframes pulseRing{0%{transform:scale(0.8);opacity:0.9}70%{transform:scale(1.55);opacity:0}100%{transform:scale(1.7);opacity:0}} .road-3d-wrap{perspective:800px;perspective-origin:50% 28%} .road-3d-inner{transform-style:preserve-3d;transform:perspective(800px) rotateX(4deg);transform-origin:center top;will-change:transform;clip-path:ellipse(96% 88% at 50% 46%);border-radius:28px} .road-3d-inner::before{content:"";position:absolute;inset:0;pointer-events:none;border-radius:28px;box-shadow:inset 0 10px 22px rgba(0,0,0,0.16),inset 0 -8px 16px rgba(0,0,0,0.12)} .node-3d{transform:translateZ(6px);box-shadow:inset 0 1.5px 0 rgba(255,255,255,0.55),inset 0 -2px 4px rgba(0,0,0,0.14),0 8px 20px rgba(0,0,0,0.42),0 1px 6px rgba(0,0,0,0.32);transition:transform 220ms cubic-bezier(.2,.8,.3,1),box-shadow 220ms ease} .node-3d:hover{transform:translateZ(12px) scale(1.02);box-shadow:inset 0 1.5px 0 rgba(255,255,255,0.65),inset 0 -3px 6px rgba(0,0,0,0.16),0 12px 28px rgba(0,0,0,0.5),0 4px 12px rgba(0,0,0,0.36)}`}</style>
      <div className="relative min-h-[calc(100vh-64px)] w-full overflow-hidden xl:pr-[276px]" style={{ background: "linear-gradient(180deg, #0d3b2a 0%, #143d2e 42%, #1a5c3a 100%)" }}>
        {/* ambient - parallax */}
        <div className="pointer-events-none absolute inset-0" style={{ transform: `translateY(${parallaxY}px)`, willChange:"transform" }}>
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
              <button onClick={()=> setShareOpen(true)} className={`hidden h-7 w-7 items-center justify-center rounded-full text-[11px] font-black sm:flex hover:scale-110 transition ${levelInfo.lvl===5 ? "bg-amber-400 text-black ring-2 ring-amber-300" : "bg-white text-black"}`}>◉</button>
              <div>
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 sm:text-[11px]">endless time road · WAT</p>
                <p className="hidden text-[12px] font-semibold leading-none text-white sm:block">
                  {loading ? "Loading live road…" : roadItems.length ? `${pastCount} past · NOW · ${upcomingCount} ahead · tap a node` : "tap a node · create your gist"}
                </p>
                <div className="hidden sm:flex items-center gap-2 mt-1">
                  <button onClick={()=> setShareOpen(true)} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] font-black hover:scale-105 transition ${levelInfo.lvl===5 ? "bg-gradient-to-r from-amber-400 to-yellow-300 text-black ring-1 ring-amber-400" : "bg-white/10 text-white"}`}>Lvl {levelInfo.lvl} · {levelInfo.name}</button>
                  <span className="font-mono text-[10px] text-slate-400">{myRep.toFixed(1)} Rep</span>
                  <div className="h-1.5 w-16 overflow-hidden rounded-full bg-white/10"><div className={`h-full ${levelInfo.lvl===5 ? "bg-gradient-to-r from-amber-400 to-yellow-300" : "bg-emerald-400"}`} style={{ width: `${levelInfo.progress*100}%` }} /></div>
                  <RepSparkline rep={myRep} />
                  <span className="font-mono text-[9px] text-slate-500">{levelInfo.nextAt ? `${(levelInfo.nextAt - myRep).toFixed(1)} to L${levelInfo.lvl+1}` : "MAX"}</span>
                  <button onClick={()=> setRepExplainerOpen(true)} aria-label="What is Rep?" className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/20 bg-white/10 text-[11px] font-black text-white hover:bg-white hover:text-black transition" title="What is Rep?">ⓘ</button>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className="relative">
                <button onClick={()=>{ setBellOpen(v=>!v); if(!bellOpen){ bellSeenRef.current=Date.now(); setBellCount(0); try{ localStorage.setItem(`physi_bell_seen_${myUserId||'anon'}`, String(Date.now())); }catch{} } }} aria-label="Notifications" className="relative flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/60 text-white backdrop-blur hover:bg-white hover:text-black transition">
                  <span className="text-[14px]">🔔</span>
                  {(bellCount>0 || mineHasNew) && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-black text-white ring-2 ring-black">{bellCount>0 ? bellCount : 1}</span>}
                </button>
                {bellOpen && (
                  <div className="absolute right-0 top-9 z-40 w-[300px] overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f1e] shadow-2xl">
                    <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
                      <p className="text-[13px] font-bold text-white">Inbox</p>
                      <button onClick={()=>{ setBellOpen(false); bellSeenRef.current=Date.now(); setBellCount(0); }} className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">Mark seen</button>
                    </div>
                    <div className="max-h-[320px] overflow-auto">
                      {bellItems.length===0 ? (
                        <p className="px-4 py-6 text-center text-[12px] text-slate-400">No new verifications yet</p>
                      ) : bellItems.map(it=> (
                        <button key={it.id} onClick={()=>{ setSelectedId(it.id); setSheetOpen(true); setBellOpen(false); setDeepPulseId(it.id); }} className="flex w-full gap-3 border-b border-white/[0.06] px-4 py-3 text-left hover:bg-white/[0.04] transition">
                          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-[12px] font-black text-white">✓</span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[12px] font-semibold text-white">{it.title}</p>
                            <p className="text-[11px] text-emerald-300">{it.sub}</p>
                            <p className="font-mono text-[10px] text-slate-500">{new Date(it.ts).toLocaleTimeString()}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                    <button onClick={()=> setBellOpen(false)} className="w-full bg-white/5 py-2 text-[11px] font-semibold text-slate-300 hover:bg-white/10">Close</button>
                  </div>
                )}
              </div>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold sm:px-3 sm:py-1.5 sm:text-xs ${verifiedCount > 0 ? "bg-emerald-500 text-white" : "bg-white/10 text-slate-300"}`}>
                <span className="h-1.5 w-1.5 rounded-full bg-white/80" /> {verifiedCount} ✓
              </span>
              <span className="inline-flex items-center rounded-full bg-amber-500 px-2.5 py-1 text-[11px] font-bold text-white sm:px-3 sm:py-1.5 sm:text-xs">{advisoryCount} ●</span>
              <span className="hidden items-center gap-1 rounded-full border border-orange-400/20 bg-orange-500/15 px-2.5 py-1 text-[11px] font-black text-orange-200 sm:inline-flex" title="streak"><span>🔥</span>{streak}</span>
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
        {/* Quest bar - 3 dots with progress fill + daily quest ring */}
        <div className="pointer-events-none absolute left-1/2 top-[116px] z-20 flex w-full max-w-[560px] -translate-x-1/2 justify-center px-3 sm:top-[108px] sm:px-6">
          <div className="pointer-events-auto flex w-full items-center gap-2 rounded-full border border-white/10 bg-black/75 px-3 py-2 backdrop-blur-xl shadow-[0_8px_24px_rgba(0,0,0,0.5)] sm:px-4">
            <span className={`hidden ${fredoka.className} text-[14px] font-black tracking-tight text-amber-300 sm:inline`}>QUEST</span>
            <div className="relative flex flex-1 items-center justify-between gap-1">
              <div className="absolute left-[14px] right-[14px] top-1/2 h-[4px] -translate-y-1/2 rounded-full bg-white/10" />
              <div className="absolute left-[14px] top-1/2 h-[4px] -translate-y-1/2 rounded-full bg-gradient-to-r from-violet-500 to-emerald-400 transition-all duration-700" style={{ width: `calc(${(questProgress/3)*100}% - 28px)`, maxWidth: 'calc(100% - 28px)' }} />
              {[
                {label:"Tap node", done:qTap, idx:1},
                {label:"Swipe", done:qSwipe, idx:2},
                {label:"Earn Rep", done:qRep, idx:3},
              ].map(s=> (
                <div key={s.idx} className="relative z-[1] flex flex-col items-center gap-1">
                  <div className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-[11px] font-black transition-all duration-300 ${s.done ? "bg-white border-white text-black scale-105" : "bg-white/10 border-white/20 text-white/60"}`}>{s.done ? "✓" : s.idx}</div>
                  <span className={`hidden ${fredoka.className} text-[14px] font-black tracking-tight sm:inline ${s.done ? "text-white" : "text-slate-400"}`}>{s.label}</span>
                </div>
              ))}
            </div>
            <span className={`rounded-full px-2.5 py-1 ${fredoka.className} text-[14px] font-black tracking-tight ${questDone ? "bg-emerald-500 text-white" : "bg-white/10 text-slate-300"}`}>{questDone ? "Done ✓" : `${questProgress}/3`}</span>
            {/* daily quest: Verify 3 today → +5 bonus with progress ring */}
            <div className="hidden sm:flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-500/10 px-2.5 py-1.5">
              <div className="relative h-7 w-7 shrink-0">
                <svg className="h-7 w-7 -rotate-90" viewBox="0 0 28 28">
                  <circle cx="14" cy="14" r="11" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="3" />
                  <circle cx="14" cy="14" r="11" fill="none" stroke={dailyBonusDone ? "#10b981" : "#f59e0b"} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${(dailyCount/3)*69.1} 69.1`} style={{ transition: "stroke-dasharray 600ms ease" }} />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center font-mono text-[10px] font-black text-white">{dailyCount}/3</span>
              </div>
              <div className="leading-none">
                <p className={`${fredoka.className} text-[14px] font-black tracking-tight leading-none text-amber-200`}>Verify 3 today</p>
                <p className={`${fredoka.className} text-[14px] font-black tracking-tight leading-none text-amber-300/80`}>→ +5 bonus {dailyBonusDone ? "✓ claimed" : ""}</p>
              </div>
            </div>
            {/* mobile daily ring compact */}
            <div className="flex sm:hidden relative h-8 w-8 shrink-0 items-center justify-center">
              <svg className="h-8 w-8 -rotate-90" viewBox="0 0 28 28">
                <circle cx="14" cy="14" r="11" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="3" />
                <circle cx="14" cy="14" r="11" fill="none" stroke={dailyBonusDone ? "#10b981" : "#f59e0b"} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${(dailyCount/3)*69.1} 69.1`} />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center font-mono text-[9px] font-black text-white">{dailyCount}/3</span>
            </div>
          </div>
        </div>
        {/* mobile daily quest label below quest bar */}
        <div className="pointer-events-none absolute left-1/2 top-[162px] z-20 flex w-full max-w-[560px] -translate-x-1/2 justify-center px-3 sm:hidden">
          <span className={`rounded-full border border-amber-400/20 bg-black/75 px-3 py-1 ${fredoka.className} text-[14px] font-black tracking-tight text-amber-200 backdrop-blur`}>Verify 3 today → +5 bonus · {dailyCount}/3 {dailyBonusDone ? "✓ done" : ""}</span>
        </div>
        {/* mobile Filters drawer toggle — frees 80px when collapsed (mobile only) */}
        <div className="pointer-events-none absolute left-1/2 top-[126px] z-20 flex w-full max-w-[560px] -translate-x-1/2 justify-center px-3 sm:hidden">
          <button onClick={()=> setFiltersOpen(o=>!o)} className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/75 px-4 py-2 font-mono text-[11px] font-bold text-white backdrop-blur-xl shadow-[0_8px_24px_rgba(0,0,0,0.4)]">Filters {filtersOpen ? '▴' : '▾'} <span className="rounded-full bg-white/15 px-1.5 py-0.5 text-[10px]">{filter} · {viewMode}</span></button>
        </div>
        {/* desktop View+Filter+Search row — always visible */}
        <div className="pointer-events-none absolute left-1/2 top-[116px] z-20 hidden w-full max-w-[560px] -translate-x-1/2 justify-center gap-2 px-6 sm:flex">
          <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-white/10 bg-black/70 px-1.5 py-1 backdrop-blur-xl">
            <button onClick={()=> setViewMode("map")} className={`rounded-full px-3 py-1.5 font-mono text-[11px] font-bold transition ${viewMode==="map" ? "bg-white text-black shadow" : "bg-white/10 text-slate-300 hover:bg-white/15"}`}>⬢ Map</button>
            <button onClick={()=> setViewMode("list")} className={`rounded-full px-3 py-1.5 font-mono text-[11px] font-bold transition ${viewMode==="list" ? "bg-white text-black shadow" : "bg-white/10 text-slate-300 hover:bg-white/15"}`}>▦ List</button>
          </div>
          <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-white/10 bg-black/70 px-1.5 py-1 backdrop-blur-xl overflow-x-auto scrollbar-none">
            {([
              { k: "all", label: "All" },
              { k: "mine", label: "Mine" },
              { k: "my_level", label: myLevel ? myLevel : "My Level" },
              { k: "today", label: "Today" },
              { k: "verified", label: "Verified" },
              { k: "advisory", label: "Advisory" },
            ] as const).map(ch=> {
              const active = filter===ch.k;
              const isMine = ch.k==="mine";
              return (
                <button
                  key={ch.k}
                  onClick={()=> setFilter(ch.k as any)}
                  className={`relative shrink-0 rounded-full px-3 py-1.5 font-mono text-[11px] font-bold transition ${active ? "bg-white text-black shadow" : "bg-white/10 text-slate-300 hover:bg-white/15 hover:text-white"}`}
                >
                  {ch.label}
                  {isMine && mineHasNew && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-black animate-pulse" />}
                </button>
              );
            })}
          </div>
        </div>
        <div className="pointer-events-none absolute left-1/2 top-[148px] z-20 hidden w-full max-w-[560px] -translate-x-1/2 justify-center px-6 sm:flex">
          <div className="pointer-events-auto w-full"><SearchBar searchQuery={searchQuery} setSearchQuery={setSearchQuery} searchMatchCount={searchMatchCount} onJump={handleJump} /></div>
        </div>
        {/* mobile collapsible drawer — Filters+Search+View */}
        {filtersOpen && (
          <div className="pointer-events-none absolute left-1/2 top-[162px] z-20 flex w-full max-w-[560px] -translate-x-1/2 flex-col gap-2 px-3 sm:hidden">
            <div className="pointer-events-auto flex items-center justify-center gap-1 rounded-full border border-white/10 bg-black/70 px-1.5 py-1 backdrop-blur-xl">
              <button onClick={()=> setViewMode("map")} className={`rounded-full px-3 py-1.5 font-mono text-[11px] font-bold transition ${viewMode==="map" ? "bg-white text-black shadow" : "bg-white/10 text-slate-300"}`}>⬢ Map</button>
              <button onClick={()=> setViewMode("list")} className={`rounded-full px-3 py-1.5 font-mono text-[11px] font-bold transition ${viewMode==="list" ? "bg-white text-black shadow" : "bg-white/10 text-slate-300"}`}>▦ List</button>
              <span className="ml-1 font-mono text-[10px] text-slate-400">{filteredRoadItems.length} items</span>
            </div>
            <div className="pointer-events-auto flex items-center gap-1.5 overflow-x-auto rounded-full border border-white/10 bg-black/70 px-2 py-1.5 backdrop-blur-xl scrollbar-none">
              {([
                { k: "all", label: "All" },
                { k: "mine", label: "Mine" },
                { k: "my_level", label: myLevel ? myLevel : "My Level" },
                { k: "today", label: "Today" },
                { k: "verified", label: "Verified" },
                { k: "advisory", label: "Advisory" },
              ] as const).map(ch=> {
                const active = filter===ch.k;
                const isMine = ch.k==="mine";
                return (
                  <button
                    key={ch.k}
                    onClick={()=> setFilter(ch.k as any)}
                    className={`relative shrink-0 rounded-full px-3 py-1.5 font-mono text-[11px] font-bold transition ${active ? "bg-white text-black shadow" : "bg-white/10 text-slate-300"}`}
                  >
                    {ch.label}
                    {isMine && mineHasNew && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-black animate-pulse" />}
                  </button>
                );
              })}
            </div>
            <div className="pointer-events-auto w-full"><SearchBar searchQuery={searchQuery} setSearchQuery={setSearchQuery} searchMatchCount={searchMatchCount} onJump={handleJump} /></div>
          </div>
        )}
        {/* Live pulse toasts - top center sliding in/out pure UI ghosts */}
        <div className={`pointer-events-none absolute left-1/2 z-30 -translate-x-1/2 ${filtersOpen ? 'top-[268px] sm:top-[222px]' : 'top-[166px] sm:top-[222px]'}`}>
          {pulseMsg && (
            <div className={`rounded-full border border-emerald-400/20 bg-black/80 px-4 py-2 font-mono text-[11px] font-semibold text-white backdrop-blur-xl shadow-[0_8px_24px_rgba(0,0,0,0.5)] transition-all duration-500 ${pulseShow ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-3"}`} style={{ animation: pulseShow ? "pulseSlideIn 3s ease" : undefined }}>
              <span className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-400" />{pulseMsg}
            </div>
          )}
        </div>
        {/* Invite nudge after verify swipe */}
        {inviteNudge && (
          <div className="pointer-events-auto absolute left-1/2 top-[188px] z-30 w-full max-w-[560px] -translate-x-1/2 px-3 sm:top-[184px] sm:px-6">
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-violet-400/20 bg-[#0b0f1e]/95 px-4 py-3 backdrop-blur-xl shadow-[0_8px_24px_rgba(0,0,0,0.5)]">
              <div>
                <p className="text-[13px] font-bold text-white">Invite course mate → +1 Rep</p>
                <p className="font-mono text-[11px] text-slate-400">Share your link — they verify, you earn.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    const link = typeof window !== "undefined" ? window.location.origin + "/app/roadmap?invite=" + encodeURIComponent(youHandle || "physicoin") : "";
                    try {
                      const anyNav: any = navigator as any;
                      if (anyNav.share) { await anyNav.share({ title: "Physicoin — verify with me", text: "Join me on the endless road — verify lectures together → +1 Rep", url: link }); setInviteCopied(true); setTimeout(()=> setInviteNudge(false), 1800); return; }
                    } catch {}
                    try { await navigator.clipboard.writeText(link); setInviteCopied(true); setToast("link copied — send to course mate"); setTimeout(()=> setInviteNudge(false), 2000); } catch { setToast(link); }
                  }}
                  className="rounded-full bg-white px-4 py-2 text-[13px] font-black text-black hover:bg-slate-100"
                >
                  {inviteCopied ? "Copied ✓" : "Share"}
                </button>
                <button onClick={() => setInviteNudge(false)} className="rounded-full bg-white/10 px-3 py-2 text-xs font-semibold text-white">✕</button>
              </div>
            </div>
          </div>
        )}
        {/* Mobile + Desktop Rep board — extracted to components/road/RepBoard */}
        <div className="pointer-events-auto absolute left-1/2 top-[148px] z-20 flex w-full max-w-[560px] -translate-x-1/2 justify-center px-3 xl:hidden" style={{ marginTop: inviteNudge ? "64px" : "0" }}>
          <RepBoard repBoard={repBoard} youHandle={youHandle} streak={streak} myRep={myRep} levelInfo={levelInfo} onShare={()=> setShareOpen(true)} repSheetOpen={repSheetOpen} setRepSheetOpen={setRepSheetOpen} />
        </div>
        {/* Confetti on quest complete */}
        {showConfetti && (
          <div className="pointer-events-none absolute inset-0 z-40 overflow-hidden" aria-hidden>
            {Array.from({length: 24}).map((_,i)=> {
              const left = (i* 4.2 + Math.random()*2) % 100;
              const delay = (Math.random()*0.6).toFixed(2);
              const dur = (1.8 + Math.random()*1.2).toFixed(2);
              const bg = ["#8b5cf6","#10b981","#f59e0b","#ec4899","#06b6d4","#facc15"][i%6];
              return <div key={i} className="absolute top-0 h-3 w-2 rounded-sm" style={{ left: left+"%", background: bg, animation: `confettiFall ${dur}s ${delay}s ease-in forwards`, transform: `rotate(${Math.random()*360}deg)` }} />;
            })}
            <div className="absolute left-1/2 top-[40%] -translate-x-1/2 rounded-full bg-white px-6 py-3 text-sm font-black text-black shadow-xl">🎉 Quest Complete! +5 Rep</div>
          </div>
        )}

        {toast && <div className="fixed bottom-28 left-1/2 z-50 -translate-x-1/2 rounded-full bg-white px-5 py-2.5 text-[13px] font-medium text-black shadow-xl">{toast}</div>}

        {/* Desktop Rep board — extracted */}
        <div className="hidden xl:block">
          <RepBoard repBoard={repBoard} youHandle={youHandle} streak={streak} myRep={myRep} levelInfo={levelInfo} onShare={()=> setShareOpen(true)} repSheetOpen={repSheetOpen} setRepSheetOpen={setRepSheetOpen} />
        </div>
        {/* SCROLLABLE ROAD CONTAINER — endless winding purple road — subtle 3D emboss */}
        <div className={`road-3d-wrap relative mx-auto flex h-[calc(100vh-64px)] w-full max-w-[560px] justify-center overflow-hidden pt-[112px] sm:pt-[104px] ${viewMode!=="map" ? "hidden" : ""}`} style={{ perspective: "800px", perspectiveOrigin: "50% 28%" }}>
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
              <g key={i} opacity={0.38}>
                <rect x={x - 3.5} y={460} width={7} height={18} rx={3} fill="#5a3e1b" />
                <circle cx={x} cy={436} r={20} fill="#52b788" stroke="rgba(255,255,255,0.16)" strokeWidth={1.4} />
                <circle cx={x} cy={436} r={13} fill="rgba(255,255,255,0.08)" />
                <circle cx={x + 6} cy={428} r={3.4} fill="#fbbf24" stroke="rgba(255,255,255,0.9)" strokeWidth={0.8} />
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
              <pattern id="sprinkleDots" patternUnits="userSpaceOnUse" width={42} height={12} patternTransform="rotate(12)">
                <circle cx={6} cy={6} r={2.8} fill="rgba(255,255,255,0.70)" />
              </pattern>
            </defs>

            {/* purple road — subtle depth */}
            <path d={roadD} fill="none" stroke="#1a1033" strokeWidth={52} strokeLinecap="round" strokeLinejoin="round" opacity={0.92} style={{ filter: "url(#roadShadow)" }} />
            {/* soft offset for emboss */}
            <path d={roadD} fill="none" stroke="#4c1d95" strokeWidth={44} strokeLinecap="round" strokeLinejoin="round" opacity={0.88} style={{ transform: "translate(4px, 4px)" } as any} />
            <path d={roadD} fill="none" stroke="url(#purpleRoad)" strokeWidth={44} strokeLinecap="round" strokeLinejoin="round" style={{ filter: "drop-shadow(0 3px 8px rgba(0,0,0,0.32))" } as any} />
            {/* inner bevel white 0.14 — subtle highlight */}
            <path d={roadD} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth={44} strokeLinecap="round" strokeLinejoin="round" opacity={1} style={{ transform: "translate(-1px, -1.8px)" } as any} />
            {/* candy sprinkle dots along road edge — small white/70 circles every 42px */}
            <path d={roadD} fill="none" stroke="rgba(255,255,255,0.70)" strokeWidth={4.6} strokeLinecap="round" strokeDasharray="0 42" strokeDashoffset={3} opacity={0.92} style={{ transform: "translate(-15px, 0px)" } as any} />
            <path d={roadD} fill="none" stroke="rgba(255,255,255,0.70)" strokeWidth={4.6} strokeLinecap="round" strokeDasharray="0 42" strokeDashoffset={24} opacity={0.92} style={{ transform: "translate(15px, 0px)" } as any} />
            <path d={roadD} fill="none" stroke="white" strokeWidth={3.2} strokeLinecap="round" strokeDasharray="14 14" opacity={0.92} style={{ animation: "roadShimmer 1.2s linear infinite" }} />
            <path d={roadD} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={1} opacity={0.5} />
            {/* Fork branches: purple road splits into two offset paths per conflict node */}
            {displayItems.map((it:any, idx:number)=>{
              if(it.kind!=="fork") return null;
              const p = nodes[idx];
              if(!p) return null;
              const x=p.x, y=p.y;
              const isVis = y >= scrollPos - 400 && y <= scrollPos + viewH + 400;
              if(!isVis) return null;
              const prev = idx>0 ? nodes[idx-1] : null;
              const next = idx < nodes.length-1 ? nodes[idx+1] : null;
              // compute branch curves from y-56 to y and y to y+56
              const topY = prev ? (y + (prev.y))/2 : y - 56;
              const botY = next ? (y + next.y)/2 : y + 56;
              const leftX = x - FORK_OFFSET;
              const rightX = x + FORK_OFFSET;
              // determine winner for coloring merge segment
              const apVals = (it.events as EventRow[]).map(e=> Number(e.authority_points||0));
              const winnerIdx = apVals.findIndex(v=> v >= FORK_THRESHOLD);
              const hasWinner = winnerIdx !== -1;
              const winX = winnerIdx===0 ? leftX : winnerIdx===1 ? rightX : x;
              return (
                <g key={"fork-road-"+it.id} opacity={0.98}>
                  {/* left branch top half */}
                  <path d={`M ${x} ${topY} C ${x-8} ${topY+18}, ${leftX+6} ${y-18}, ${leftX} ${y}`} fill="none" stroke="#4c1d95" strokeWidth={44} strokeLinecap="round" strokeLinejoin="round" opacity={0.88} />
                  <path d={`M ${x} ${topY} C ${x-8} ${topY+18}, ${leftX+6} ${y-18}, ${leftX} ${y}`} fill="none" stroke="url(#purpleRoad)" strokeWidth={44} strokeLinecap="round" strokeLinejoin="round" />
                  {/* right branch top half */}
                  <path d={`M ${x} ${topY} C ${x+8} ${topY+18}, ${rightX-6} ${y-18}, ${rightX} ${y}`} fill="none" stroke="#4c1d95" strokeWidth={44} strokeLinecap="round" strokeLinejoin="round" opacity={0.88} />
                  <path d={`M ${x} ${topY} C ${x+8} ${topY+18}, ${rightX-6} ${y-18}, ${rightX} ${y}`} fill="none" stroke="url(#purpleRoad)" strokeWidth={44} strokeLinecap="round" strokeLinejoin="round" />
                  {/* bottom merge halves */}
                  <path d={`M ${leftX} ${y} C ${leftX+4} ${y+14}, ${x-6} ${botY-14}, ${x} ${botY}`} fill="none" stroke={hasWinner && winnerIdx===0 ? "#10b981" : "#4c1d95"} strokeWidth={hasWinner && winnerIdx===0 ? 44 : 38} strokeLinecap="round" opacity={hasWinner && winnerIdx===0 ? 0.95 : 0.55} style={hasWinner && winnerIdx===0 ? { animation: "forkWinnerPulse 1.4s ease-in-out infinite" } as any : undefined} />
                  <path d={`M ${leftX} ${y} C ${leftX+4} ${y+14}, ${x-6} ${botY-14}, ${x} ${botY}`} fill="none" stroke={hasWinner && winnerIdx===0 ? "#10b981" : "url(#purpleRoad)"} strokeWidth={hasWinner && winnerIdx===0 ? 44 : 44} strokeLinecap="round" opacity={hasWinner ? (winnerIdx===0 ? 0.98 : 0.35) : 0.92} />
                  <path d={`M ${rightX} ${y} C ${rightX-4} ${y+14}, ${x+6} ${botY-14}, ${x} ${botY}`} fill="none" stroke={hasWinner && winnerIdx===1 ? "#10b981" : "#4c1d95"} strokeWidth={hasWinner && winnerIdx===1 ? 44 : 38} strokeLinecap="round" opacity={hasWinner && winnerIdx===1 ? 0.95 : 0.55} style={hasWinner && winnerIdx===1 ? { animation: "forkWinnerPulse 1.4s ease-in-out infinite" } as any : undefined} />
                  <path d={`M ${rightX} ${y} C ${rightX-4} ${y+14}, ${x+6} ${botY-14}, ${x} ${botY}`} fill="none" stroke={hasWinner && winnerIdx===1 ? "#10b981" : "url(#purpleRoad)"} strokeWidth={hasWinner && winnerIdx===1 ? 44 : 44} strokeLinecap="round" opacity={hasWinner ? (winnerIdx===1 ? 0.98 : 0.35) : 0.92} />
                  {/* white center dashes on branches */}
                  <path d={`M ${x} ${topY} C ${x-8} ${topY+18}, ${leftX+6} ${y-18}, ${leftX} ${y}`} fill="none" stroke="white" strokeWidth={3.2} strokeLinecap="round" strokeDasharray="14 14" opacity={hasWinner ? (winnerIdx===0?0.95:0.35):0.88} />
                  <path d={`M ${x} ${topY} C ${x+8} ${topY+18}, ${rightX-6} ${y-18}, ${rightX} ${y}`} fill="none" stroke="white" strokeWidth={3.2} strokeLinecap="round" strokeDasharray="14 14" opacity={hasWinner ? (winnerIdx===1?0.95:0.35):0.88} />
                  <path d={`M ${leftX} ${y} C ${leftX+4} ${y+14}, ${x-6} ${botY-14}, ${x} ${botY}`} fill="none" stroke="white" strokeWidth={3.2} strokeLinecap="round" strokeDasharray="14 14" opacity={hasWinner ? (winnerIdx===0?0.95:0.35):0.88} />
                  <path d={`M ${rightX} ${y} C ${rightX-4} ${y+14}, ${x+6} ${botY-14}, ${x} ${botY}`} fill="none" stroke="white" strokeWidth={3.2} strokeLinecap="round" strokeDasharray="14 14" opacity={hasWinner ? (winnerIdx===1?0.95:0.35):0.88} />
                </g>
              );
            })}

            {/* NOW marker — big pulse */}
            <g style={{ animation: "nowPulse 1.4s ease-in-out infinite" }}>
              <line x1={90} y1={nowY} x2={430} y2={nowY} stroke="rgba(255,255,255,0.92)" strokeWidth={1.2} strokeDasharray="8 6" />
              <rect x={188} y={nowY - 16} width={144} height={32} rx={16} fill="#fff" stroke="#8b5cf6" strokeWidth={2.2} />
              <text x={260} y={nowY + 5.5} textAnchor="middle" fontSize={11} fontWeight={900} fill="#5b21b6" style={{ fontFamily: "ui-monospace, monospace", letterSpacing: "0.08em" }}>◉ NOW · WAT</text>
              <circle cx={260} cy={nowY} r={5} fill="#8b5cf6" stroke="white" strokeWidth={1.5} />
            </g>
            <text x={260} y={nowY + 26} textAnchor="middle" fontSize={7.5} fontWeight={700} fill="rgba(255,255,255,0.92)" style={{ fontFamily: "ui-monospace, monospace", textShadow: "0 1px 6px rgba(0,0,0,0.7)" }}>{wat.timePart} · {wat.datePart}</text>

            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <g key={i} opacity={1}>
                    <circle cx={i % 2 === 0 ? 142 + (i % 4 === 0 ? 18 : 0) : 378 - (i % 4 === 1 ? 12 : 0)} cy={TOP_BUFFER + i * STEP_Y} r={30} fill="#d1d5db" style={{ animation: "skeletonPulse 1.4s ease-in-out infinite", animationDelay: `${i * 0.15}s` }} />
                    <circle cx={i % 2 === 0 ? 142 + (i % 4 === 0 ? 18 : 0) : 378 - (i % 4 === 1 ? 12 : 0)} cy={TOP_BUFFER + i * STEP_Y} r={18} fill="#e5e7eb" style={{ animation: "skeletonPulse 1.4s ease-in-out infinite", animationDelay: `${i * 0.15 + 0.1}s` }} />
                    {/* pill skeletons */}
                    <rect x={i % 2 === 0 ? 142 + 44 : 378 - 160} y={TOP_BUFFER + i * STEP_Y - 38} width={140} height={28} rx={14} fill="#d1d5db" style={{ animation: "skeletonPulse 1.4s ease-in-out infinite", animationDelay: `${i * 0.15}s` }} />
                    <rect x={i % 2 === 0 ? 142 + 44 : 378 - 160} y={TOP_BUFFER + i * STEP_Y + 24} width={120} height={18} rx={9} fill="#e5e7eb" style={{ animation: "skeletonPulse 1.4s ease-in-out infinite", animationDelay: `${i * 0.15}s` }} />
                  </g>
                ))
              : displayItems.map((item: any, i: number) => {
                  // --- FORK node rendering ---
                  if(item.kind === "fork"){
                    const p = nodes[i];
                    const isVisibleFork = (()=>{ const y=p.y; return y >= scrollPos - 400 && y <= scrollPos + viewH + 400; })();
                    if(!isVisibleFork){
                      const base0 = String(item.ids?.[0]||"fork").split("__tile")[0];
                      return <g key={item.id} id={`node-${base0}`} style={{display:"none"}} />;
                    }
                    const events: EventRow[] = item.events as EventRow[];
                    // only handle first 2 branches (spec says 2 offset paths). If more, show first 2 and +N
                    const branches = events.slice(0,2);
                    const extra = events.length>2 ? events.slice(2) : [];
                    const leftX = p.x - FORK_OFFSET;
                    const rightX = p.x + FORK_OFFSET;
                    const winnerIdx = branches.findIndex(e=> Number(e.authority_points||0) >= FORK_THRESHOLD);
                    const hasWinner = winnerIdx!==-1;
                    const isPastFork = item.ms <= now;
                    // fork node container id uses first event id for deep link
                    const forkBaseId = String(branches[0]?.id || item.ids[0]).split("__tile")[0];
                    const forkSelected = selectedId===forkBaseId || (item.ids as string[]).includes(String(selectedId));
                    return (
                      <g key={item.id} id={`node-${forkBaseId}`} style={{ cursor: "pointer" }} onClick={() => { setQTap(true); setSelectedId(forkBaseId); setDeepPulseId(null); setSheetOpen(true); }}>
                        {/* FORK pill */}
                        <g>
                          <rect x={p.x - 22} y={p.y - 52} width={44} height={16} rx={8} fill="#1a1033" stroke="#a78bfa" strokeWidth={1.2} />
                          <text x={p.x} y={p.y - 41} textAnchor="middle" fontSize={8} fontWeight={900} fill="#a78bfa" style={{ fontFamily: "ui-monospace,monospace", letterSpacing:"0.08em" }}>FORK</text>
                        </g>
                        {/* merge animation emerald halo on winner side */}
                        {hasWinner && (
                          <circle cx={winnerIdx===0 ? leftX : rightX} cy={p.y} r={36} fill="none" stroke="#10b981" strokeWidth={2.5} opacity={0.45} style={{ animation: "pulseRing 1.6s ease-out infinite" }} />
                        )}
                        {branches.map((ev, bIdx)=>{
                          const bx = bIdx===0 ? leftX : rightX;
                          const ap = Number(ev.authority_points||0);
                          const isWinner = ap >= FORK_THRESHOLD;
                          const isLoser = hasWinner && !isWinner;
                          const opacity = isLoser ? 0.35 : 1;
                          const title = ev.title.length>14 ? ev.title.slice(0,14)+"…" : ev.title;
                          const pillW = Math.max(120, Math.min(150, title.length*7 + 28));
                          const pillX = bx - pillW/2;
                          const yes = Math.min(ap, FORK_THRESHOLD);
                          const pct = Math.min(100, Math.round((ap/FORK_THRESHOLD)*100));
                          const venue = String(ev.venue||"").slice(0,12);
                          const leftSideBranch = bIdx===0;
                          return (
                            <g key={ev.id} opacity={opacity} style={isWinner ? { animation: "forkWinnerPulse 1.4s ease-in-out infinite" } as any : undefined} onClick={(e)=>{ e.stopPropagation(); setQTap(true); setSelectedId(String(ev.id).split("__tile")[0]); setSheetOpen(true); }}>
                              {/* node circle */}
                              <circle cx={bx} cy={p.y+6} r={28} fill="black" opacity={0.34} />
                              <g style={{ transformOrigin: `${bx}px ${p.y}px`, transform: isWinner ? "translateZ(14px) scale(1.06)" : "translateZ(10px)" } as any}>
                                <circle cx={bx} cy={p.y} r={28} fill={isWinner ? "#ecfdf5" : "white"} stroke={isWinner ? "#10b981" : "#8b5cf6"} strokeWidth={isWinner ? 3.5 : 3} />
                                <circle cx={bx} cy={p.y} r={16} fill={isWinner ? "#d1fae5" : "#f5f3ff"} />
                                <text x={bx} y={p.y+5} textAnchor="middle" fontSize={14} fontWeight={800} fill={isWinner ? "#065f46" : "#6d28d9"} style={{ fontFamily: fredoka.style.fontFamily }}>{isWinner ? "✓" : "◉"}</text>
                              </g>
                              {/* event card pill */}
                              <g opacity={isLoser ? 0.7 : 1}>
                                <rect x={pillX} y={p.y - 36} width={pillW} height={22} rx={11} fill={isWinner ? "#10b981" : selectedId===String(ev.id).split("__tile")[0] ? "white" : "rgba(0,0,0,0.72)"} stroke={isWinner ? "#10b981" : "rgba(255,255,255,0.18)"} />
                                <text x={pillX + pillW/2} y={p.y - 21} textAnchor="middle" fontSize={11} fontWeight={900} fill={isWinner ? "white" : selectedId===String(ev.id).split("__tile")[0] ? "#000" : "white"} style={{ fontFamily: fredoka.style.fontFamily }}>{title}</text>
                              </g>
                              <g opacity={0.96}>
                                <rect x={pillX} y={p.y+22} width={pillW} height={14} rx={7} fill="rgba(0,0,0,0.74)" />
                                <text x={pillX + pillW/2} y={p.y+32} textAnchor="middle" fontSize={7} fontWeight={600} fill="#cbd5e1" style={{ fontFamily: "ui-monospace,monospace" }}>{venue} · {fmtDate(ev.event_date)} {fmtTime(ev.event_time)}</text>
                              </g>
                              {/* quorum bar Yes/threshold */}
                              <g>
                                <rect x={bx - 42} y={p.y + 42} width={84} height={6} rx={3} fill="rgba(0,0,0,0.55)" stroke="rgba(255,255,255,0.12)" />
                                <rect x={bx - 42} y={p.y + 42} width={Math.max(0, Math.min(84, Math.round(84*Math.min(100,pct)/100)))} height={6} rx={3} fill={isWinner ? "#10b981" : "#8b5cf6"} opacity={0.95} />
                                <text x={bx - 42} y={p.y + 38} textAnchor="start" fontSize={6} fontWeight={800} fill={isWinner ? "#6ee7b7" : "rgba(255,255,255,0.92)"} style={{fontFamily:"ui-monospace,monospace"}}>{ap}/{FORK_THRESHOLD} {pct}%{isWinner?" · WIN":""}</text>
                              </g>
                              {isPastFork && <text x={bx} y={p.y+62} textAnchor="middle" fontSize={6} fontWeight={700} fill="rgba(255,255,255,0.45)" style={{fontFamily:"ui-monospace,monospace"}}>FORK · PAST</text>}
                            </g>
                          );
                        })}
                        {extra.length>0 && (
                          <g>
                            <rect x={p.x - 36} y={p.y+48} width={72} height={16} rx={8} fill="rgba(0,0,0,0.6)" />
                            <text x={p.x} y={p.y+59} textAnchor="middle" fontSize={7} fontWeight={800} fill="#a78bfa">+{extra.length} more</text>
                          </g>
                        )}
                      </g>
                    );
                  }
                  const p = nodes[i];
                  // virtualize: cull distant nodes outside viewport + 400px buffer
                  const isVisible = (()=>{ const y=p.y; return y >= scrollPos - 400 && y <= scrollPos + viewH + 400; })();
                  if(!isVisible){
                    const baseIdV = String(item.id).split("__tile")[0];
                    return <g key={item.id} id={`node-${baseIdV}`} style={{display:"none"}} />;
                  }
                  const st = stateFor(item);
                  // tile ids have __tile suffix — compare base id so selection stays coherent across loop
                  const baseId = String(item.id).split("__tile")[0];
                  const isActive = selectedId === item.id || selectedId === baseId;
                  const isNew = newIds.has(item.id) || newIds.has(baseId);
                  const isPersonal = item.kind === "personal";
                  const isDemo = (item as any).kind === "demo";
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
                  } else if ((st as any).key === "demo") {
                    nodeR = 30;
                    outline = "#8b5cf6";
                  }
                  const title = isPersonal ? item.p.title : isDemo ? (item as DemoItem).title : (item as any).ev.title;
                  const venue = isPersonal ? item.p.venue : isDemo ? (item as DemoItem).venue : (item as any).ev.venue;
                  const date = isPersonal ? item.p.event_date : isDemo ? (item as DemoItem).event_date : (item as any).ev.event_date;
                  const time = isPersonal ? item.p.event_time : isDemo ? (item as DemoItem).event_time : (item as any).ev.event_time;
                  const label = title.length > 18 ? title.slice(0, 18) + "…" : title;
                  const pillW = Math.max(136, Math.min(188, label.length * 7.2 + 36));
                  const pillX = leftSide ? p.x + 44 : p.x - pillW - 12;
                  const pctVal = !isPersonal && !isDemo
                    ? (() => {
                        const ap = Number((item as any).ev.authority_points ?? 0);
                        const rp = Number((item as any).ev.required_points ?? 0);
                        return rp > 0 ? Math.min(100, Math.round((ap / rp) * 100)) : isVerified((item as any).ev) ? 100 : 0;
                      })()
                    : null;
                  const showPct = pctVal !== null && pctVal > 0 && !isVerified((item as any).ev);
                  const opacity = isPast ? 0.48 : 1;
                  return (
                    <g
                      id={`node-${baseId}`}
                      key={item.id}
                      onClick={() => {
                        setQTap(true);
                        // demo nodes: toast + open sheet, no DB
                        if(isDemo){
                          const d=(item as DemoItem);
                          if(d.localId==="demo_welcome") setToast("Welcome — tap a purple node to see real gist");
                          else if(d.localId==="demo_swipe") { setToast("Swipe demo — try swiping the card below!"); setQSwipe(true); }
                          else if(d.localId==="demo_create") setShowCreate(true);
                        }
                        // use base id so sheet shows canonical event even when clicking tiled duplicates
                        setSelectedId(baseId);
                        setDeepPulseId(null);
                        setSheetOpen(true);
                      }}
                      style={{
                        cursor: "pointer",
                        opacity: isPersonal && !isActive ? 0.62 : opacity,
                      }}
                    >
                      {isActive && <circle cx={p.x} cy={p.y} r={nodeR + 20} fill="white" opacity={0.09} />}
                      {((deepPulseId && (deepPulseId===baseId || deepPulseId===item.id)) || (searchPulseId && (searchPulseId===baseId || searchPulseId===item.id))) && (
                        <>
                          <circle cx={p.x} cy={p.y} r={nodeR+10} fill="none" stroke="#8b5cf6" strokeWidth={3} opacity={0.9} style={{ animation:"pulseRing 1.1s ease-out infinite" }} />
                          <circle cx={p.x} cy={p.y} r={nodeR+18} fill="none" stroke="#a78bfa" strokeWidth={2} opacity={0.6} style={{ animation:"pulseRing 1.1s ease-out infinite 0.18s" }} />
                        </>
                      )}
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
                        <circle cx={p.x} cy={p.y} r={nodeR} fill={isPersonal ? "#e7e5e4" : "white"} stroke={outline} strokeWidth={isActive ? 3.8 : 3} strokeDasharray={isDemo ? "8 6" : undefined} filter="url(#nodeGlow)" opacity={isPersonal ? 0.72 : isDemo ? 0.96 : 1} style={{ transform: isActive ? "translateZ(18px)" : "translateZ(12px)" } as any} />
                        <circle cx={p.x} cy={p.y} r={nodeR - 10} fill={isDemo ? "#f5f3ff" : st.key === "canonical" ? "#ecfdf5" : st.key === "almost" ? "#f7fee7" : st.key === "advisory" ? "#fffbeb" : st.key === "waiting" ? "#eff6ff" : "#f4f4f5"} stroke={isDemo ? "#8b5cf6" : "rgba(0,0,0,0.06)"} strokeWidth={1} strokeDasharray={isDemo ? "4 3" : undefined} />
                        <text x={p.x} y={p.y + 6} textAnchor="middle" fontSize={isDemo ? 13 : isPersonal ? 10 : st.key === "canonical" ? 17 : 14} fontWeight={800} fill={isDemo ? "#6d28d9" : st.key === "canonical" ? "#065f46" : st.key === "almost" ? "#3f6212" : st.key === "advisory" ? "#92400e" : st.key === "waiting" ? "#1e40af" : "#52525b"} style={{ fontFamily: fredoka.style.fontFamily, letterSpacing: "-0.025em" }}>
                          {isDemo ? ( (item as DemoItem).localId==="demo_welcome" ? "✦" : (item as DemoItem).localId==="demo_swipe" ? "↔" : "+" ) : isPersonal ? "◐" : st.key === "canonical" ? "✓" : st.key === "advisory" ? "●" : st.key === "almost" ? "◉" : st.key === "waiting" ? "○" : "●"}
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
                        <text x={pillX + pillW / 2} y={p.y - 19} textAnchor="middle" fontSize={14} fontWeight={900} fill={isActive ? "#000" : "white"} style={{ fontFamily: fredoka.style.fontFamily, letterSpacing: "-0.025em" }}>{label}</text>
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
                      {/* Quorum bar on each node */}
                      {(!isPersonal && !(item as any).kind?.includes?.("demo") && (item as any).kind!=="demo") && (()=>{ const apQ = !isPersonal && !(item as any).kind?.includes?.("demo") && (item as any).kind!=="demo" ? Number((item as any).ev.authority_points ?? 0) : 0; const yesQ = Math.min(apQ, quorumThreshold); const pctQ = quorumThreshold>0 ? Math.min(100, Math.round((apQ/quorumThreshold)*100)) : 0; const almostQ = pctQ===88 || pctQ===87 || apQ===quorumThreshold-1; // 87.5% rounded
                        const barW=84; const barX = p.x - barW/2; const barY = p.y + 46; const fillW = Math.max(0, Math.min(barW, Math.round(barW * pctQ/100)));
                        return <g>
                          <rect x={barX} y={barY} width={barW} height={6} rx={3} fill="rgba(0,0,0,0.55)" stroke="rgba(255,255,255,0.12)" />
                          <rect x={barX} y={barY} width={fillW} height={6} rx={3} fill={pctQ>=100 ? "#10b981" : "#10b981"} opacity={0.95} />
                          <text x={barX} y={barY-4} textAnchor="start" fontSize={6.5} fontWeight={800} fill={almostQ ? "#facc15" : "rgba(255,255,255,0.92)"} style={{fontFamily:"ui-monospace,monospace"}}>{apQ}/{quorumThreshold} {pctQ}%{almostQ ? " · 1 more!" : ""}</text>
                        </g>;
                      })()}
                    </g>
                  );
                })}
          </svg>
          </div>
        </div>
        {/* viewport-fixed infinite edge fades — ensures no hard start/end even without mask support — purple road never terminates */}
        <div className="pointer-events-none absolute left-1/2 top-[104px] z-[15] h-[96px] w-[96%] max-w-[560px] -translate-x-1/2 rounded-t-[28px]" style={{ background: "linear-gradient(to bottom, rgba(13,59,42,0.98) 0%, rgba(13,59,42,0.84) 34%, rgba(13,59,42,0.42) 68%, transparent 100%)" }} />
        <div className="pointer-events-none absolute bottom-0 left-1/2 z-[15] h-[140px] w-[96%] max-w-[560px] -translate-x-1/2 rounded-b-[28px]" style={{ background: "linear-gradient(to top, rgba(13,59,42,0.98) 0%, rgba(13,59,42,0.72) 36%, transparent 100%)" }} />
        <div className={`relative mx-auto flex h-[calc(100vh-64px)] w-full max-w-[560px] flex-col overflow-auto pt-[132px] sm:pt-[124px] pb-[320px] px-3 sm:px-4 gap-3 ${viewMode!=="list" ? "hidden" : ""}`}>
            <div className="rounded-2xl border border-white/10 bg-black/60 backdrop-blur px-4 py-3 flex items-center justify-between">
              <p className="font-mono text-[11px] font-bold text-white">List — same filteredRoadItems as Map</p>
              <span className="font-mono text-[10px] text-slate-400">{filteredRoadItems.length} items · {filter} · WAT</span>
            </div>
            {filteredRoadItems.length===0 ? <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center text-sm text-slate-400">No items for this filter — try All</div> : filteredRoadItems.map((item)=>{
              const baseId = String(item.id).split("__tile")[0];
              const isPersonal = (item as any).kind==="personal";
              const isDemo = (item as any).kind==="demo";
              const ev = !isPersonal && !isDemo ? (item as any).ev as any : null;
              const verified = ev ? (ev.status==="verified" || (Number(ev.required_points)>0 && Number(ev.authority_points)>=Number(ev.required_points))) : false;
              const title = isPersonal ? (item as any).p.title : isDemo ? (item as any).title : ev.title;
              const venue = isPersonal ? (item as any).p.venue : isDemo ? (item as any).venue : ev.venue;
              const date = isPersonal ? (item as any).p.event_date : isDemo ? (item as any).event_date : ev.event_date;
              const time = isPersonal ? (item as any).p.event_time : isDemo ? (item as any).event_time : ev.event_time;
              const active = selectedId===baseId || selectedId===item.id;
              return (
                <button key={item.id} onClick={()=>{ setSelectedId(baseId); setSheetOpen(true); if(isDemo) setToast((item as any).hint); }}
                  className={`text-left rounded-[18px] border p-4 backdrop-blur transition ${active ? "border-white bg-white text-black shadow" : verified ? "border-emerald-400/25 bg-emerald-500/[0.08] text-white" : "border-white/[0.06] bg-white/[0.03] text-white hover:bg-white/[0.05]"}`}>
                  <div className="flex items-center gap-2">
                    <span className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-black ${verified? "bg-emerald-500 text-white" : isPersonal? "bg-zinc-600 text-white" : isDemo? "bg-[#8b5cf6] text-white border-2 border-dashed border-white/60" : "bg-amber-500 text-white"}`}>{verified?"✓": isPersonal?"◐": isDemo?"✦":"●"}</span>
                    <span className={`text-[13px] font-bold leading-tight ${active?"text-black":"text-white"}`}>{title}</span>
                    <span className={`ml-auto rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${verified?"bg-emerald-500 text-white":"bg-white/10 text-slate-300"}`}>{verified?"green":"advisory"}</span>
                  </div>
                  <p className={`mt-1 font-mono text-[11px] ${active?"text-slate-600":"text-slate-400"}`}>{venue} · {fmtDate(date)} {fmtTime(time)} · {isPersonal?(item as any).p.scope_type: isDemo?"demo": ev.scope_type}{!isPersonal && !isDemo && ev.scope_value ? ` · ${ev.scope_value}`:""}</p>
                  <p className={`mt-1 font-mono text-[10px] ${active?"text-slate-500":"text-slate-500"}`}>{fmtDate(date)} {fmtTime(time)} WAT · tap to open sheet →</p>
                </button>
              );
            })}
          </div>

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

        {/* FAB — first-gist funnel: pulses when mine count 0 */}
        {(() => {
          const mineCount = myUserId ? events.filter(e=> String(e.created_by||"")===String(myUserId)).length : 0;
          const isFirstGist = mineCount === 0;
          return (
            <div className="fixed bottom-[88px] right-4 z-40 flex flex-col items-end gap-2 sm:bottom-[92px] sm:right-6">
              {isFirstGist && (
                <div className="animate-bounce rounded-full bg-white px-3 py-1.5 text-[12px] font-black text-black shadow-lg flex items-center gap-1">
                  <span>←</span> Create first gist → +5 bonus
                </div>
              )}
              <button onClick={()=>setFabOpen(true)} aria-label="Create event" className={`flex h-14 w-14 items-center justify-center rounded-full bg-[#8b5cf6] text-2xl font-black text-white shadow-[0_8px_24px_rgba(139,92,246,0.5),0_4px_12px_rgba(0,0,0,0.3)] hover:bg-[#7c3aed] hover:scale-105 active:scale-95 transition ${isFirstGist ? "animate-[fabPulse_1.6s_ease-in-out_infinite] ring-4 ring-white/30" : ""}`}>
                +
              </button>
            </div>
          );
        })()}
        {/* FAB create modal - POST /api/timetable */}
        {fabOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
            <form onSubmit={handleFabCreate} className="w-full max-w-[420px] rounded-[20px] border border-white/10 bg-[#0b0f1e] p-5 shadow-2xl">
              <div className="flex items-center justify-between">
                <h3 className="text-[16px] font-bold text-white">Create event</h3>
                <button type="button" onClick={()=>setFabOpen(false)} className="rounded-full bg-white/10 px-3 py-1 text-sm text-white">✕</button>
              </div>
              <p className="mt-1 text-[12px] text-slate-400">title / venue / date / time → POST /api/timetable</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {[
                  { label:"Class moved", title:"Class moved \u2014 LT changed", venue:"LT2 \u2192 LT5", time:"08:00" },
                  { label:"Exam shift", title:"Exam shift \u2014 ", venue:"Exam Hall", time:"09:00" },
                  { label:"Venue change", title:"Venue change \u2014 ", venue:"LT1 \u2192 LT3", time:"10:00" },
                  { label:"Cancelled", title:"Cancelled \u2014 ", venue:"Cancelled", time:"08:00" },
                ].map(tt=> (
                  <button key={tt.label} type="button" onClick={()=>{ setFabTitle(tt.title); setFabVenue(tt.venue); setFabTime(tt.time); setFabDate(new Date().toISOString().slice(0,10)); }} className="rounded-full border border-violet-400/20 bg-violet-500/10 px-2.5 py-1 text-[11px] font-bold text-violet-200 hover:bg-violet-500 hover:text-white transition">{tt.label}</button>
                ))}
              </div>
              <div className="mt-4 grid gap-3">
                <input value={fabTitle} onChange={e=>setFabTitle(e.target.value)} placeholder="Title e.g. BIO 101 Lecture" className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none focus:border-violet-500" required />
                <input value={fabVenue} onChange={e=>setFabVenue(e.target.value)} placeholder="Venue e.g. LT1" className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none focus:border-violet-500" required />
                <div className="grid grid-cols-2 gap-3">
                  <input type="date" value={fabDate} onChange={e=>setFabDate(e.target.value)} className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-sm text-white outline-none" required />
                  <input type="time" value={fabTime} onChange={e=>setFabTime(e.target.value)} className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-sm text-white outline-none" required />
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <button type="submit" disabled={fabBusy} className="flex-1 rounded-full bg-[#8b5cf6] py-2.5 text-sm font-black text-white hover:bg-[#7c3aed] disabled:opacity-60">{fabBusy ? "…" : "Create"}</button>
                <button type="button" onClick={()=>setFabOpen(false)} className="rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white">Cancel</button>
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
              ) : selectedDemo ? (
                <div>
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#8b5cf6] text-sm font-black text-white border-2 border-dashed border-white/60">✦</span>
                    <div>
                      <h2 className="text-[17px] font-bold leading-tight text-white">{selectedDemo.title} <span className="ml-2 rounded-full border border-dashed border-violet-400/40 bg-violet-500/10 px-2 py-0.5 text-[10px] font-bold tracking-wide text-violet-200">demo · dashed</span></h2>
                      <p className="font-mono text-[11px] tracking-wide text-slate-500">{selectedDemo.venue} · {fmtDate(selectedDemo.event_date)} {fmtTime(selectedDemo.event_time)} · demo · local-only</p>
                    </div>
                  </div>
                  <div className="mt-4 rounded-2xl border border-dashed border-violet-400/30 bg-violet-500/10 p-4">
                    <p className="text-[13px] font-semibold text-violet-100">{selectedDemo.hint}</p>
                    <p className="mt-1 text-[12.5px] leading-5 text-slate-400">This is a local demo node — it doesn&apos;t hit the DB. It&apos;s only shown when your feed is empty to teach tap / swipe / + create. Once real events exist it disappears.</p>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {selectedDemo.localId==="demo_swipe" ? (
                      <>
                        <button onClick={()=>{ setQSwipe(true); setToast("Swipe the card → Yes · ← No · ↑ Skip"); }} className="rounded-full bg-[#8b5cf6] px-5 py-2.5 text-sm font-bold text-white">Try swipe →</button>
                        <button onClick={()=> setQSwipe(true)} className="rounded-full border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-medium text-slate-200">Mark swipe done</button>
                      </>
                    ) : selectedDemo.localId==="demo_create" ? (
                      <button onClick={()=> setShowCreate(true)} className="rounded-full bg-white px-5 py-2.5 text-sm font-bold text-black">＋ Create gist (demo)</button>
                    ) : (
                      <button onClick={()=> { setQTap(true); setToast("Tapped ✓ — now try Swipe demo"); }} className="rounded-full bg-white px-5 py-2.5 text-sm font-bold text-black">Tap ✓</button>
                    )}
                  </div>
                  <p className="mt-3 font-mono text-[10px] text-slate-500">Dashed = local only · not broadcast · hidden once real events arrive</p>
                </div>
              ) : selectedEvent ? (
                (() => {
                  const ev = selectedEvent;
                  const verified = isVerified(ev);
                  const ap = Number(ev.authority_points ?? 0);
                  const rp = Number(ev.required_points ?? 0);
                  const pct = rp > 0 ? Math.min(100, Math.round((ap / rp) * 100)) : verified ? 100 : 0;
                  const isAlmost = pct >= 85 && !verified;
                  const isAdvisory = ev.status === "pending" && !verified && !isAlmost;
                  const swipeBg = drag.active ? (drag.x > 40 ? "rgba(16,185,129,0.18)" : drag.x < -40 ? "rgba(239,68,68,0.16)" : drag.y < -40 ? "rgba(148,163,184,0.16)" : "transparent") : "transparent";
                  const hint = drag.active ? (drag.x > 80 ? "→ Yes ✓" : drag.x < -80 ? "✕ No ←" : drag.y < -80 ? "↑ Skip" : drag.x > 30 ? "→ swipe right = Yes" : drag.x < -30 ? "swipe left = No ←" : drag.y < -30 ? "↑ swipe up = Skip" : "swipe → Yes · ← No · ↑ Skip") : null;
                  return (
                    <div
                      className="relative select-none rounded-2xl"
                      style={{
                        touchAction: "pan-y",
                        transform: drag.active ? `translate3d(${drag.x * 0.52}px, ${drag.y * 0.42}px, 0) rotate(${drag.x * 0.06}deg)` : "translate3d(0,0,0)",
                        transition: drag.active ? "none" : "transform 260ms cubic-bezier(.2,.8,.3,1), background 200ms",
                        background: swipeBg,
                      }}
                      onTouchStart={(e) => swipeStart(e.touches[0].clientX, e.touches[0].clientY)}
                      onTouchMove={(e) => swipeMove(e.touches[0].clientX, e.touches[0].clientY)}
                      onTouchEnd={swipeEnd}
                      onMouseDown={(e) => swipeStart(e.clientX, e.clientY)}
                      onMouseMove={(e) => { if (draggingRef.current) swipeMove(e.clientX, e.clientY); }}
                      onMouseUp={swipeEnd}
                      onMouseLeave={swipeEnd}
                    >
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
                      <QuorumBar ap={ap} threshold={quorumThreshold} />
                      {!rp && verified && <p className="mt-4 rounded-xl bg-emerald-500/10 px-3 py-2.5 text-[12.5px] text-emerald-200">Verified — coursemates confirmed this happened.</p>}
                      {!rp && !verified && <p className="mt-4 rounded-xl bg-amber-500/10 px-3 py-2.5 text-[12.5px] text-amber-200">Advisory — fresh gist, waiting for confirmations.</p>}
                      {/* Facepile — YES voters candy avatars + counts */}
                      <div className="mt-3 flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
                        <div className="flex -space-x-1.5">
                          {facepileLoading ? (
                            <span className="h-7 w-7 rounded-full bg-white/10 animate-pulse border-2 border-[#080c18]" />
                          ) : facepile && facepile.yes.length > 0 ? (
                            <>
                              {facepile.yes.slice(0,5).map((u) => (
                                <span key={u.id} title={u.handle} className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#080c18] text-[9px] font-black text-white shadow" style={{ background: u.color }}>
                                  {String(u.handle).slice(0,2).toUpperCase()}
                                </span>
                              ))}
                              {facepile.yes.length > 5 && (
                                <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#080c18] bg-white/10 text-[10px] font-bold text-white">
                                  +{facepile.yes.length - 5}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#080c18] bg-white/5 text-[9px] font-bold text-slate-400">∅</span>
                          )}
                        </div>
                        <span className="font-mono text-[11px] font-bold text-slate-300">
                          {facepileLoading ? "loading voters…" : `Yes ${facepile?.yesCount ?? 0} · No ${facepile?.noCount ?? 0}`}
                        </span>
                        {facepile && facepile.yes.length > 0 && (
                          <span className="hidden sm:inline font-mono text-[10px] text-slate-500 truncate">
                            {facepile.yes.slice(0,3).map(u=> `@${u.handle}`).join(" · ")}{facepile.yes.length>3 ? " …" : ""}
                          </span>
                        )}
                        {!facepileLoading && (!facepile || (facepile.yesCount===0 && facepile.noCount===0)) && (
                          <span className="font-mono text-[10px] text-slate-500">no votes yet — be first</span>
                        )}
                      </div>
                      <div className="mt-4">
                        <p className="font-mono text-[11px] uppercase tracking-wide text-slate-500">Were you there? <span className="normal-case tracking-normal text-slate-600">· swipe → Yes · ← No · ↑ Skip</span></p>
                        <div className="mt-2.5 flex flex-wrap items-center gap-2">
                          <button onClick={() => vote(ev.id, "YES")} disabled={!!voteBusy} className="rounded-full border border-emerald-500/30 bg-emerald-500/15 px-5 py-2.5 text-[13.5px] font-semibold text-emerald-300 hover:bg-emerald-500 hover:text-white transition disabled:opacity-50">{voteBusy === ev.id + "YES" ? "…" : "Yes ✓"}</button>
                          <button onClick={() => vote(ev.id, "NO")} disabled={!!voteBusy} className="rounded-full border border-white/10 bg-white/[0.05] px-5 py-2.5 text-[13.5px] font-medium text-slate-200 hover:bg-white hover:text-black transition disabled:opacity-50">{voteBusy === ev.id + "NO" ? "…" : "No ✕"}</button>
                          <button onClick={() => vote(ev.id, "CANCEL")} disabled={!!voteBusy} className="rounded-full border border-white/10 bg-white/[0.02] px-5 py-2.5 text-[13.5px] font-medium text-slate-400 hover:bg-white/[0.08] hover:text-white transition disabled:opacity-50">{voteBusy === ev.id + "CANCEL" ? "…" : "Skip"}</button>
                          <button onClick={() => vote(ev.id, "CANCEL", true)} disabled={!!voteBusy} className="rounded-full border border-amber-400/25 bg-amber-500/12 px-5 py-2.5 text-[13.5px] font-semibold text-amber-300 hover:bg-amber-500 hover:text-white transition disabled:opacity-50">{voteBusy === ev.id + "CANCEL" ? "…" : "Flag ⚑"}</button>
                          <span className="font-mono text-[11px] text-slate-600">uses physi_profile</span>
                        </div>
                        {hint && <p className="mt-2 font-mono text-[12px] font-bold" style={{ color: drag.x > 40 ? "#10b981" : drag.x < -40 ? "#f87171" : drag.y < -40 ? "#94a3b8" : "#a1a1aa" }}>{hint}</p>}
                        <p className="mt-1 font-mono text-[10px] text-slate-500">swipe card → Yes, ← No, ↑ Skip · buttons are fallback</p>
                      </div>
                      {candy && <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 rounded-full bg-gradient-to-r from-amber-400 to-emerald-400 px-4 py-1.5 text-[13px] font-black text-black shadow-xl" style={{ animation: "candyPop 1100ms cubic-bezier(.2,.8,.3,1) forwards" }}>{candy}</div>}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button onClick={async ()=>{
                          const link = `${window.location.origin}/app/roadmap?event=${ev.id}`;
                          try{
                            const navAny = navigator as any;
                            if(navAny.share){ await navAny.share({ title: ev.title, text: `${ev.title} \u2022 ${ev.venue} \u2022 ${ev.event_date} ${ev.event_time}`, url: link }); setShareCopied(true); setTimeout(()=>setShareCopied(false),2000); setToast("shared \u2713"); return; }
                          }catch{}
                          try{ await navigator.clipboard.writeText(link); setShareCopied(true); setToast("link copied \u2014 share this gist"); setTimeout(()=>setShareCopied(false),2000); }catch{ setToast(link); }
                        }} className="rounded-full border border-violet-400/30 bg-violet-500 px-4 py-2 text-[13px] font-bold text-white hover:bg-violet-600 transition">{shareCopied ? "Copied \u2713" : "Share this gist \u2197"}</button>
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
        {/* inline handle picker modal */}
        {pickerOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm" onClick={()=> !pickerBusy && setPickerOpen(false)}>
            <form onSubmit={handlePickerConfirm} onClick={e=>e.stopPropagation()} className="w-full max-w-[380px] rounded-[22px] border border-white/10 bg-[#0b0f1e] p-5 shadow-2xl">
              <h3 className="text-[16px] font-black text-white">Pick a handle</h3>
              <p className="mt-1 text-[12.5px] leading-4 text-slate-400">Choose your candy color + handle. We&apos;ll create your profile via <span className="font-mono text-violet-300">POST /api/profile</span> + localStorage, then retry your action.</p>
              <div className="mt-4">
                <label className="font-mono text-[11px] font-bold tracking-wide text-slate-400">HANDLE</label>
                <input value={pickerHandle} onChange={e=>setPickerHandle(e.target.value)} placeholder="e.g. alex_02" autoFocus maxLength={16} className="mt-1 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-[14px] font-semibold text-white placeholder:text-slate-500 outline-none focus:border-violet-500" />
                <p className="mt-1 font-mono text-[10px] text-slate-500">2-16 chars · letters, numbers, _ · lowercased</p>
              </div>
              <div className="mt-3">
                <label className="font-mono text-[11px] font-bold tracking-wide text-slate-400">CANDY COLOR</label>
                <div className="mt-1.5 flex gap-2">
                  {PICKER_COLORS.map(c=> (
                    <button key={c} type="button" onClick={()=>setPickerColor(c)} className={`h-9 w-9 rounded-full border-2 transition ${pickerColor===c ? "border-white scale-110 shadow-[0_0_0_4px_rgba(255,255,255,0.18)]" : "border-white/20 hover:border-white/40"}`} style={{ background: c }} aria-label={c} />
                  ))}
                </div>
              </div>
              {pickerErr && <p className="mt-3 rounded-xl bg-red-500/10 px-3 py-2 text-[12px] font-medium text-red-300">{pickerErr}</p>}
              <div className="mt-4 flex gap-2">
                <button type="submit" disabled={pickerBusy || !pickerHandle.trim()} className="flex-1 rounded-full bg-white py-2.5 text-[14px] font-black text-black hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed">{pickerBusy ? "creating…" : "Create & continue →"}</button>
                <button type="button" onClick={()=>setPickerOpen(false)} disabled={pickerBusy} className="rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50">Cancel</button>
              </div>
              <p className="mt-2 text-center font-mono text-[10px] text-slate-500">POST /api/profile → localStorage physi_profile</p>
            </form>
          </div>
        )}
        {/* Share Rep card modal — lazy-loaded heavy canvas */}
        {shareOpen && <ShareCard open={shareOpen} onClose={()=> setShareOpen(false)} myRep={myRep} streak={streak} youHandle={youHandle} levelInfo={levelInfo} />}
        <RepExplainer open={repExplainerOpen} onClose={()=> setRepExplainerOpen(false)} rep={myRep} levelInfo={levelInfo} />
      </div>
    </div>
  );
}

export default function RoadmapPage(){
  return (
    <Suspense fallback={<div className="min-h-[60vh] flex items-center justify-center text-slate-400 text-sm">Loading road...</div>}>
      <RoadmapInner />
    </Suspense>
  );
}

