"use client";
import { Fredoka } from "next/font/google";
const fredoka = Fredoka({ subsets: ["latin"], weight: ["400","500","600","700"], display: "swap", variable: "--font-fredoka" });
import { useEffect, useState, useCallback, useMemo, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { logError, getErrorMessage } from "@/lib/adapters/error";
import { checkPresenceAward, requestGeolocation, persistPresence, getPresenceScore } from "@/lib/adapters/presence";
import SearchBar from "@/components/road/SearchBar";
import QuorumBar from "@/components/road/QuorumBar";
import VoiceGossipFab from "@/components/VoiceGossipFab";
import GlassRail from "@/components/road/GlassRail";
import CandyWell from "@/components/road/CandyWell";
import { IsotopePanel, StreakRescueCard, BazaarBlastCard } from "@/components/road/IsotopePanels";
import { vaultPut, vaultFlush, onEntangle } from "@/lib/shardsync";
import { getSquad, isSquadFormed, setSquad as saveSquad, clearSquad, shouldApplySquadBoost, SQUAD_MULTIPLIER, SQUAD_KEY } from "@/lib/squad";
import { getLecturer, isLecturerVerified, isEmeraldPinVerified, hasEmeraldBypass, verifyLecturerEmail, verifyLecturerPin, lecturerBadgeLabel, LECTURER_KEY, OFFICIAL_PIN } from "@/lib/lecturer";
import { generateICS, downloadICS } from "@/lib/calendar";
import { buildFusionGroups, anonHash, GHOST_DOT_BG } from "@/lib/fusion";
const RepExplainer = dynamic(()=> import("@/components/road/RepExplainer"), { ssr: false, loading: ()=> null }) as any;
const RepBoard = dynamic(()=> import("@/components/road/RepBoard"), { ssr: false, loading: ()=> null }) as any;
const ShareCard = dynamic(()=> import("@/components/road/ShareCard"), { ssr: false, loading: ()=> null });

type Severity = "move" | "shift" | "cancelled";
const SEVERITY_COLOR: Record<Severity,string> = { move:"#3b82f6", shift:"#eab308", cancelled:"#ef4444" };
const SEVERITY_BG: Record<Severity,string> = { move:"bg-blue-500", shift:"bg-yellow-400", cancelled:"bg-red-500" };
const SEVERITY_RING: Record<Severity,string> = { move:"ring-blue-400", shift:"ring-yellow-300", cancelled:"ring-red-400" };
function sevOf(ev:any): Severity { const s=String(ev?.severity||"move").toLowerCase(); if(s==="shift") return "shift"; if(s==="cancelled") return "cancelled"; return "move"; }
function sevWidth(sev:Severity){ return sev==="cancelled" ? 52 : sev==="shift" ? 44 : 38; }
function sevNodeR(sev:Severity, base:number){ if(sev==="cancelled") return base+6; if(sev==="shift") return base+2; return base; }

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
  severity?: Severity | string;
  prev_venue?: string | null;
  prev_event_time?: string | null;
  prev_event_date?: string | null;
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
    vibrate(35);
  }catch{ vibrate(35); }
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
  const [candySpringId, setCandySpringId] = useState<string | null>(null);
  const [roadWarp, setRoadWarp] = useState<"left"|"right"|null>(null);
  const [fabFlash, setFabFlash] = useState(false);
  const [tapeIdx, setTapeIdx] = useState(0);
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
  // Pure ghost default: anon hash dots #7F3A no handles, handle opt-in toggle (Rep stays anonymized)
  const [showHandles, setShowHandles] = useState(false);
  useEffect(()=>{ try{ const v=localStorage.getItem("physi_show_handles"); if(v==="1") setShowHandles(true); }catch{} },[]);
  useEffect(()=>{ try{ localStorage.setItem("physi_show_handles", showHandles? "1":"0"); }catch{} },[showHandles]);
  const anonDot = (handleOrId: string)=> anonHash(String(handleOrId||"anon"));
  // FAB direct create + ghost toggle — default ghost true (pure ghost)
  const [fabOpen, setFabOpen] = useState(false);
  const [fabBusy, setFabBusy] = useState(false);
  const [fabTitle, setFabTitle] = useState("");
  const [fabGhost, setFabGhost] = useState(true);
  const [fabGhostId, setFabGhostId] = useState<string>("");
  // cross-school mirror (?school=FUTO)
  const schoolParam = (searchParams.get("school") || "").toUpperCase().trim();
  const [schoolMeta, setSchoolMeta] = useState<{ name:string; short:string; badge:string }|null>(null);
  const [fabVenue, setFabVenue] = useState("");
  const [fabDate, setFabDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [fabTime, setFabTime] = useState("10:00");
  const [fabSeverity, setFabSeverity] = useState<Severity | "">("");
  // timeline diff history
  const [timelineHist, setTimelineHist] = useState<{ history:any[]; diff:any; event:any } | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  // rep board + streak + invite
  const [repBoard, setRepBoard] = useState<typeof GHOST_REP>(GHOST_REP);
  const [repSheetOpen, setRepSheetOpen] = useState(false);
  const [youHandle, setYouHandle] = useState<string | null>(null);
  const [streak, setStreak] = useState<number>(0);
  // Proof-of-Presence state
  const [presence, setPresence] = useState<{ isWitness: boolean; award: number; dist: number | null; label: string } | null>(null);
  const [presenceScore, setPresenceScore] = useState<number>(0);
  const [presenceBusy, setPresenceBusy] = useState(false);
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
  const [filtersOpen, setFiltersOpen] = useState(false); // unified Filters ▾ drawer at 126px — hides Filters+Search
  const [moreOpen, setMoreOpen] = useState(false); // ⋯ More drawer: Squad/Lecturer/Bazaar/Oracle collapsed
  const [searchPulseId, setSearchPulseId] = useState<string | null>(null);
  const [myLevel, setMyLevel] = useState<string|null>(null);
  const [myRep, setMyRep] = useState<number>(0);
  const [parallaxY, setParallaxY] = useState(0);
  // facepile — voters for selectedEvent
  const [facepile, setFacepile] = useState<{ yes: { id:string; handle:string; color:string; bg:string }[]; yesCount:number; noCount:number } | null>(null);
  const [facepileLoading, setFacepileLoading] = useState(false);
  const [facepileTick, setFacepileTick] = useState(0);
  // cross-school mirror helpers
  const genAnonId = useCallback(()=> {
    const h = Math.random().toString(36).slice(2,6).toUpperCase().padEnd(4,"X");
    return `anon_${h}`;
  }, []);
  useEffect(()=> {
    if (fabGhost && !fabGhostId) setFabGhostId(genAnonId());
    if (!fabGhost && fabGhostId) {/* keep for next */ }
  }, [fabGhost, fabGhostId, genAnonId]);
  useEffect(()=> {
    const s = (schoolParam || "").toUpperCase();
    if (!s) { setSchoolMeta(null); return; }
    const map: Record<string,{name:string; short:string; badge:string}> = {
      FUTO: { name: "Federal University of Technology Owerri", short: "FUTO", badge: "🪞 Mirror · FUTO · DATABASE_URLS shard · school.json" },
      UNIPORT: { name: "University of Port Harcourt", short: "UNIPORT", badge: "🪞 Mirror · UNIPORT · Choba" },
      UNILAG: { name: "University of Lagos", short: "UNILAG", badge: "🪞 Mirror · UNILAG" },
    };
    if (map[s]) setSchoolMeta(map[s]);
    else setSchoolMeta({ name: s, short: s, badge: `🪞 Mirror · ${s}` });
    // also try fetch school.json for theme override
    fetch("/school.json", { cache: "no-store" }).then(r=>r.json()).then(j=> {
      if (j?.school && s === "FUTO") {/* FUTO mirror uses same school.json but badge shows mirror */ }
    }).catch(()=>{});
  }, [schoolParam]);
  // broadcast adapter: when quorum 8/8 reached, push to Telegram via BOT_TOKEN + WhatsApp placeholder
  const notifiedRef = useRef<Set<string>>(new Set());
  useEffect(()=> {
    for (const ev of events) {
      const ap = Number(ev.authority_points ?? 0);
      const rp = Number(ev.required_points ?? 0) || 8;
      if (ap >= 8 && rp === 8 && !notifiedRef.current.has(ev.id) && ap >= rp) {
        notifiedRef.current.add(ev.id);
        fetch("/api/notify", { method: "POST", headers: { "content-type":"application/json" }, body: JSON.stringify({ event: ev }) }).catch(()=>{}).then(r=>r?.json?.().catch(()=>null)).then(j=> {
          if (j?.ok) setToast(`📢 broadcast ${ev.title} · 8/8 quorum → Telegram${j?.whatsapp?.placeholder ? " + WhatsApp placeholder" : ""}`);
        });
      }
    }
    // also handle ghost quorum reaching 8/8
    if (events.some(e=> Number(e.authority_points??0)===8)) {
      // already handled above
    }
  }, [events]);
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
  // panic/stake/ghost state
  const [stakeOn, setStakeOn] = useState(false);
  const [ghostModal, setGhostModal] = useState<{ open:boolean; ev: EventRow|null; forkIx?: number; voters?: any[] }|null>(null);
  const [ghostConfetti, setGhostConfetti] = useState(false);
  // Ghost Bazaar shop modal + Rep spend
  const [bazaarOpen, setBazaarOpen] = useState(false);
  // Oracle fork betting 0.5 Rep before quorum, payout 1.5x
  const [oracleBets, setOracleBets] = useState<{ key:string; ix:number; amt:number; ts:number; settled?:boolean }[]>([]);
  // Road chat 24h ephemeral
  const [chatMsgs, setChatMsgs] = useState<{ user:string; text:string; ts:number }[]>([{user:"zara_11", text:"road is live 🌱", ts: Date.now()- 60*60*1000},{user:"zara_11", text:"who's at LT2?", ts: Date.now()- 30*60*1000}]);
  const [chatDraft, setChatDraft] = useState("");
  // --- Squad: 3 friends forms squad, Yes 1.5x on own gists, localStorage phys_squad ---
  const [squad, setSquadState] = useState<{ members:string[]; owner:string|null; formedAt:number }|null>(null);
  const [squadDraft, setSquadDraft] = useState<string[]>(["","",""]);
  const [squadOpen, setSquadOpen] = useState(false);
  // --- Lecturer oracle: email domain + emerald pin 8/8 bypass ---
  const [lecturer, setLecturerState] = useState<{ email:string; verified:boolean; pinVerified:boolean; badge:string|null }|null>(null);
  const [lectEmail, setLectEmail] = useState("");
  const [lectPin, setLectPin] = useState("");
  const [lectOpen, setLectOpen] = useState(false);
  // --- Pre-gossip: predicted ghost nodes 7 days early dotted 0.35 with Pre-verify bet ---
  const [preBets, setPreBets] = useState<{ eventId:string; amt:number; ts:number }[]>([]);
  const [preToast, setPreToast] = useState<string|null>(null);
  // --- Rep lend: localStorage phys_lend ---
  const [lendOpen, setLendOpen] = useState(false);
  const [lendTo, setLendTo] = useState("");
  const [lendAmt, setLendAmt] = useState("5");
  const [lendRate, setLendRate] = useState("10");
  const [lendHist, setLendHist] = useState<{ id:string; to:string; amt:number; rate:number; due:number; created:number; repaid:boolean }[]>([]);

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

  // infinite parallax 3 layers: back mountains 0.3x mid lollipops 0.6x front road 1.0x translateY scroll
  const levelInfo = getLevelInfo(myRep);
  useEffect(()=>{
    const el = scrollRef.current;
    if(!el) return;
    function onScroll(){ setParallaxY(el!.scrollTop); setScrollPos(el!.scrollTop); }
    onScroll();
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
      const ps = localStorage.getItem("physi_presence_score");
      if (ps) setPresenceScore(Number(ps) || 0);
      try { checkStreakDailyPersist(); } catch {}
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

  // --- Squad + Lecturer hydrate from localStorage + handle invite param ---
  useEffect(()=>{
    try{
      const s = getSquad();
      if(s){ setSquadState(s); setSquadDraft([s.members[0]||"", s.members[1]||"", s.members[2]||""]); }
      const l = getLecturer();
      if(l){ setLecturerState(l as any); setLectEmail(l.email||""); }
      const sp = new URLSearchParams(window.location.search);
      const inv = sp.get("invite");
      if(inv && !s){
        // if invite param present and squad not formed, prefill first slot
        setSquadDraft(prev=>{ const a=[...prev]; if(!a[0]) a[0]=inv.toLowerCase(); return a; });
        // also set toast hint
        setTimeout(()=> setToast(`Invite from @${inv} — add 2 more to form squad 1.5x`), 900);
      }
    }catch{}
  }, []);

  function daysBetween(a: string, b: string): number {
    try { const da = new Date(a).getTime(); const db = new Date(b).getTime(); return Math.round(Math.abs(db - da) / 86400000); } catch { return 99; }
  }
  function applyRepDelta(delta: number) {
    setMyRep(prev => {
      const next = Math.max(0, Number((prev + delta).toFixed(1)));
      try {
        const raw = localStorage.getItem("physi_profile");
        if (raw) { const p = JSON.parse(raw); p.mining_balance = next; localStorage.setItem("physi_profile", JSON.stringify(p)); }
        const histRaw = localStorage.getItem("physi_rep_history");
        let arr: number[] = [];
        try { if (histRaw) { const p = JSON.parse(histRaw); if (Array.isArray(p)) arr = p.map((n:any)=>Number(n)).filter((n:number)=>isFinite(n)); } } catch {}
        arr.push(next); if (arr.length>30) arr=arr.slice(-30); localStorage.setItem("physi_rep_history", JSON.stringify(arr));
      } catch {}
      return next;
    });
  }
  function bumpStreakDaily() {
    try {
      const today = new Date().toISOString().slice(0,10);
      const last = localStorage.getItem("physi_streak_last");
      if (last === today) return;
      let cur = Number(localStorage.getItem("physi_streak") || String(streak) || "0") || 0;
      if (last) {
        const gap = daysBetween(last, today);
        if (gap > 1) {
          const missed = gap - 1;
          const slash = -2 * missed;
          applyRepDelta(slash);
          cur = 0;
          setToast(`Missed ${missed} day${missed>1?"s":""} — slash ${slash} Rep`);
        }
      }
      const next = cur + 1;
      localStorage.setItem("physi_streak", String(next));
      localStorage.setItem("physi_streak_last", today);
      localStorage.setItem("physi_streak_check", today);
      setStreak(next);
      if (next % 7 === 0) {
        applyRepDelta(5);
        setCandy("+5 streak bonus!");
        setTimeout(()=> setCandy(null), 1600);
        setToast("7-day streak — +5 bonus!");
        try { const h=JSON.parse(localStorage.getItem("physi_streak_hist")||"[]"); h.push({at:Date.now(), streak:next, bonus:5}); localStorage.setItem("physi_streak_hist", JSON.stringify(h.slice(-50))); } catch {}
      }
    } catch {
      setStreak((s)=> s+1);
    }
  }
  function checkStreakDailyPersist() {
    try {
      const today = new Date().toISOString().slice(0,10);
      const last = localStorage.getItem("physi_streak_last");
      if (!last) { localStorage.setItem("physi_streak_check", today); return; }
      if (last === today) return;
      const gap = daysBetween(last, today);
      if (gap > 1) {
        const missed = gap - 1;
        applyRepDelta(-2 * missed);
        localStorage.setItem("physi_streak", "0");
        setStreak(0);
        setToast(`Missed ${missed} day${missed>1?"s":""} — slash ${-2*missed} Rep`);
      }
    } catch {}
  }
  // streak daily persist — check every 60s for missed day slash
  useEffect(() => {
    checkStreakDailyPersist();
    const iv = setInterval(checkStreakDailyPersist, 60000);
    return () => clearInterval(iv);
  }, []);

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

  // Timeline diff: fetch history venue/time diff vs previous version (LT2->LT5) stored in event history
  useEffect(()=>{
    if(!selectedEvent){ setTimelineHist(null); return; }
    const baseId = String(selectedEvent.id).split("__tile")[0];
    // quick diff from inline prev fields
    const inlineDiff = (selectedEvent as any).prev_venue ? { venue: `${String((selectedEvent as any).prev_venue)}→${String(selectedEvent.venue)}`, time: `${String((selectedEvent as any).prev_event_time||"").slice(0,5)}→${String(selectedEvent.event_time).slice(0,5)}` } : null;
    // fetch server history for full timeline
    setTimelineLoading(true); setTapeIdx(0);
    (async()=>{
      try{
        const r = await fetch(`/api/timetable?history=${encodeURIComponent(baseId)}`, { cache:"no-store" });
        const j = await r.json().catch(()=> ({} as any));
        if(j?.ok) setTimelineHist({ history: j.history ?? [], diff: j.diff ?? inlineDiff, event: j.event ?? selectedEvent });
        else setTimelineHist(inlineDiff ? { history:[], diff:inlineDiff, event:selectedEvent } : null);
      }catch{ setTimelineHist(inlineDiff ? { history:[], diff:inlineDiff, event:selectedEvent } : null); }
      finally{ setTimelineLoading(false); }
    })();
  }, [selectedEvent?.id, selectedEvent?.prev_venue, selectedEvent?.prev_event_time, selectedEvent?.venue, selectedEvent?.event_time]);

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

  // Virtualize: viewport height (scrollTop tracked by parallax handler above)
  useEffect(()=>{
    function onResize(){
      setViewH(typeof window!=="undefined" ? window.innerHeight : 800);
    }
    onResize();
    window.addEventListener("resize", onResize);
    return ()=>{ window.removeEventListener("resize", onResize); };
  }, [scrollRef]);

  // combined road items chronologically sorted
  type DemoItem = { kind: "demo"; localId: string; id: string; ms: number; title: string; venue: string; event_date: string; event_time: string; hint: string };
  type ForkItem = { kind: "fork"; id: string; ms: number; events: EventRow[]; ids: string[] };
  type PredictedItem = { kind: "predicted"; id: string; ms: number; ev: EventRow; predDate: string; predTime: string };
  type FusedItemT = { kind: "fused"; id: string; ms: number; events: EventRow[]; ids: string[]; venue: string; title: string; event_date: string; event_time: string; authority_points: number; required_points: number };
  type RoadItem = { kind: "personal"; p: PersonalBubble; id: string; ms: number } | { kind: "event"; ev: EventRow; id: string; ms: number } | DemoItem | ForkItem | PredictedItem | FusedItemT;
  const roadItems: RoadItem[] = useMemo(() => {
    const pers: RoadItem[] = personal.map((p) => ({ kind: "personal", p, id: p.localId, ms: eventInstant(p.event_date, p.event_time) } as RoadItem));
    const evs: RoadItem[] = events.map((ev) => ({ kind: "event", ev, id: ev.id, ms: eventInstant(ev.event_date, ev.event_time) } as RoadItem));
    // Pre-gossip predicted ghosts 7 days early — dotted 0.35
    const preds: RoadItem[] = events.slice(0,8).map((ev)=> {
      const realMs = eventInstant(ev.event_date, ev.event_time);
      const predMs = realMs - 7*86400000;
      const d = new Date(predMs);
      // compute WAT date for display (use same trick as eventInstant but reverse)
      // derive predDate/predTime by subtracting 7 days in WAT
      const predDate = new Date(predMs - 60*60*1000).toISOString().slice(0,10); // approximate; we render from ms directly
      // more accurate: use Date with +01 then format
      const tmp = new Date(predMs);
      // WAT iso: shift +1h
      const wat = new Date(tmp.getTime() + 60*60*1000);
      const isoDate = wat.toISOString().slice(0,10);
      const isoTime = String(wat.getUTCHours()).padStart(2,"0")+":"+String(wat.getUTCMinutes()).padStart(2,"0");
      const predDate2 = isoDate;
      const predTime2 = isoTime;
      return { kind:"predicted", id: String(ev.id)+"__pred", ms: predMs, ev, predDate: predDate2, predTime: predTime2 } as PredictedItem;
    });
    let all: RoadItem[] = [...pers, ...evs, ...preds];
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
        if((it as any).kind==="predicted") return filter!=="verified" && filter!=="today" && filter!=="mine";
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
      if ((it as any).kind==="predicted") {
        const pr = it as PredictedItem;
        return `${pr.ev.title} ${pr.ev.venue} ${pr.predDate}`.toLowerCase().includes(searchQ);
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

  // --- Fusion: auto-merge duplicate gists venue+time ±5m same course => fused node x2 strength double quorum
  type FusedItem = { kind: "fused"; id: string; ms: number; events: EventRow[]; ids: string[]; venue: string; title: string; event_date: string; event_time: string; authority_points: number; required_points: number };
  const fusionGroups = useMemo(()=> buildFusionGroups(events as any) as any as { ids:string[]; events: EventRow[]; fusedId:string; title:string; venue:string; event_date:string; event_time:string; authority_points:number; required_points:number; ms:number }[], [events]);
  const fusionMap = useMemo(()=>{
    const m=new Map<string,number>();
    fusionGroups.forEach((g,gi)=> g.ids.forEach(id=> m.set(String(id), gi)));
    return m;
  }, [fusionGroups]);
  const fusionGroupedRoadItems: RoadItem[] = useMemo(()=>{
    if(fusionGroups.length===0) return filteredRoadItems as unknown as RoadItem[];
    const filteredIds = new Set(filteredRoadItems.filter(it=> (it as any).kind==="event").map(it=> String((it as any).ev.id)));
    const relevant = fusionGroups.map(g=> ({ g, members: g.events.filter(ev=> filteredIds.has(String(ev.id))) })).filter(x=> x.members.length>=2);
    if(relevant.length===0) return filteredRoadItems as unknown as RoadItem[];
    const groupById = new Map<string, number>();
    relevant.forEach(({g},gi)=> g.ids.forEach(id=> { if(filteredIds.has(String(id))) groupById.set(String(id), gi); }));
    const seen=new Set<number>();
    const out: RoadItem[]=[];
    for(const it of filteredRoadItems as any){
      if(it.kind !== "event"){ out.push(it); continue; }
      const evId=String(it.ev.id);
      const gi=groupById.get(evId);
      if(gi===undefined){ out.push(it); continue; }
      if(seen.has(gi)) continue;
      seen.add(gi);
      const grp=relevant[gi].g;
      const ms=grp.ms;
      const fid=grp.fusedId;
      const fused: FusedItem = { kind:"fused", id: fid, ms, events: grp.events as EventRow[], ids: grp.ids, venue: grp.venue, title: grp.title, event_date: grp.event_date, event_time: grp.event_time, authority_points: grp.authority_points, required_points: grp.required_points };
      out.push(fused as unknown as RoadItem);
    }
    out.sort((a:any,b:any)=> a.ms - b.ms);
    return out as RoadItem[];
  }, [filteredRoadItems, fusionGroups]);

  // Fork-grouped view of filteredRoadItems: collapse conflict events into single fork node
  const forkGroupedRoadItems: RoadItem[] = useMemo(()=>{
    const base = (fusionGroupedRoadItems as RoadItem[]);
    // if no fork, return fused base
    if (conflictGroups.length===0) return base;
    // Build groups relevant to filtered view: only groups where at least 2 members pass current filter
    // Determine which filtered event ids are present (including fused ids)
    const baseEventIds = new Set(base.filter(it=> (it as any).kind==="event" || (it as any).kind==="fused").flatMap(it=> (it as any).kind==="fused" ? (it as any).ids : [String((it as any).ev.id)]));
    // For each conflict group, collect members that are in filtered view (note: fusion ids already collapsed)
    const relevant = conflictGroups.map(g=> g.filter(ev=> baseEventIds.has(String(ev.id)))).filter(g=> g.length>=2);
    if (relevant.length===0) return base;
    const groupById = new Map<string, number>();
    relevant.forEach((g, gi)=> g.forEach(ev=> groupById.set(String(ev.id), gi)));
    const seen = new Set<number>();
    const out: RoadItem[] = [];
    for(const it of base as any){
      const idsForCheck: string[] = it.kind==="fused" ? it.ids : it.kind==="event" ? [String(it.ev.id)] : [];
      if(idsForCheck.length===0){ out.push(it as any); continue; }
      // if fused node contains a fork member, treat fused node as fork participant (skip separate fork)
      // For now, if any id in fused node is in a fork group, keep fused node as-is (fusion takes precedence)
      const hasFork = idsForCheck.some(id=> groupById.has(String(id)));
      if(!hasFork){ out.push(it as any); continue; }
      // single event fork case
      if(it.kind==="event"){
        const evId = String(it.ev.id);
        const gi = groupById.get(evId);
        if(gi===undefined){ out.push(it as any); continue; }
        if(seen.has(gi)) continue;
        seen.add(gi);
        const grp = relevant[gi];
        const ms = Math.min(...grp.map(e=> eventInstant(e.event_date, e.event_time)));
        const fid = grp.map(e=> String(e.id)).join("__fork__") + "__fork";
        out.push({ kind: "fork", id: fid, ms, events: grp, ids: grp.map(e=> String(e.id)) } as ForkItem);
      } else {
        // fused node that overlaps fork — keep fused (fusion wins), but mark as fused (no fork duplication)
        out.push(it as any);
      }
    }
    // Ensure chronological order after collapse
    out.sort((a,b)=> a.ms - b.ms);
    return out;
  }, [fusionGroupedRoadItems, conflictGroups]);
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
      if (it.kind === "fork" || it.kind === "fused") return { x: 260, y };
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
    if ((item as any).kind === "fused") {
      const f = item as FusedItemT;
      const ap = Number(f.authority_points ?? 0);
      const rp = Number(f.required_points ?? 0);
      const pct = rp>0 ? Math.min(100, Math.round((ap/rp)*100)) : 0;
      if (ap >= rp) return { key: "canonical", label: `FUSED ✓ x2 ${f.events.length}`, color: "#10b981", outline: "#10b981", pct } as const;
      return { key: "fused", label: `FUSED x2 · ${f.events.length}→1 · double quorum ${ap}/${rp}`, color: "#8b5cf6", outline: "#a78bfa", pct, glow: true } as const;
    }
    if ((item as any).kind === "fork") {
      // fork state derived from first event winner etc.
      const ev0 = (item as ForkItem).events[0];
      const ap = Number(ev0.authority_points ?? 0);
      const rp = Number(ev0.required_points ?? 0);
      const pct = rp > 0 ? Math.min(100, Math.round((ap / rp) * 100)) : isVerified(ev0) ? 100 : 0;
      if (isVerified(ev0)) return { key: "canonical", label: "FORK ✓", color: "#10b981", outline: "#8b5cf6", pct } as const;
      return { key: "advisory", label: "FORK ●", color: "#8b5cf6", outline: "#8b5cf6", pct } as const;
    }
    if ((item as any).kind === "predicted") {
      return { key: "predicted", label: "predicted ghost · 7d early", color: "#a78bfa", outline: "#8b5cf6", pct: 35, predicted:true, opacity:0.35, dashed:true } as const;
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
    // Proof-of-Presence: request geolocation, check 150m + 30min -> +1.0 Witness gold vs +0.3 Remote grey
    let presAward = 0.3;
    try {
      setPresenceBusy(true);
      const evRow = events.find(e=> String(e.id)===String(id) || String(e.id).split("__tile")[0]===String(id).split("__tile")[0]);
      if (evRow) {
        const coords = await requestGeolocation(4500);
        const r = checkPresenceAward({ venue: evRow.venue, event_date: evRow.event_date, event_time: evRow.event_time, userCoords: coords });
        presAward = r.award;
        setPresence({ isWitness: r.isWitness, award: r.award, dist: r.distanceM, label: r.label });
        setPresenceScore(getPresenceScore() + r.award);
        persistPresence({ eventId: String(id).split("__tile")[0], isWitness: r.isWitness, award: r.award });
        setTimeout(()=> setPresence(null), 3200);
      }
    } catch {} finally { setPresenceBusy(false); }
    let verifierId: string | null = null;
    try {
      const raw = localStorage.getItem("physi_profile");
      if (raw) verifierId = JSON.parse(raw)?.id ?? null;
    } catch {}
    if (!verifierId) {
      openPickerForVote(id, v, isFlag);
      return;
    }
    // --- Squad 1.5x detection: YES on own gist when squad formed ---
    let squadBoost = false;
    let squadInfo: { members:string[]; owner:string|null }|null = null;
    try{
      const s = getSquad();
      squadInfo = s ? { members: s.members, owner: s.owner } : null;
      const evRowS = events.find(e=> String(e.id)===String(id) || String(e.id).split("__tile")[0]===String(id).split("__tile")[0]);
      const createdBy = evRowS?.created_by ? String(evRowS.created_by) : null;
      // try to resolve handle for created_by via local profile or squad - best effort
      const should = shouldApplySquadBoost({ vote: v, squad: s, myHandle: youHandle, myId: verifierId, createdBy, createdByHandle: null });
      if(should){
        squadBoost = true;
        // optimistic UI hint
        setCandy("1.5x squad Yes!");
        setTimeout(()=> setCandy(null), 1100);
      }
    }catch{}
    // --- Lecturer emerald bypass detection ---
    let lecturerEmerald = false;
    try{
      const l = getLecturer();
      if(l && hasEmeraldBypass(l as any) && v==="YES"){
        lecturerEmerald = true;
      }
    }catch{}
    // stake: if fork vote with stakeOn, deduct 0.5 upfront + check balance
    let forkStake = false;
    if(stakeOn){
      const isForkId = events.some(e=> String(e.id).split("__tile")[0]===String(id).split("__tile")[0] && conflictMap.has(String(e.id)));
      const isForkGroup = forkGroupedRoadItems.some((it:any)=> it.kind==="fork" && (it.ids as string[]).includes(String(id).split("__tile")[0]));
      if(isForkId || isForkGroup){
        if(myRep < 0.5){ setToast("Need 0.5 Rep to stake"); return; }
        forkStake = true;
        setMyRep(prev=> {
          const next = Math.max(0, prev - 0.5);
          try{ const raw=localStorage.getItem("physi_profile"); if(raw){ const p=JSON.parse(raw); p.mining_balance=next; localStorage.setItem("physi_profile", JSON.stringify(p)); } }catch{}
          return next;
        });
        setCandy("-0.5 staked");
        setTimeout(()=> setCandy(null), 900);
      }
    }
    // optimistic: instantly show +0.3 Rep and update local state before POST confirms
    const prevEvents = events;
    const prevRep = myRep;
    vibrate(v === "CANCEL" ? 20 : 35);
    playPop();
    if(v==="YES"){ setCandySpringId(String(id).split("__tile")[0]); setTimeout(()=>setCandySpringId(null),320); }
    if(v==="YES" && Math.abs(drag.x)>10){ setRoadWarp(drag.x>0?"right":"left"); setTimeout(()=>setRoadWarp(null),320); }
    const _award = presAward + (squadBoost ? 0.2 : 0) + (lecturerEmerald ? 0.5 : 0);
    setCandy(lecturerEmerald ? "emerald 8/8 ✓" : squadBoost ? "1.5x squad Yes!" : _award>=1 ? "+1.0 gold Witness" : "+0.3 grey Remote");
    setMyRep((prev)=> prev + _award);
    try{ const raw=localStorage.getItem("physi_profile"); if(raw){ const p=JSON.parse(raw); const nb=Number(p.mining_balance||0)+_award; p.mining_balance=nb; localStorage.setItem("physi_profile", JSON.stringify(p)); } }catch{}
    setTimeout(() => setCandy(null), 1100);
    // optimistic event authority bump — squad 1.5x counts as +1.5 authority
    setEvents((prev)=> prev.map(e=> e.id===id ? { ...e, authority_points: Number(e.authority_points||0)+ (v==="YES"?(lecturerEmerald?8: squadBoost?1.5:1):0), status: lecturerEmerald ? "verified" : e.status } as any : e));
    setVoteBusy(id + v);
    try {
      const r = await fetch("/api/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ verifier_id: verifierId, event_id: id, vote: v, squad: squadBoost, lecturer: !!getLecturer()?.verified, emerald: lecturerEmerald, is_witness: presAward >= 1, award: presAward }),
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
      // stake resolve: if forkStake, winning = voted YES on winning branch? Simplify: if YES then win, NO then lose (deterministic for demo)
      if(forkStake){
        // need repo knows fork outcome: we treat YES as win if that event is winner threshold else lose; optimistic decide win = v==="YES"
        setTimeout(()=> applyStake(v==="YES"), 900);
      }
      fetchFeed();
      fetchRepBoard();
      setFacepileTick(t=>t+1);
    } catch (e: unknown) {
      // revert optimistic on failure + refund stake if any
      setEvents(prevEvents);
      let revertRep = prevRep;
      if(forkStake){
        // refund 0.5 stake on failure: we had deducted 0.5 then +0.3, prevRep includes -0.5, so refund +0.5
        revertRep = prevRep + 0.5;
        setMyRep(revertRep);
        try{ const raw=localStorage.getItem("physi_profile"); if(raw){ const p=JSON.parse(raw); p.mining_balance=revertRep; localStorage.setItem("physi_profile", JSON.stringify(p)); } }catch{}
      } else {
        setMyRep(prevRep);
        try{ const raw=localStorage.getItem("physi_profile"); if(raw){ const p=JSON.parse(raw); const nb=Math.max(0, Number(p.mining_balance||0)-presAward); p.mining_balance=nb; localStorage.setItem("physi_profile", JSON.stringify(p)); } }catch{}
      }
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
    if (Math.abs(x) > 80) { setRoadWarp(x>0? "right":"left"); setTimeout(()=>setRoadWarp(null),320); }
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
    if (!fabSeverity) { setToast("pick severity: move (blue) · shift (yellow) · cancelled (red)"); return; }
    if (!ensureProfile()) { openPickerForFab(); return; }
    setFabBusy(true);
    try {
      let createdBy: string | null = null;
      try { const raw = localStorage.getItem("physi_profile"); if (raw) createdBy = JSON.parse(raw)?.id ?? null; } catch {}
      const ghostId = fabGhost ? (fabGhostId || genAnonId()) : null;
      const body: any = { title: fabTitle.trim(), venue: fabVenue.trim(), event_date: fabDate, event_time: fabTime, scope_type: "whole_school", scope_value: null, status: "pending", authority_points: 0, required_points: 5, severity: fabSeverity };
      if (createdBy) body.created_by = createdBy;
      // ghost: still maps Rep to real user ID, but frontend shows ghost avatar
      if (ghostId) { body.is_ghost = true; body.ghost_handle = ghostId; }
      const r = await fetch("/api/timetable", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok || j.ok === false) throw new Error(j.error || j.message || "create failed — severity required");
      if (ghostId && j?.event?.id) {
        try { const m = JSON.parse(localStorage.getItem("physi_ghost_map") || "{}"); m[String(j.event.id)] = ghostId; localStorage.setItem("physi_ghost_map", JSON.stringify(m)); if (createdBy) { const mm = JSON.parse(localStorage.getItem("physi_ghost_owner") || "{}"); mm[ghostId] = createdBy; localStorage.setItem("physi_ghost_owner", JSON.stringify(mm)); } } catch {}
      }
      const wasFirst = (()=>{ try{ if(localStorage.getItem("physi_first_gist_done")==="1") return false; const c = myUserId ? events.filter(e=> String(e.created_by||"")===String(myUserId)).length : 0; return c===0; } catch{ return false; } })();
      if (wasFirst) {
        try{ localStorage.setItem("physi_first_gist_done","1"); localStorage.setItem("physi_first_gist_at", String(Date.now())); }catch{}
        setMyRep(prev=> prev+5);
        try{ const raw=localStorage.getItem("physi_profile"); if(raw){ const p=JSON.parse(raw); const nb=Number(p.mining_balance||0)+5; p.mining_balance=nb; localStorage.setItem("physi_profile", JSON.stringify(p)); } }catch{}
        setCandy("+5 bonus!");
        setTimeout(()=> setCandy(null), 1600);
        setToast(`first gist! +5 bonus 🎉`);
      } else {
        setToast(`created “${fabTitle.trim()}” ✓ · ${fabSeverity}`);
      }
      setFabOpen(false); setFabFlash(true); setTimeout(()=>setFabFlash(false),600); setFabTitle(""); setFabVenue(""); setFabTime("10:00"); setFabSeverity(""); setFabDate(new Date().toISOString().slice(0,10));
      fetchFeed();
    } catch (err:any) { logError("TIMETABLE_CREATE_FAILED", err, { page: "roadmap" }); setToast(err?.message || getErrorMessage("TIMETABLE_CREATE_FAILED")); }
    finally { setFabBusy(false); }
  }

  const pastCount = nowIdx;
  const upcomingCount = (filteredRoadItems.length ? filteredRoadItems.length : roadItems.length) - nowIdx;
  // panic: event within 2h of now (eventInstant vs Date.now)
  const panicInfo = useMemo(()=>{
    const twoH = 2*60*60*1000;
    let best: { item: RoadItem; ms:number; delta:number; id:string }|null = null;
    const src = filteredRoadItems.length ? filteredRoadItems : roadItems;
    for(const it of src){
      if((it as any).kind==="personal" || (it as any).kind==="demo") continue;
      if((it as any).kind==="fork"){
        const ev0 = (it as any).events?.[0] as EventRow | undefined;
        if(!ev0) continue;
        const ms = eventInstant(ev0.event_date, ev0.event_time);
        const d = ms - now;
        if(d>0 && d<=twoH && (!best || d<best.delta)) best={ item: it, ms, delta:d, id: String(ev0.id).split("__tile")[0] };
        continue;
      }
      const ev = (it as any).ev as EventRow | undefined;
      if(!ev) continue;
      const ms = eventInstant(ev.event_date, ev.event_time);
      const d = ms - now;
      if(d>0 && d<=twoH && (!best || d<best.delta)) best={ item: it, ms, delta:d, id: String(ev.id).split("__tile")[0] };
    }
    return best;
  }, [filteredRoadItems, roadItems, now]);
  const panicId = panicInfo?.id ?? null;
  const panicDeltaFmt = useMemo(()=>{
    if(!panicInfo) return null;
    const m = Math.max(0, Math.floor(panicInfo.delta/60000));
    const h = Math.floor(m/60);
    const min = m%60;
    return h>0 ? `${h}h ${String(min).padStart(2,"0")}m` : `${min}m`;
  }, [panicInfo]);

  // stake persistence + apply win/lose
  useEffect(()=>{
    try{ const v=localStorage.getItem("physi_stake_on"); if(v==="1") setStakeOn(true); }catch{}
  },[]);
  useEffect(()=>{
    try{ localStorage.setItem("physi_stake_on", stakeOn ? "1":"0"); }catch{}
  },[stakeOn]);
  function applyStake(isWin:boolean){
    try{
      const curRep = Number(localStorage.getItem("physi_rep_stake") || String(myRep) || "0");
      // spec: stake 0.5 Rep toggle, win +0.7 lose -0.2 ; we already deducted 0.5 on stake vote, now resolve
      const delta = isWin ? 0.7 : -0.2;
      const next = Math.max(0, myRep + delta);
      setMyRep(next);
      // persist via physi_profile mining_balance
      try{
        const raw=localStorage.getItem("physi_profile");
        if(raw){ const p=JSON.parse(raw); p.mining_balance=next; localStorage.setItem("physi_profile", JSON.stringify(p)); }
      }catch{}
      // log
      const histRaw = localStorage.getItem("physi_stake_hist");
      let hist:any[]=[]; try{ if(histRaw) hist=JSON.parse(histRaw); }catch{}
      hist.push({ at: Date.now(), win:isWin, delta, rep: next });
      if(hist.length>50) hist=hist.slice(-50);
      localStorage.setItem("physi_stake_hist", JSON.stringify(hist));
      localStorage.setItem("physi_rep_stake", String(next));
      setCandy(isWin ? "+0.7 Rep" : "-0.2 Rep");
      setTimeout(()=> setCandy(null), 1400);
      if(isWin){ setGhostConfetti(true); setTimeout(()=> setGhostConfetti(false), 2800); setShowConfetti(true); setTimeout(()=> setShowConfetti(false), 2800); }
      setToast(isWin ? "Stake won +0.7 Rep 🎉" : "Stake lost -0.2 Rep");
    }catch{}
  }
  // --- Ghost Bazaar helpers: 3 Rep pin 24h, 5 Rep blast ---
  function deductRep(cost:number): boolean {
    if(myRep < cost){ setToast(`Need ${cost} Rep — you have ${myRep.toFixed(1)}`); return false; }
    const next = Math.max(0, Number((myRep - cost).toFixed(1)));
    setMyRep(next);
    try{ const raw=localStorage.getItem("physi_profile"); if(raw){ const p=JSON.parse(raw); p.mining_balance=next; localStorage.setItem("physi_profile", JSON.stringify(p)); } }catch{}
    return true;
  }
  function buyPin(){ if(!deductRep(3)) return; try{ localStorage.setItem("physi_bazaar_pin", String(Date.now()+24*3600*1000)); }catch{} setCandy("-3 Rep pin 24h"); setTimeout(()=> setCandy(null), 1200); setToast("Pinned 24h 📌 -3 Rep"); setBazaarOpen(false); }
  function buyBlast(){ if(!deductRep(5)) return; try{ localStorage.setItem("physi_bazaar_blast", String(Date.now()+24*3600*1000)); }catch{} setCandy("-5 Rep blast"); setTimeout(()=> setCandy(null), 1200); setToast("Blast sent 🚀 -5 Rep"); setBazaarOpen(false); }
  // --- Pre-gossip: predicted ghost 7 days early dotted 0.35 ---
  function preVerifyBet(evId:string){
    const baseId=String(evId).split("__pred")[0].split("__tile")[0];
    if(preBets.some(b=> b.eventId===baseId)) { setToast("already Pre-verified this ghost"); return; }
    if(!deductRep(0.5)) return;
    const bet={ eventId: baseId, amt:0.5, ts: Date.now() };
    const next=[...preBets, bet]; setPreBets(next);
    setCandy("-0.5 Pre-verify"); setTimeout(()=> setCandy(null), 900);
    setToast("Pre-verify 0.5 Rep — 1.5x if ghost becomes real ✓");
  }
  // --- Rep lend helpers ---
  function doLend(){
    const to=lendTo.trim().toLowerCase().replace(/[^a-z0-9_]/g,"").slice(0,16);
    const amt=Number(lendAmt); const rate=Number(lendRate);
    if(!to || to.length<2){ setToast("enter handle 2-16 chars"); return; }
    if(!isFinite(amt) || amt <1){ setToast("amount >=1 Rep"); return; }
    if(!isFinite(rate) || rate<1 || rate>50){ setToast("rate 1-50%"); return; }
    if(myRep < amt){ setToast(`need ${amt} Rep — have ${myRep.toFixed(1)}`); return; }
    if(!deductRep(amt)) return;
    const due=Date.now()+7*86400000;
    const entry={ id: Math.random().toString(36).slice(2,9), to, amt, rate, due, created: Date.now(), repaid:false };
    setLendHist(prev=> [...prev, entry]);
    setCandy(`lent ${amt} → @${to}`); setTimeout(()=> setCandy(null),1200);
    setToast(`Lent ${amt} Rep to @${to} @ ${rate}% — due in 7 days`);
    setLendTo(""); setLendAmt("5");
  }
  function claimLend(id:string){
    const entry=lendHist.find(x=> x.id===id);
    if(!entry || entry.repaid) return;
    if(Date.now() < entry.due){ setToast("not due yet — wait 7 days (demo: you can still claim early at reduced interest)"); }
    const repay = Number((entry.amt * (1 + entry.rate/100)).toFixed(2));
    const nextRep = Number((myRep + repay).toFixed(2));
    setMyRep(nextRep);
    try{ const raw=localStorage.getItem("physi_profile"); if(raw){ const p=JSON.parse(raw); p.mining_balance=nextRep; localStorage.setItem("physi_profile", JSON.stringify(p)); } }catch{}
    setLendHist(prev=> prev.map(x=> x.id===id ? {...x, repaid:true}: x));
    setCandy(`+${repay} repaid`); setTimeout(()=> setCandy(null),1400);
    setToast(`Claimed ${repay} Rep from @${entry.to} (principal ${entry.amt} + ${entry.rate}%)`);
  }
  // --- Oracle helpers: bet 0.5 Rep on fork branch before quorum, payout 1.5x if win ---
  function oracleBet(forkKey:string, branchIx:number){
    const ap0 = conflictGroups.find((g)=> g.map((e)=> String(e.id)).join("__fork__")==forkKey)?.[branchIx] ? Number(conflictGroups.find((g)=> g.map((e)=> String(e.id)).join("__fork__")==forkKey)![branchIx].authority_points||0) : 0;
    // also check if fork already has winner
    const grp = conflictGroups.find(g=> g.map(e=> String(e.id)).join("__fork__")==forkKey);
    if(grp && grp.some(e=> Number(e.authority_points||0) >= FORK_THRESHOLD)){ setToast("Quorum reached — betting closed"); return; }
    if(oracleBets.some(b=> b.key===forkKey && !b.settled)){ setToast("Already bet on this fork"); return; }
    if(!deductRep(0.5)) return;
    const bet = { key: forkKey, ix: branchIx, amt:0.5, ts: Date.now(), settled:false };
    const next=[...oracleBets, bet]; setOracleBets(next); try{ localStorage.setItem("physi_oracle_bets", JSON.stringify(next)); }catch{}
    setCandy("-0.5 oracle bet"); setTimeout(()=> setCandy(null), 900); setToast(`Oracle bet 0.5 on branch ${branchIx+1} — payout 1.5x if win`);
  }
  // hydrate bazaar/oracle/chat from localStorage
  useEffect(()=>{ try{ const r=localStorage.getItem("physi_oracle_bets"); if(r) setOracleBets(JSON.parse(r)); const c=localStorage.getItem("physi_road_chat"); if(c){ const a=JSON.parse(c); if(Array.isArray(a)){ const f=a.filter((m:any)=> Date.now()-Number(m.ts) < 24*3600*1000); if(f.length!==a.length) localStorage.setItem("physi_road_chat", JSON.stringify(f)); if(f.length) setChatMsgs(f); } } }catch{} },[]);
  useEffect(()=>{ try{ localStorage.setItem("physi_oracle_bets", JSON.stringify(oracleBets)); }catch{} },[oracleBets]);
  useEffect(()=>{ try{ localStorage.setItem("physi_road_chat", JSON.stringify(chatMsgs)); }catch{} },[chatMsgs]);
  // hydrate pre-gossip + lend
  useEffect(()=>{ try{ const r=localStorage.getItem("phys_lend"); if(r){ const a=JSON.parse(r); if(Array.isArray(a)) setLendHist(a); } const pb=localStorage.getItem("physi_pre_bets"); if(pb){ const a=JSON.parse(pb); if(Array.isArray(a)) setPreBets(a); } }catch{} },[]);
  useEffect(()=>{ try{ localStorage.setItem("phys_lend", JSON.stringify(lendHist)); }catch{} },[lendHist]);
  useEffect(()=>{ try{ localStorage.setItem("physi_pre_bets", JSON.stringify(preBets)); }catch{} },[preBets]);
  // oracle payout watcher: when fork resolves (>=8), pay 1.5x
  useEffect(()=>{
    if(oracleBets.length===0 || conflictGroups.length===0) return;
    let changed=false; let payout=0;
    const updated = oracleBets.map(b=>{
      if(b.settled) return b;
      const grp = conflictGroups.find(g=> g.map(e=> String(e.id)).join("__fork__")==b.key);
      if(!grp) return b;
      const winnerIx = grp.findIndex(e=> Number(e.authority_points||0) >= FORK_THRESHOLD);
      if(winnerIx===-1) return b;
      changed=true;
      if(b.ix===winnerIx){ payout += 0.75; }
      return {...b, settled:true};
    });
    if(changed){
      setOracleBets(updated);
      try{ localStorage.setItem("physi_oracle_bets", JSON.stringify(updated)); }catch{}
      if(payout>0){
        const next = Math.max(0, Number((myRep + payout).toFixed(1)));
        setMyRep(next);
        try{ const raw=localStorage.getItem("physi_profile"); if(raw){ const p=JSON.parse(raw); p.mining_balance=next; localStorage.setItem("physi_profile", JSON.stringify(p)); } }catch{}
        setCandy(`+${payout.toFixed(2)} oracle win`); setTimeout(()=> setCandy(null), 1600);
        setToast(`Oracle win +${payout.toFixed(2)} Rep 🎉`);
        setShowConfetti(true); setTimeout(()=> setShowConfetti(false), 3200);
      } else {
        setToast("Oracle bet lost");
      }
    }
  },[events, conflictGroups]);
  function sendChat(){
    const t=chatDraft.trim(); if(!t) return;
    if(t.length>200){ setToast("max 200 chars"); return; }
    const user = (youHandle || "you").slice(0,16);
    const msg={ user, text: t.slice(0,200), ts: Date.now() };
    const filtered=[...chatMsgs.filter(m=> Date.now()-m.ts < 24*3600*1000), msg].slice(-50);
    setChatMsgs(filtered);
    try{ localStorage.setItem("physi_road_chat", JSON.stringify(filtered)); }catch{}
    setChatDraft("");
    // ghost reply 1s later from zara_11
    setTimeout(()=>{ const replies=["fr fr","seen 👀","LT2 now?","on my way","bet","noted ✓"]; const r=replies[Math.floor(Math.random()*replies.length)]; setChatMsgs(prev=>{ const a=[...prev.filter(m=> Date.now()-m.ts<24*3600*1000), {user:"zara_11", text:r, ts:Date.now()}].slice(-50); try{ localStorage.setItem("physi_road_chat", JSON.stringify(a)); }catch{} return a; }); }, 900);
  }

  return (
    <div className={`${fredoka.className} ${fredoka.variable} relative -mx-4 -mt-5 w-[100vw] max-w-[100vw] sm:-mx-6 lg:-mx-8`}>
      <style>{`@keyframes canonicalPop{0%{transform:scale(0.72)}50%{transform:scale(1.22)}100%{transform:scale(1)}} @keyframes sevPulse{0%,100%{transform:scale(1);filter:brightness(1)}50%{transform:scale(1.08);filter:brightness(1.25)}} @keyframes tickPulse{0%,100%{opacity:1}50%{opacity:.55}} @keyframes roadShimmer{0%{stroke-dashoffset:0}100%{stroke-dashoffset:28}} @keyframes scaleIn{0%{transform:scale(0.35);opacity:0}60%{transform:scale(1.14);opacity:1}100%{transform:scale(1);opacity:1}} @keyframes nowPulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.06);opacity:.94}} @keyframes ghostDrift{0%{transform:translateY(0) translateX(0)}25%{transform:translateY(-10px) translateX(7px)}50%{transform:translateY(-16px) translateX(-5px)}75%{transform:translateY(-8px) translateX(4px)}100%{transform:translateY(0) translateX(0)}} @keyframes ghostPulse{0%,100%{opacity:.92}50%{opacity:.56}} @keyframes candyPop{0%{transform:translate(-50%,-10px) scale(0.5);opacity:0}18%{transform:translate(-50%,-18px) scale(1.18);opacity:1}72%{transform:translate(-50%,-42px) scale(1);opacity:1}100%{transform:translate(-50%,-64px) scale(0.9);opacity:0}} @keyframes pulseSlideIn{0%{transform:translate(-50%,-18px);opacity:0}12%{transform:translate(-50%,0);opacity:1}88%{transform:translate(-50%,0);opacity:1}100%{transform:translate(-50%,-18px);opacity:0}} @keyframes confettiFall{0%{transform:translateY(-10vh) rotate(0deg);opacity:1}100%{transform:translateY(110vh) rotate(720deg);opacity:0}} @keyframes skeletonPulse{0%,100%{opacity:0.55}50%{opacity:1}} @keyframes questFill{0%{width:0}100%{width:var(--fill)}} @keyframes forkMerge{0%{transform:translateX(0)}100%{transform:translateX(0)}} @keyframes forkWinnerPulse{0%,100%{filter:drop-shadow(0 0 0 rgba(16,185,129,0))}50%{filter:drop-shadow(0 0 8px rgba(16,185,129,0.9))}} @keyframes fabPulse{0%{transform:scale(1);box-shadow:0 8px 24px rgba(139,92,246,0.5),0 4px 12px rgba(0,0,0,0.3)}50%{transform:scale(1.08);box-shadow:0 12px 36px rgba(139,92,246,0.75),0 6px 18px rgba(0,0,0,0.4)}100%{transform:scale(1);box-shadow:0 8px 24px rgba(139,92,246,0.5),0 4px 12px rgba(0,0,0,0.3)}} @keyframes pulseRing{0%{transform:scale(0.8);opacity:0.9}70%{transform:scale(1.55);opacity:0}100%{transform:scale(1.7);opacity:0}} @keyframes panicDoublePulse{0%{transform:scale(0.85);opacity:0.95}25%{transform:scale(1.35);opacity:0.7}50%{transform:scale(0.9);opacity:0.95}75%{transform:scale(1.45);opacity:0}100%{transform:scale(1.6);opacity:0}} @keyframes panicGlow{0%,100%{filter:drop-shadow(0 0 0 rgba(239,68,68,0))}50%{filter:drop-shadow(0 0 14px rgba(239,68,68,0.9))}} .road-3d-wrap{perspective:800px;perspective-origin:50% 28%} .road-3d-inner{transform-style:preserve-3d;transform:perspective(800px) rotateX(4deg);transform-origin:center top;will-change:transform;clip-path:ellipse(96% 88% at 50% 46%);border-radius:28px} .road-3d-inner::before{content:\"\";position:absolute;inset:0;pointer-events:none;border-radius:28px;box-shadow:inset 0 10px 22px rgba(0,0,0,0.16),inset 0 -8px 16px rgba(0,0,0,0.12)} .node-3d{transform:translateZ(6px);box-shadow:inset 0 1.5px 0 rgba(255,255,255,0.55),inset 0 -2px 4px rgba(0,0,0,0.14),0 8px 20px rgba(0,0,0,0.42),0 1px 6px rgba(0,0,0,0.32);transition:transform 220ms cubic-bezier(.2,.8,.3,1),box-shadow 220ms ease} .node-3d:hover{transform:translateZ(12px) scale(1.02);box-shadow:inset 0 1.5px 0 rgba(255,255,255,0.65),inset 0 -3px 6px rgba(0,0,0,0.16),0 12px 28px rgba(0,0,0,0.5),0 4px 12px rgba(0,0,0,0.36)}`}</style>
      <div className="relative min-h-[calc(100vh-64px)] w-full overflow-hidden xl:pr-[276px]" style={{ background: "linear-gradient(180deg, #0d3b2a 0%, #143d2e 42%, #1a5c3a 100%)" }}>
        {/* infinite parallax 3 layers: back mountains 0.3x mid lollipops 0.6x front road 1.0x translateY scroll */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {/* back mountains 0.3x */}
          <div className="parallax-layer absolute inset-0" style={{ transform: `translateY(${parallaxY * 0.3}px)` }}>
            <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(13,59,42,0.85) 0%, rgba(26,92,58,0.55) 55%, rgba(45,106,79,0.72) 100%)" }} />
            <div className="absolute -top-[8vh] left-1/2 h-[58vh] w-[120vw] -translate-x-1/2 rounded-[100%] opacity-[0.22]" style={{ background: "radial-gradient(ellipse at center, rgba(82,183,136,0.28) 0%, rgba(64,145,108,0.20) 42%, rgba(45,106,79,0.16) 72%, transparent 75%)" }} />
            <div className="absolute top-[18vh] left-[-6%] h-[46vh] w-[46vh] rounded-full opacity-[0.16] blur-[40px]" style={{ background: "radial-gradient(circle, rgba(82,183,136,0.95), transparent 70%)" }} />
            <div className="absolute top-[52vh] right-[-8%] h-[50vh] w-[50vh] rounded-full opacity-[0.18] blur-[42px]" style={{ background: "radial-gradient(circle, rgba(45,106,79,0.9), transparent 70%)" }} />
          </div>
          {/* mid lollipops glow 0.6x + 2s bob */}
          <div className="parallax-layer lollipop-bob absolute inset-0" style={{ transform: `translateY(${parallaxY * 0.6}px)` }}>
            <div className="absolute bottom-[18vh] left-1/2 h-[38vh] w-[90vw] -translate-x-1/2 opacity-[0.12] blur-[30px]" style={{ background: "radial-gradient(ellipse, rgba(64,145,108,0.55), transparent 72%)" }} />
          </div>
          {/* front road depth 1.0x - subtle road-tint veil that scrolls with content */}
          <div className="parallax-layer absolute inset-0" style={{ transform: `translateY(${parallaxY * 1.0}px)`, opacity: 0.06 }}>
            <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, transparent 30%, rgba(139,92,246,0.08) 70%, transparent 100%)" }} />
          </div>
        </div>

        {/* cross-school mirror badge — ?school=FUTO loads school.json / DATABASE_URLS shard */}
        {schoolMeta && (
          <div className="pointer-events-none absolute left-1/2 top-[46px] z-20 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/20 bg-black/70 px-3 py-1 font-mono text-[10px] font-bold text-white backdrop-blur">
            {schoolMeta.badge} · <a href="?school=FUTO" className="pointer-events-auto underline decoration-white/30 hover:text-amber-200">FUTO</a> · <a href="?school=UNIPORT" className="pointer-events-auto underline decoration-white/30">UNIPORT</a> · {schoolMeta.name}
          </div>
        )}
        {/* top bar — decluttered: PHYSI · WAT · bell + entangled squad web */}
        <div className="pointer-events-none absolute left-0 right-0 top-0 z-20 flex justify-center px-3 pt-3 sm:px-6">
          <div className="pointer-events-auto flex w-full max-w-[900px] items-center justify-between gap-2">
            <div className="liquid-glass glass-bevel flex items-center gap-2 rounded-full border border-white/[0.14] px-4 py-2 backdrop-blur-[16px] shadow-[0_8px_32px_rgba(0,0,0,0.28),0_0_16px_rgba(139,92,246,0.14),inset_0_1px_0_rgba(255,255,255,0.18)] backdrop-blur-[16px]" style={{ background: "rgba(255,255,255,0.08)", backdropFilter: "blur(16px) saturate(1.22)" } as any} >
              <span className={`${fredoka.className} text-[13px] font-black tracking-[0.12em] text-white`}>PHYSI</span>
              <span className="h-3 w-px bg-white/15" />
              <span className="flex items-center gap-1.5 font-mono text-[11px] font-bold text-white" style={{ fontVariantNumeric:"tabular-nums" }}>
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                {wat.timePart} WAT
              </span>
              <span className="hidden font-mono text-[10px] text-slate-400 sm:inline">· {wat.wday} {wat.datePart}</span>
              {/* entangled squad: 3 dots linked violet lines to avatar */}
              <span className="hidden sm:flex items-center gap-1 ml-1" aria-label="squad web">
                <span className="relative flex items-center gap-1">
                  <svg width="54" height="18" viewBox="0 0 54 18" className="absolute -left-1 top-1/2 -translate-y-1/2 pointer-events-none" style={{zIndex:0}}>
                    <line x1="9" y1="9" x2="27" y2="9" stroke="#8b5cf6" strokeWidth="1.2" opacity="0.9" />
                    <line x1="18" y1="9" x2="36" y2="9" stroke="#8b5cf6" strokeWidth="1.2" opacity="0.9" />
                    <line x1="36" y1="9" x2="45" y2="9" stroke="#8b5cf6" strokeWidth="1.2" opacity="0.9" />
                  </svg>
                  {[0,1,2].map(i=> <span key={i} className={`relative h-2.5 w-2.5 rounded-full border border-white/60 ${squad && squad.members?.[i] ? "bg-violet-500" : "bg-white/25"}`} style={{zIndex:1}} />)}
                  <span className={`ml-1 flex h-5 w-5 items-center justify-center rounded-full border-2 text-[9px] font-black text-white ${squad && isSquadFormed(squad as any) ? "squad-emerald-pulse border-emerald-300 bg-emerald-500" : "border-white/40 bg-white/10"}`} style={{zIndex:1}}>👤</span>
                </span>
                {squad && isSquadFormed(squad as any) && <span className="squad-emerald-pulse ml-1 rounded-full bg-emerald-500 px-2 py-0.5 font-mono text-[9px] font-black text-white">👥 3/3 1.5x</span>}
              </span>
              <button onClick={()=> setMoreOpen(v=>!v)} aria-label="More" className="ml-1 rounded-full border border-white/10 bg-white/10 px-2.5 py-1 font-mono text-[11px] font-black text-white hover:bg-white hover:text-black transition">⋯ More</button>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <button onClick={()=>{ setBellOpen(v=>!v); if(!bellOpen){ bellSeenRef.current=Date.now(); setBellCount(0); try{ localStorage.setItem(`physi_bell_seen_${myUserId||'anon'}`, String(Date.now())); }catch{} } }} aria-label="Notifications" className={`relative flex items-center justify-center rounded-full border backdrop-blur transition ${panicInfo ? "h-10 w-10 text-[18px] border-red-500 bg-gradient-to-br from-amber-500 to-red-600 text-white shadow-[0_0_14px_rgba(239,68,68,0.7)]" : "h-8 w-8 text-[14px] border-white/10 bg-black/60 text-white hover:bg-white hover:text-black"}`}>
                  <span className={panicInfo ? "text-[18px]" : "text-[14px]"}>🔔</span>
                  {(bellCount>0 || mineHasNew) && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-black text-white ring-2 ring-black">{bellCount>0 ? bellCount : 1}</span>}
                </button>
                {panicInfo && panicDeltaFmt && (
                  <div className="absolute left-1/2 top-[44px] -translate-x-1/2 whitespace-nowrap rounded-full bg-gradient-to-r from-amber-400 to-red-500 px-3 py-1.5 text-center shadow-xl ring-2 ring-white/20">
                    <p className="font-mono text-[11px] font-black leading-none text-white">in {panicDeltaFmt}</p>
                  </div>
                )}
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
            </div>
          </div>
        </div>
        {/* ⋯ More drawer — collapses Squad/Lecturer/Bazaar/Oracle + Rep/Streak */}
        {moreOpen && (
          <div className="pointer-events-none absolute left-1/2 top-[54px] z-30 flex w-full max-w-[900px] -translate-x-1/2 justify-center px-3 sm:px-6">
            <div className="pointer-events-auto w-full max-w-[560px] rounded-2xl border border-white/10 bg-white/[0.08] 85 p-3 backdrop-blur-[16px] shadow-[0_16px_40px_rgba(0,0,0,0.6)]">
              <div className="flex items-center justify-between">
                <p className="font-mono text-[11px] font-bold tracking-wide text-white">More</p>
                <button onClick={()=> setMoreOpen(false)} className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold text-white">✕</button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button onClick={()=>{ setMoreOpen(false); setSquadOpen(true); }} className={`rounded-full border px-3 py-1.5 text-[11px] font-black ${squad && isSquadFormed(squad as any) ? "border-emerald-400/40 bg-emerald-500 text-white" : "border-white/15 bg-white/10 text-white"}`}>👥 Squad {squad && isSquadFormed(squad as any) ? "✓ 1.5x" : `${squad?.members?.filter(Boolean).length||0}/3`}</button>
                <button onClick={()=>{ setMoreOpen(false); setLectOpen(true); }} className={`rounded-full border px-3 py-1.5 text-[11px] font-black ${lecturer?.pinVerified ? "border-emerald-400/40 bg-emerald-500 text-white" : lecturer?.verified ? "border-amber-400/30 bg-amber-500/20 text-amber-200" : "border-white/15 bg-white/10 text-white"}`}>🎓 {lecturer?.pinVerified ? "Lecturer Emerald ✓" : lecturer?.verified ? "Lecturer verified" : "Lecturer oracle"}</button>
                <button onClick={()=>{ setMoreOpen(false); setBazaarOpen(true); }} className="rounded-full border border-emerald-400/30 bg-emerald-500/20 px-3 py-1.5 text-[11px] font-black text-emerald-200">🛒 Bazaar</button>
                <button onClick={()=>{ setMoreOpen(false); setShareOpen(true); }} className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-bold text-white">◉ Rep {myRep.toFixed(1)} · Lvl {levelInfo.lvl} {levelInfo.name}</button>
                <span className="inline-flex items-center gap-1 rounded-full border border-orange-400/20 bg-orange-500/15 px-3 py-1.5 text-[11px] font-black text-orange-200">🔥 {streak} streak</span>
                <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-[11px] font-black ${presence?.isWitness ? "witness-gold border-amber-400/30 bg-amber-400 text-black fused-purple-glow" : "border-white/10 bg-white/5 text-slate-300"}`} style={presence?.isWitness ? { animation: "witnessPulse 1.6s ease-in-out infinite" } as any : undefined}>{presenceScore.toFixed(1)} {presence?.isWitness ? "Witness" : "Remote"}</span>
                <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-bold ${verifiedCount>0?"bg-emerald-500 text-white":"bg-white/10 text-slate-300"}`}>{verifiedCount} ✓</span>
                <span className="inline-flex items-center rounded-full bg-amber-500 px-3 py-1.5 text-[11px] font-bold text-white">{advisoryCount} ●</span>
                <button onClick={()=>{ navigator.clipboard?.writeText(window.location.href); setToast("link copied"); }} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-white">↗ Share</button>
                <button onClick={()=> setShowCreate(true)} className="rounded-full bg-white px-3 py-1.5 text-[11px] font-black text-black">＋ New gist</button>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="h-1.5 w-16 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-emerald-400" style={{ width: `${levelInfo.progress*100}%` }} /></div>
                <RepSparkline rep={myRep} />
                <span className="font-mono text-[10px] text-slate-400">{levelInfo.nextAt ? `${(levelInfo.nextAt-myRep).toFixed(1)} to L${levelInfo.lvl+1}` : "MAX"}</span>
                <button onClick={()=> setRepExplainerOpen(true)} className="ml-auto rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[10px] font-bold text-slate-300">ⓘ Rep</button>
              </div>
              <div className="mt-2 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-black text-white" style={{ background: GHOST_DOT_BG, borderColor: "rgba(255,255,255,0.3)" }}>{anonDot(youHandle||"you").slice(0,2)}</span>
                <span className="font-mono text-[11px] font-bold text-white">Pure ghost</span><span className="rounded-full px-1.5 py-0.5 font-mono text-[9px] font-bold text-white" style={{ background: GHOST_DOT_BG }}>#7F3A</span>
                <span className="font-mono text-[10px] text-slate-500">anon hash dots default · Rep stays</span>
                <button onClick={()=> setShowHandles(v=>!v)} className={`ml-auto rounded-full border px-2.5 py-1 text-[10px] font-black transition ${showHandles ? "bg-white text-black border-white" : "bg-white/10 text-white border-white/15"}`}>{showHandles ? "handles ON" : "handles OFF"}</button>
              </div>
            </div>
          </div>
        )}

        {/* second row — decluttered: centered NOW only (share/bazaar/stake moved to ⋯ More) */}
        <div className="pointer-events-none absolute left-1/2 top-[54px] z-20 flex w-full max-w-[560px] -translate-x-1/2 justify-center px-3 sm:px-6">
          <button onClick={() => scrollToNow(true)} className="pointer-events-auto rounded-full border border-violet-400/30 bg-violet-500/20 px-3 py-1.5 text-[11px] font-bold text-violet-200 backdrop-blur hover:bg-violet-500 hover:text-white transition">◎ NOW</button>
        </div>

        <p className="absolute left-1/2 top-[92px] z-10 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/10 bg-black/70 px-3 py-1 font-mono text-[10px] tracking-wide text-slate-400 backdrop-blur sm:hidden">
          {loading ? "LOADING ROAD…" : `${pastCount} BEHIND · NOW · ${upcomingCount} AHEAD`}
        </p>
        {/* Quest bar - 3 dots with progress fill + daily quest ring */}
        <div className="pointer-events-none absolute left-1/2 top-[116px] z-20 flex w-full max-w-[560px] -translate-x-1/2 justify-center px-3 sm:top-[108px] sm:px-6">
          <div className="pointer-events-auto flex w-full items-center gap-2 rounded-full border border-white/10 bg-white/[0.08] 75 px-3 py-2 backdrop-blur-[16px] shadow-[0_8px_24px_rgba(0,0,0,0.5)] sm:px-4">
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
          <span className={`rounded-full border border-amber-400/20 bg-white/[0.08] px-3 py-1 ${fredoka.className} text-[14px] font-black tracking-tight text-amber-200 backdrop-blur`}>Verify 3 today → +5 bonus · {dailyCount}/3 {dailyBonusDone ? "✓ done" : ""}</span>
        </div>
        {/* unified Filters ▾ drawer at 126px — hides Filters+Search behind single toggle */}
        <div className="pointer-events-none absolute left-1/2 top-[126px] z-20 flex w-full max-w-[560px] -translate-x-1/2 justify-center px-3">
          <button onClick={()=> setFiltersOpen(o=>!o)} className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/75 px-4 py-2 font-mono text-[11px] font-bold text-white backdrop-blur-xl shadow-[0_8px_24px_rgba(0,0,0,0.4)]">Filters {filtersOpen ? '▴' : '▾'} <span className="rounded-full bg-white/15 px-1.5 py-0.5 text-[10px]">{filter} · {viewMode}</span></button>
        </div>
        {filtersOpen && (
          <div className="pointer-events-none absolute left-1/2 top-[162px] z-20 flex w-full max-w-[560px] -translate-x-1/2 flex-col gap-2 px-3">
            <div className="pointer-events-auto flex items-center justify-center gap-1 rounded-full liquid-glass glass-bevel border border-white/10 bg-white/[0.08] px-1.5 py-1 backdrop-blur-[16px]">
              <button onClick={()=> setViewMode("map")} className={`rounded-full px-3 py-1.5 font-mono text-[11px] font-bold transition ${viewMode==="map" ? "bg-white text-black shadow" : "bg-white/10 text-slate-300"}`}>⬢ Map</button>
              <button onClick={()=> setViewMode("list")} className={`rounded-full px-3 py-1.5 font-mono text-[11px] font-bold transition ${viewMode==="list" ? "bg-white text-black shadow" : "bg-white/10 text-slate-300"}`}>▦ List</button>
              <span className="ml-1 font-mono text-[10px] text-slate-400">{filteredRoadItems.length} items</span>
            </div>
            <div className="pointer-events-auto flex items-center gap-1.5 overflow-x-auto rounded-full liquid-glass glass-bevel border border-white/10 bg-white/[0.08] px-2 py-1.5 backdrop-blur-[16px] scrollbar-none">
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
        {/* Live pulse toasts - top center */}
        <div className={`pointer-events-none absolute left-1/2 z-30 -translate-x-1/2 ${filtersOpen ? 'top-[268px]' : 'top-[166px]'}`}>
          {pulseMsg && (
            <div className={`rounded-full border border-emerald-400/20 bg-black/80 px-4 py-2 font-mono text-[11px] font-semibold text-white backdrop-blur-xl shadow-[0_8px_24px_rgba(0,0,0,0.5)] transition-all duration-500 ${pulseShow ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-3"}`} style={{ animation: pulseShow ? "pulseSlideIn 3s ease" : undefined }}>
              <span className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-400" />{pulseMsg}
            </div>
          )}
        </div>
        {/* Squad/Lecturer/Bazaar collapsed into ⋯ More — hide inline quick bar; Rep/Streak moved to More/profile */}
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
        {/* Squad/Lecturer hidden — now in ⋯ More drawer */}
        {/* Rep/Streak hidden from road — now in ⋯ More + profile sheet */}
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

        {/* Desktop Rep board hidden — moved to ⋯ More/profile for clean road; keep hidden for xl if needed */}
        <div className="hidden">
          <RepBoard repBoard={repBoard} youHandle={youHandle} streak={streak} myRep={myRep} levelInfo={levelInfo} onShare={()=> setShareOpen(true)} repSheetOpen={repSheetOpen} setRepSheetOpen={setRepSheetOpen} />
        </div>
        {/* SCROLLABLE ROAD CONTAINER — endless winding purple road — subtle 3D emboss */}
        <div className={`road-3d-wrap relative mx-auto flex h-[calc(100vh-64px)] w-full max-w-[560px] justify-center overflow-hidden pt-[112px] sm:pt-[104px] ${viewMode!=="map" ? "hidden" : ""}`} style={{ perspective: "800px", perspectiveOrigin: "50% 28%" }}>
          {/* depth gradients on sides — 3D vignette */}
          <div className="pointer-events-none absolute inset-y-0 left-0 w-[18%] z-[4]" style={{ background: "linear-gradient(to right, rgba(0,0,0,0.38) 0%, rgba(0,0,0,0.18) 42%, transparent 100%)" }} />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-[18%] z-[4]" style={{ background: "linear-gradient(to left, rgba(0,0,0,0.38) 0%, rgba(0,0,0,0.18) 42%, transparent 100%)" }} />
          <div
            ref={scrollRef}
            className={`road-3d-inner relative flex h-full w-full justify-center overflow-auto pb-[320px] sm:pb-[340px] ${roadWarp==="left" ? "road-warp-left" : roadWarp==="right" ? "road-warp-right" : ""}`}
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
          {/* infinite parallax inner layers inside scroll: back mountains 0.3x / mid lollipops 0.6x */}
          <div className="parallax-layer pointer-events-none absolute left-1/2 top-[104px] w-[96%] -translate-x-1/2 overflow-hidden rounded-[28px]" style={{ height: svgH, minHeight: svgH, transform: `translateY(${parallaxY * 0.3}px)` }} aria-hidden>
            <svg viewBox={`0 0 520 ${svgH}`} className="absolute inset-0 h-full w-full">
              <path d="M -10 210 L 90 78 L 170 175 L 250 54 L 340 168 L 430 92 L 560 210 Z" fill="rgba(13,59,42,0.32)" stroke="rgba(255,255,255,0.10)" strokeWidth={1} />
              <path d="M -10 240 L 70 150 L 145 210 L 250 120 L 370 210 L 470 155 L 560 240 Z" fill="rgba(26,92,58,0.28)" />
              <g opacity={0.32}>
                <ellipse cx={86} cy={310} rx={22} ry={13} fill="#6b8f71" />
                <ellipse cx={92} cy={306} rx={10} ry={6} fill="#a7c4a0" opacity={0.7} />
                <ellipse cx={438} cy={520} rx={20} ry={12} fill="#7a9e7e" />
                <ellipse cx={430} cy={516} rx={8} ry={5} fill="#d8f3dc" opacity={0.85} />
                <ellipse cx={78} cy={680} rx={18} ry={10} fill="#5a7a5a" />
                <path d="M 430 710 L 452 728 L 418 735 Z" fill="#b7e4c7" opacity={0.9} />
              </g>
            </svg>
          </div>
          <div className="parallax-layer pointer-events-none absolute left-1/2 top-[104px] w-[96%] -translate-x-1/2 overflow-hidden rounded-[28px]" style={{ height: svgH, minHeight: svgH, transform: `translateY(${parallaxY * 0.6}px)` }} aria-hidden>
            <svg viewBox={`0 0 520 ${svgH}`} className="absolute inset-0 h-full w-full">
              {[42, 92, 410, 462].map((x, i) => (
                <g key={i} opacity={0.38} className="lollipop-bob" style={{ animationDelay: `${i*0.4}s`} as any}>
                  <rect x={x - 3.5} y={460} width={7} height={18} rx={3} fill="#5a3e1b" />
                  <circle cx={x} cy={436} r={20} fill="#52b788" stroke="rgba(255,255,255,0.16)" strokeWidth={1.4} />
                  <circle cx={x} cy={436} r={13} fill="rgba(255,255,255,0.08)" />
                  <circle cx={x + 6} cy={428} r={3.4} fill="#fbbf24" stroke="rgba(255,255,255,0.9)" strokeWidth={0.8} />
                </g>
              ))}
            </svg>
          </div>

          <svg viewBox={`0 0 520 ${svgH}`} className="relative h-auto w-full shrink-0" style={{ minHeight: Math.min(880, svgH), height: svgH }} role="img" aria-label="endless time road">
            <defs>
              <linearGradient id="purpleRoad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#6e45d0" />
                <stop offset="50%" stopColor="#8b5cf6" />
                <stop offset="100%" stopColor="#a78bfa" />
              </linearGradient>
              <linearGradient id="panicRoad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#f59e0b" />
                <stop offset="100%" stopColor="#ef4444" />
              </linearGradient>
              <filter id="roadShadow"><feDropShadow dx="0" dy="4" stdDeviation={6} floodColor="rgba(0,0,0,0.42)" /></filter>
              <filter id="nodeGlow"><feDropShadow dx="0" dy="2" stdDeviation={5} floodColor="rgba(255,255,255,0.14)" /></filter>
              <pattern id="sprinkleDots" patternUnits="userSpaceOnUse" width={42} height={12} patternTransform="rotate(12)">
                <circle cx={6} cy={6} r={2.8} fill="rgba(255,255,255,0.70)" />
              </pattern>
            </defs>

            {/* purple road — subtle depth */}
            <path d={roadD} fill="none" stroke="#1a1033" strokeWidth={52} strokeLinecap="round" strokeLinejoin="round" opacity={0.92} style={{ filter: "url(#roadShadow)" }} />
            {/* panic amber->red gradient overlay when event within 2h */}
            {panicInfo && <path d={roadD} fill="none" stroke="url(#panicRoad)" strokeWidth={46} strokeLinecap="round" strokeLinejoin="round" opacity={0.88} style={{ filter: "drop-shadow(0 0 10px rgba(239,68,68,0.55))" } as any} />}
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
                            <g key={ev.id} opacity={opacity} style={{ ...(isWinner ? { animation: "forkWinnerPulse 1.4s ease-in-out infinite" } as any : {}), cursor: isLoser && isPastFork ? "pointer" : "pointer" }} onClick={(e)=>{ e.stopPropagation(); if(isLoser && isPastFork){
                              // ghost replay: fetch voters then modal with WAT timestamp + outcome + confetti
                              (async()=>{
                                let voters:any[]=[];
                                try{
                                  const r=await fetch(`/api/verify?event_id=${encodeURIComponent(String(ev.id).split("__tile")[0])}`,{cache:"no-store"});
                                  const j=await r.json().catch(()=>({} as any));
                                  voters = j.verifications ?? j.rows ?? [];
                                }catch{}
                                setGhostModal({ open:true, ev, voters, forkIx: bIdx });
                                // small delay confetti replay
                                setGhostConfetti(true); setTimeout(()=> setGhostConfetti(false), 2800);
                                vibrate(20);
                              })();
                              return;
                            }
                            setQTap(true); setSelectedId(String(ev.id).split("__tile")[0]); setSheetOpen(true); }}>
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
                              {!hasWinner && (()=>{ const fk=(item.ids as string[]).join("__fork__"); const bet=oracleBets.find(b=> b.key===fk && b.ix===bIdx); const already=oracleBets.some(b=> b.key===fk && !b.settled); return <foreignObject x={bx-42} y={p.y+52} width={84} height={22}><div style={{display:"flex", justifyContent:"center"}}><button onClick={(e)=>{e.stopPropagation(); oracleBet(fk,bIdx);}} disabled={!!already} style={{fontSize:"8px", fontWeight:900, padding:"2px 6px", borderRadius:"999px", background: already ? "#334155" : "#f59e0b", color: already ? "#94a3b8" : "black", border:"1px solid rgba(255,255,255,0.3)", cursor: already? "not-allowed":"pointer"}}>{bet ? (bet.settled ? (bet.ix===winnerIdx? "won":"lost") : "bet 0.5✓") : "bet 0.5"}</button></div></foreignObject>; })()}
                              {isPastFork && <text x={bx} y={p.y+74} textAnchor="middle" fontSize={6} fontWeight={700} fill="rgba(255,255,255,0.45)" style={{fontFamily:"ui-monospace,monospace"}}>FORK · PAST</text>}
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
                  // --- Predicted ghost 7 days early dotted 0.35 ---
                  if((item as any).kind === "predicted"){
                    const pr = item as PredictedItem;
                    const p = nodes[i];
                    const isVisiblePred = (()=>{ const y=p.y; return y >= scrollPos - 400 && y <= scrollPos + viewH + 400; })();
                    if(!isVisiblePred){ return <g key={item.id} id={`node-${String(pr.id).split("__pred")[0]}`} style={{display:"none"}} />; }
                    const basePredId = String(pr.id).split("__pred")[0].split("__tile")[0];
                    const isActivePred = selectedId===basePredId || selectedId===item.id;
                    const hasBet = preBets.some(b=> b.eventId===basePredId);
                    const title = pr.ev.title.length>16 ? pr.ev.title.slice(0,16)+"…" : pr.ev.title;
                    const pillW = Math.max(132, Math.min(180, title.length*7+32));
                    const pillX = p.x <260 ? p.x+42 : p.x - pillW -12;
                    return (
                      <g key={item.id} id={`node-${basePredId}`} opacity={0.35} style={{ cursor:"pointer" }} onClick={()=>{ setSelectedId(basePredId); setSheetOpen(true); setToast("predicted ghost — 7 days early dotted 0.35"); }}>
                        <circle cx={p.x} cy={p.y+6} r={30} fill="black" opacity={0.22} />
                        <g style={{ transformOrigin:`${p.x}px ${p.y}px`, transform:"translateZ(8px)" } as any}>
                          <circle cx={p.x} cy={p.y} r={28} fill="rgba(255,255,255,0.92)" stroke="#8b5cf6" strokeWidth={2.8} strokeDasharray="6 4" opacity={0.95} style={{ filter: "drop-shadow(0 0 12px rgba(139,92,246,0.55))" } as any} />
                          <circle cx={p.x} cy={p.y} r={24} fill="none" stroke="rgba(255,255,255,0.0)" strokeWidth={6} className="quantum-shimmer" style={{ clipPath: `circle(28px at ${p.x}px ${p.y}px)` } as any} opacity={0.9} />
                          <circle cx={p.x} cy={p.y} r={16} fill="rgba(245,243,255,0.9)" strokeDasharray="4 3" />
                          <text x={p.x} y={p.y+5} textAnchor="middle" fontSize={11} fontWeight={800} fill="#6d28d9" style={{ fontFamily: fredoka.style.fontFamily }}>👁</text>
                        </g>
                        <g opacity={1}>
                          <rect x={pillX} y={p.y-38} width={pillW} height={22} rx={11} fill={isActivePred ? "white" : "rgba(139,92,246,0.85)"} stroke="#a78bfa" strokeDasharray="6 4" />
                          <text x={pillX+pillW/2} y={p.y-23} textAnchor="middle" fontSize={10} fontWeight={900} fill={isActivePred ? "#000" : "white"} style={{ fontFamily: fredoka.style.fontFamily }}>{title}</text>
                        </g>
                        <g opacity={0.9}>
                          <rect x={pillX} y={p.y+22} width={pillW} height={14} rx={7} fill="rgba(0,0,0,0.6)" />
                          <text x={pillX+pillW/2} y={p.y+32} textAnchor="middle" fontSize={7} fontWeight={600} fill="#cbd5e1" style={{ fontFamily:"ui-monospace,monospace" }}>👁 predicted · 7d early · {fmtDate(pr.predDate)} {fmtTime(pr.predTime)}</text>
                        </g>
                        <foreignObject x={p.x-46} y={p.y+40} width={92} height={22}>
                          <div style={{display:"flex", justifyContent:"center"}}>
                            <button onClick={(e)=>{ e.stopPropagation(); preVerifyBet(item.id); }} disabled={hasBet} style={{fontSize:"8px", fontWeight:900, padding:"3px 8px", borderRadius:"999px", background: hasBet ? "#334155" : "#a78bfa", color: hasBet ? "#94a3b8" : "white", border:"1px solid rgba(255,255,255,0.4)", cursor: hasBet? "not-allowed":"pointer", opacity:0.95}}>
                              {hasBet ? "Pre-verified ✓" : "Pre-verify 0.5"}
                            </button>
                          </div>
                        </foreignObject>
                        <text x={p.x} y={p.y+64} textAnchor="middle" fontSize={6} fontWeight={700} fill="rgba(255,255,255,0.6)" style={{fontFamily:"ui-monospace,monospace"}}>GHOST · 0.35 dotted</text>
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
                  // severity overrides size/color/width — move blue, shift yellow, cancelled red pulse
                  let sev: Severity = "move";
                  let sevW = 38;
                  if (!isPersonal && !isDemo && (item as any).ev) {
                    sev = sevOf((item as any).ev);
                    sevW = sevWidth(sev);
                    nodeR = sevNodeR(sev, nodeR);
                    // override outline by severity for non-canonical
                    if ((st as any).key !== "canonical") outline = SEVERITY_COLOR[sev];
                    if (sev==="cancelled") anim = anim ? anim + ", sevPulse 1.2s ease-in-out infinite" : "sevPulse 1.2s ease-in-out infinite";
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
                      {/* entangled ghost #7F3A dots around node — violet lines */}
                      <g opacity={0.92}>
                        {[0,1,2].map(k=>{ const a=(k*120-30)*Math.PI/180; const r=nodeR+14; const gx=p.x+Math.cos(a)*r; const gy=p.y+Math.sin(a)*r; return <g key={k}><line x1={p.x} y1={p.y} x2={gx} y2={gy} stroke="#8b5cf6" strokeWidth="1" opacity="0.55" strokeDasharray="2 3" /><circle cx={gx} cy={gy} r={5.5} fill={GHOST_DOT_BG} stroke="rgba(255,255,255,0.7)" strokeWidth="1" opacity={0.92} /><circle cx={gx} cy={gy} r={2.2} fill="white" opacity={0.9} /></g>; })}
                      </g>
                      {/* lecturer emerald OFFICIAL star above */}
                      {lecturer?.pinVerified && <g><circle cx={p.x} cy={p.y - nodeR - 12} r={8} fill="#10b981" stroke="white" strokeWidth="1.2" className="squad-emerald-pulse" /><text x={p.x} y={p.y - nodeR - 8} textAnchor="middle" fontSize={9} fontWeight={900} fill="white">★</text><text x={p.x} y={p.y - nodeR - 22} textAnchor="middle" fontSize={6} fontWeight={900} fill="#10b981" style={{fontFamily:"ui-monospace,monospace"}}>OFFICIAL</text></g>}
                      {isActive && <circle cx={p.x} cy={p.y} r={nodeR + 20} fill="white" opacity={0.09} />}
                      {panicId && (baseId===panicId || item.id===panicId) && (
                        <>
                          <circle cx={p.x} cy={p.y} r={nodeR+14} fill="none" stroke="#ef4444" strokeWidth={3.2} opacity={0.95} style={{ animation:"panicDoublePulse 1.1s ease-out infinite" }} />
                          <circle cx={p.x} cy={p.y} r={nodeR+24} fill="none" stroke="#f59e0b" strokeWidth={2.4} opacity={0.85} style={{ animation:"panicDoublePulse 1.1s ease-out infinite 0.22s" }} />
                          <circle cx={p.x} cy={p.y} r={nodeR+6} fill="none" stroke="#ef4444" strokeWidth={2} opacity={0.7} style={{ animation:"panicGlow 0.9s ease-in-out infinite" }} />
                          <circle cx={p.x} cy={p.y} r={nodeR+2} fill="none" stroke="rgba(255,255,255,0.0)" strokeWidth={8} className="quantum-shimmer-overlay" opacity={0.55} style={{ filter: "drop-shadow(0 0 8px rgba(239,68,68,0.45))" } as any} />
                        </>
                      )}
                      {((deepPulseId && (deepPulseId===baseId || deepPulseId===item.id)) || (searchPulseId && (searchPulseId===baseId || searchPulseId===item.id))) && (
                        <>
                          <circle cx={p.x} cy={p.y} r={nodeR+10} fill="none" stroke="#8b5cf6" strokeWidth={3} opacity={0.9} style={{ animation:"pulseRing 1.1s ease-out infinite" }} />
                          <circle cx={p.x} cy={p.y} r={nodeR+18} fill="none" stroke="#a78bfa" strokeWidth={2} opacity={0.6} style={{ animation:"pulseRing 1.1s ease-out infinite 0.18s" }} />
                        </>
                      )}
                      <circle cx={p.x} cy={p.y + 6} r={nodeR} fill="black" opacity={0.34} />
                      <g
                        className={`node-3d ${candySpringId===baseId ? "candy-spring" : ""}`}
                        style={{
                          transformOrigin: `${p.x}px ${p.y}px`,
                          transform: (st as any).key === "almost" ? `translateZ(14px) scale(${scale})` : "translateZ(10px)",
                          animation: candySpringId===baseId ? undefined : (isNew ? "scaleIn 720ms cubic-bezier(.2,.8,.3,1.2)" : anim || undefined),
                          filter: "drop-shadow(0 12px 18px rgba(0,0,0,0.45))",
                        } as any}
                      >
                        <circle cx={p.x} cy={p.y} r={nodeR} fill={isPersonal ? "#e7e5e4" : "white"} stroke={outline} strokeWidth={isPersonal ? 3 : isDemo ? 3 : (sev==="cancelled" ? 4.2 : sev==="shift" ? 3.4 : 2.8) + (isActive ? 0.8 : 0)} strokeDasharray={isDemo ? "8 6" : undefined} filter="url(#nodeGlow)" opacity={isPersonal ? 0.72 : isDemo ? 0.96 : 1} className={(st as any).key==="fused" ? "fused-purple-glow" : undefined} style={{ transform: isActive ? "translateZ(18px)" : "translateZ(12px)", ...( (st as any).key==="fused" ? { animation: "fusedGlow 2.2s ease-in-out infinite" } as any : {}) } as any} />
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
                          <rect x={barX} y={barY} width={fillW} height={apQ>=7 && quorumThreshold===8 ? 8 : 6} rx={3} fill={pctQ>=100 ? "#10b981" : "#10b981"} opacity={0.95} style={apQ>=7 && quorumThreshold===8 ? { filter:"drop-shadow(0 0 6px rgba(16,185,129,0.7))" } as any : undefined} />
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
                  className={`text-left rounded-[18px] border p-4 backdrop-blur-[16px] transition ${active ? "border-white bg-white text-black shadow" : verified ? "border-emerald-400/25 bg-emerald-500/[0.08] backdrop-blur-[16px] text-white" : "border-white/[0.06] bg-white/[0.03] text-white hover:bg-white/[0.05]"}`}>
                  <div className="flex items-center gap-2">
                    <span className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-black ${verified? "bg-emerald-500 text-white" : isPersonal? "bg-zinc-600 text-white" : isDemo? "bg-[#8b5cf6] text-white border-2 border-dashed border-white/60" : "bg-amber-500 text-white"}`}>{verified?"✓": isPersonal?"◐": isDemo?"✦":"●"}</span>
                    <span className={`text-[13px] font-bold leading-tight ${active?"text-black":"text-white"}`}>{title}</span>
                    {!isPersonal && !isDemo && ev?.severity && (
                      <span className={`ml-1 rounded-full px-2 py-0.5 text-[10px] font-black border ${String(ev.severity)==="move" ? "bg-blue-500 text-white border-blue-400" : String(ev.severity)==="shift" ? "bg-yellow-400 text-black border-yellow-300" : "bg-red-500 text-white border-red-400"}`} style={String(ev.severity)==="cancelled" ? { animation:"sevPulse 1.1s ease-in-out infinite"} as any : undefined}>{String(ev.severity)}</span>
                    )}
                    <span className={`ml-auto rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${verified?"bg-emerald-500 text-white":"bg-white/10 text-slate-300"}`}>{verified?"green":"advisory"}</span>
                  </div>
                  <p className={`mt-1 font-mono text-[11px] ${active?"text-slate-600":"text-slate-400"}`}>{venue} · {fmtDate(date)} {fmtTime(time)} · {isPersonal?(item as any).p.scope_type: isDemo?"demo": ev.scope_type}{!isPersonal && !isDemo && ev.scope_value ? ` · ${ev.scope_value}`:""} {!isPersonal && !isDemo && ev?.prev_venue ? ` · ${String(ev.prev_venue)}→${String(ev.venue)} diff` : ""}</p>
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

        {/* FAB — Voice gossip primary (hold 1.5s → 3s whisper STT) + fallback create */}
        <VoiceGossipFab
          anonId={fabGhostId}
          genAnonId={genAnonId}
          onCreate={async ({ title, venue, event_date, event_time, severity }) => {
            setFabTitle(title); setFabVenue(venue); setFabDate(event_date); setFabTime(event_time); setFabSeverity(severity as any);
            // auto-create like fab
            try {
              setFabBusy(true);
              const ghostId = fabGhost ? (fabGhostId || genAnonId()) : null;
              const body: any = { title, venue, event_date, event_time, scope_type: "whole_school", scope_value: null, status: "pending", authority_points: 0, required_points: 5, severity };
              // anon rep credits to real id if ghost?
              const raw = localStorage.getItem("physi_profile");
              let uid: string | null = null;
              try { uid = raw ? JSON.parse(raw)?.id ?? null : null; } catch {}
              if (uid) body.created_by = uid;
              // whisper anon marker
              if (ghostId) body.anon_ghost_id = ghostId;
              const r = await fetch("/api/timetable", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
              const j = await r.json().catch(() => ({}));
              if (!r.ok || j.ok === false) throw new Error(j?.error || "create failed");
              setFabFlash(true); setTimeout(()=>setFabFlash(false),600); setToast(`whisper “${title}” ✓ · ${severity} · anon`);
              playPop(); vibrate(20);
              fetchFeed();
            } catch (e: any) { setToast(e?.message || "whisper failed"); } finally { setFabBusy(false); }
          }}
        />
        {/* Secondary FAB — tap to open classic create (kept for non-voice, still decluttered) */}
        <div className="fixed bottom-[88px] right-20 z-40 flex flex-col items-end gap-2 sm:bottom-[92px] sm:right-20">
          <button onClick={()=>setFabOpen(true)} aria-label="Create event" title="Create event (tap) · hold right FAB for voice whisper" className={`flex h-[46px] w-[46px] items-center justify-center rounded-full border border-white/20 backdrop-blur text-lg font-bold shadow-[0_4px_16px_rgba(0,0,0,0.3)] transition ${fabFlash ? "fab-gold-flash bg-amber-400 text-black border-amber-300" : "bg-white/[0.08] text-white hover:bg-white hover:text-black"}`}>
            +
          </button>
        </div>
        {/* FAB create modal - POST /api/timetable */}
        {fabOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
            <form onSubmit={handleFabCreate} className="w-full max-w-[420px] rounded-[20px] border border-white/10 bg-[#0b0f1e] p-5 shadow-2xl">
              <div className="flex items-center justify-between">
                <h3 className="text-[16px] font-bold text-white">Create event</h3>
                <button type="button" onClick={()=>setFabOpen(false)} className="rounded-full bg-white/10 px-3 py-1 text-sm text-white">✕</button>
              </div>
              <p className="mt-1 text-[12px] text-slate-400">title / venue / date / time + severity → POST /api/timetable · Rep maps to real ID</p>
              <div className="mt-3">
                <p className="font-mono text-[10px] font-bold tracking-wide text-slate-400">SEVERITY <span className="text-red-300">* required</span> — move blue · shift yellow · cancelled red · node size/color/width + pulse</p>
                <div className="mt-1.5 flex gap-2">
                  {(["move","shift","cancelled"] as const).map(s=> {
                    const active = fabSeverity===s;
                    const bg = s==="move" ? "bg-blue-500" : s==="shift" ? "bg-yellow-400" : "bg-red-500";
                    const txt = s==="shift" ? "text-black" : "text-white";
                    return (
                      <button key={s} type="button" onClick={()=> setFabSeverity(s)} className={`flex-1 rounded-full px-3 py-2 text-[12px] font-black border transition ${active ? `${bg} ${txt} border-white ring-2 ring-white/60` : "bg-white/10 text-slate-300 border-white/10 hover:bg-white/15"}`}>
                        <span className={`mr-1 inline-block h-2.5 w-2.5 rounded-full ${s==="move"?"bg-blue-400": s==="shift"?"bg-yellow-300":"bg-red-400"} ${active ? "ring-1 ring-white" : ""}`} /> {s}
                      </button>
                    );
                  })}
                </div>
                {!fabSeverity && <p className="mt-1 font-mono text-[10px] text-amber-300">pick severity to enable Create — node will size/color by severity, cancelled pulses</p>}
              </div>
              <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[12px] font-bold text-white flex items-center gap-1.5">👻 Post as ghost <span className="font-mono text-[10px] font-normal text-slate-400">· anon_XXXX · Rep → real ID</span></p>
                  <p className="font-mono text-[11px] text-slate-500">{fabGhost ? fabGhostId + " · ghost avatar shown, Rep credited to you" : "toggle on to hide handle, show ghost avatar"}</p>
                </div>
                <button type="button" onClick={()=> { const n=!fabGhost; setFabGhost(n); if(n && !fabGhostId) setFabGhostId(genAnonId()); }} className={`relative h-7 w-12 shrink-0 rounded-full border transition ${fabGhost ? "bg-violet-500 border-violet-400" : "bg-white/10 border-white/15"}`}><span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${fabGhost ? "right-0.5" : "left-0.5"}`} /></button>
              </div>
              {fabGhost && <div className="mt-2 flex items-center gap-2 rounded-full border border-violet-400/20 bg-violet-500/10 px-3 py-2"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#8b5cf6] text-[11px]">👻</span><span className="font-mono text-[11px] font-bold text-violet-200">{fabGhostId}</span><span className="font-mono text-[10px] text-violet-300/70">· ghost avatar · rep → you</span><button type="button" onClick={()=> setFabGhostId(genAnonId())} className="ml-auto rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-black">regen</button></div>}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {[
                  { label:"Class moved", title:"Class moved — LT changed", venue:"LT2 → LT5", time:"08:00", severity:"move" as Severity },
                  { label:"Exam shift", title:"Exam shift — ", venue:"Exam Hall", time:"09:00", severity:"shift" as Severity },
                  { label:"Venue change", title:"Venue change — ", venue:"LT1 → LT3", time:"10:00", severity:"move" as Severity },
                  { label:"Cancelled", title:"Cancelled — ", venue:"Cancelled", time:"08:00", severity:"cancelled" as Severity },
                ].map(tt=> (
                  <button key={tt.label} type="button" onClick={()=>{ setFabTitle(tt.title); setFabVenue(tt.venue); setFabTime(tt.time); setFabSeverity(tt.severity); setFabDate(new Date().toISOString().slice(0,10)); }} className="rounded-full border border-violet-400/20 bg-violet-500/10 px-2.5 py-1 text-[11px] font-bold text-violet-200 hover:bg-violet-500 hover:text-white transition">{tt.label} · {tt.severity}</button>
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
                <button type="submit" disabled={fabBusy || !fabSeverity} className={`flex-1 rounded-full py-2.5 text-sm font-black text-white disabled:opacity-40 ${!fabSeverity ? "bg-white/20 cursor-not-allowed" : "bg-[#8b5cf6] hover:bg-[#7c3aed]"}`}>{fabBusy ? "…" : `Create · ${fabSeverity || "pick severity"}`}</button>
                <button type="button" onClick={()=>setFabOpen(false)} className="rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white">Cancel</button>
              </div>
            </form>
          </div>
        )}
        {/* bottom sheet */}
        <div className={`absolute inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-3 sm:px-6 sm:pb-4 transition-transform duration-300 ${sheetOpen ? "translate-y-0" : "translate-y-[calc(100%-44px)]"}`}>
          <div className="liquid-glass glass-bevel w-full max-w-[680px] overflow-hidden rounded-[24px] border border-white/[0.14] shadow-[0_16px_64px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.18),0_0_24px_rgba(139,92,246,0.18)]" style={{ background: "rgba(255,255,255,0.08)", backdropFilter: "blur(16px) saturate(1.22)", WebkitBackdropFilter: "blur(16px) saturate(1.22)" }}>
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
                            <h2 className="text-[17px] font-bold leading-tight text-white flex items-center gap-2">{ev.title}
                              {(() => { const sev=sevOf(ev); return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black border ${sev==="move" ? "bg-blue-500 text-white border-blue-400" : sev==="shift" ? "bg-yellow-400 text-black border-yellow-300" : "bg-red-500 text-white border-red-400"}`} style={sev==="cancelled" ? { animation:"sevPulse 1.1s ease-in-out infinite"} as any : undefined}>{sev}</span>; })()}
                            </h2>
                            <p className="font-mono text-[11px] tracking-wide text-slate-500">{ev.venue} · {fmtDate(ev.event_date)} {fmtTime(ev.event_time)} · {ev.scope_type}{ev.scope_value ? ` · ${ev.scope_value}` : ""} · <span style={{color:SEVERITY_COLOR[sevOf(ev)]}}>{sevOf(ev)}</span></p>
                            {/* Timeline diff vs previous version (LT2->LT5) */}
                            {(timelineHist?.diff || (ev as any).prev_venue) && (
                              <div className="mt-1.5 flex flex-wrap gap-1.5">
                                <span className="inline-flex items-center gap-1 rounded-full border border-violet-400/20 bg-violet-500/10 px-2.5 py-1 font-mono text-[10px] font-bold text-violet-200">
                                  {timelineLoading ? "loading diff…" : timelineHist?.diff ? `venue ${timelineHist.diff.venue}` : (ev as any).prev_venue ? `${String((ev as any).prev_venue)}→${String(ev.venue)}` : ""}
                                  {timelineHist?.diff?.time && timelineHist.diff.time.includes("→") && timelineHist.diff.time!=="→" ? ` · time ${timelineHist.diff.time}` : ""}
                                </span>
                                {timelineHist?.history && timelineHist.history.length>0 && <span className="rounded-full bg-white/10 px-2 py-1 font-mono text-[10px] text-slate-400">{timelineHist.history.length} edits in history</span>}
                              </div>
                            )}
                            {/* Time tape — scrollable LT2→LT5 diff chips severity blue/yellow/red + scrub rewind + quorum 7/8 + VOD on loser 0.35 */}
                            {timelineHist && (timelineHist.history?.length>0 || timelineHist.diff) && (
                              <div className="mt-2 overflow-hidden rounded-xl border border-white/10 bg-black/50">
                                <div className="flex items-center justify-between bg-white/[0.04] px-3 py-2">
                                  <span className="font-mono text-[10px] font-bold tracking-wide text-white">⏳ Time tape · scrub rewind per version</span>
                                  <span className="font-mono text-[10px] text-slate-500">{timelineHist.history?.length ? timelineHist.history.length+1 : 1} versions · tapeIdx {tapeIdx}</span>
                                </div>
                                {/* scrollable chips */}
                                <div className="flex gap-1.5 overflow-x-auto px-2 py-2 scrollbar-none" style={{scrollbarWidth:"none"}}>
                                  {(() => {
                                    const versions:any[] = timelineHist.history?.length ? [...timelineHist.history].reverse() : [];
                                    // build tape versions: oldest -> current
                                    const curSev = (ev as any).severity || "move";
                                    const curChip = { prev_venue: (ev as any).prev_venue || ev.venue, new_venue: ev.venue, prev_event_time: (ev as any).prev_event_time || ev.event_time, new_event_time: ev.event_time, severity: curSev, label: `LT2→LT5` };
                                    const tapes = versions.length ? versions.map((h:any)=> ({ prev_venue:h.prev_venue, new_venue:h.new_venue, prev_event_time:h.prev_event_time, new_event_time:h.new_event_time, severity: curSev, changed_at:h.changed_at })) : [curChip];
                                    // if no history but diff exists, show diff chip
                                    if(!versions.length && timelineHist.diff) tapes[0]= { prev_venue: String((ev as any).prev_venue||"LT2"), new_venue: ev.venue, prev_event_time: String((ev as any).prev_event_time||"08:00"), new_event_time: ev.event_time, severity: curSev, changed_at: null };
                                    return tapes.slice(0,12).map((t:any,ix:number)=>{
                                      const sev:string = String(t.severity||curSev);
                                      const bg = sev==="cancelled"? "bg-red-500 border-red-400 text-white" : sev==="shift"? "bg-yellow-400 border-yellow-300 text-black" : "bg-blue-500 border-blue-400 text-white";
                                      const active = tapeIdx===ix;
                                      return <button key={ix} onClick={()=> setTapeIdx(ix)} className={`tape-chip shrink-0 rounded-full border px-3 py-1.5 font-mono text-[10px] font-black ${active ? "tape-chip-active shadow" : bg}`}>{String(t.prev_venue||"—").slice(0,6)}→{String(t.new_venue).slice(0,6)} · {String(t.prev_event_time||"—").slice(0,5)}→{String(t.new_event_time).slice(0,5)} <span className={`ml-1 rounded-full px-1 py-0.5 text-[8px] ${sev==="shift"?"bg-black/10":"bg-white/20"}`}>{sev}</span></button>;
                                    });
                                  })()}
                                </div>
                                {/* scrub rewind per version with quorum bar 7/8 */}
                                <div className="px-3 pb-2">
                                  <input type="range" min={0} max={Math.max(0,(timelineHist.history?.length||1)-1)} value={Math.min(tapeIdx, Math.max(0,(timelineHist.history?.length||1)-1))} onChange={e=> setTapeIdx(parseInt(e.target.value,10)||0)} className="tape-scrub w-full accent-violet-500" />
                                  <div className="mt-1 flex items-center gap-2">
                                    <div className="flex-1 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-emerald-400 transition-all" style={{ width: `${Math.min(100,Math.round((Number(ev.authority_points||0)/8)*100))}%`, height: (Number(ev.authority_points||0)>=7 ? 8 : 6) as any }} /></div>
                                    <span className="font-mono text-[10px] font-bold text-emerald-300">{Number(ev.authority_points||0)}/8 quorum{Number(ev.authority_points||0)>=7?" · thickens":""}</span>
                                  </div>
                                  <p className="mt-1 font-mono text-[9px] text-slate-500">scrub rewind: tape version {tapeIdx+1} · quorum bar 7/8 thickens</p>
                                </div>
                                {/* history list with VOD on loser 0.35 */}
                                <div className="max-h-[96px] overflow-auto divide-y divide-white/5">
                                  {timelineHist.history?.length ? timelineHist.history.slice(0,8).map((h:any,ix:number)=> (
                                    <div key={h.id||ix} className="flex items-center gap-2 px-3 py-1.5 font-mono text-[10px] text-slate-400">
                                      <span className="text-violet-300">{String(h.prev_venue||"—")}→{String(h.new_venue)}</span>
                                      <span className="text-slate-500">·</span>
                                      <span>{String(h.prev_event_time||"—").slice(0,5)}→{String(h.new_event_time).slice(0,5)}</span>
                                      <span className="ml-auto text-[9px] text-slate-600">{String(h.changed_at||"").slice(0,16).replace("T"," ")}</span>
                                    </div>
                                  )) : (
                                    <div className="px-3 py-2 font-mono text-[10px] text-slate-500">LT2→LT5 diff · severity {String((ev as any).severity||"move")} · blue/yellow/red chips above · scrub to rewind</div>
                                  )}
                                </div>
                                {/* VOD on loser 0.35 replays voters */}
                                <button onClick={async()=>{ try{ const bid=String(ev.id).split("__tile")[0]; const r=await fetch(`/api/verify?event_id=${encodeURIComponent(bid)}`,{cache:"no-store"}); const j=await r.json().catch(()=>({} as any)); const voters=j.verifications??j.rows??[]; setGhostModal({open:true, ev, voters, forkIx:0}); setGhostConfetti(true); setTimeout(()=>setGhostConfetti(false),2800); vibrate(20); }catch{} }} className="flex w-full items-center justify-center gap-1.5 border-t border-white/10 bg-white/[0.04] px-3 py-2 font-mono text-[10px] font-bold text-violet-200 hover:bg-white hover:text-black transition" style={{opacity: 0.92}}><span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-[10px]">▶</span> VOD · tap loser 0.35 replays voters · {Number(ev.authority_points||0)>=8?"winner":"loser"} tape</button>
                              </div>
                            )}
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
                                <span key={u.id} title={showHandles ? u.handle : `#${anonDot(u.handle)}`} className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#080c18] text-[9px] font-black text-white shadow" style={{ background: showHandles ? u.color : GHOST_DOT_BG, borderColor: showHandles ? undefined : "rgba(255,255,255,0.35)" } as any}>
                                  {showHandles ? String(u.handle).slice(0,2).toUpperCase() : anonDot(u.handle).slice(0,2)}
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
                            {showHandles ? facepile.yes.slice(0,3).map(u=> `@${u.handle}`).join(" · ") : facepile.yes.slice(0,3).map(u=> `#${anonDot(u.handle)}`).join(" · ")}{facepile.yes.length>3 ? " …" : ""} <span className="ml-1 rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] text-slate-400">anon {GHOST_DOT_BG}</span>
                          </span>
                        )}
                        {!facepileLoading && (!facepile || (facepile.yesCount===0 && facepile.noCount===0)) && (
                          <span className="font-mono text-[10px] text-slate-500">no votes yet — be first</span>
                        )}
                      </div>
                      <div className="mt-4">
                        <p className="font-mono text-[11px] uppercase tracking-wide text-slate-500">Were you there? <span className="normal-case tracking-normal text-slate-600">· swipe → Yes · ← No · ↑ Skip</span></p>
                        {/* Squad + Lecturer badges */}
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {squad && isSquadFormed(squad as any) && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2.5 py-1 font-mono text-[10px] font-black text-emerald-200">👥 squad 1.5x on own gists ✓</span>
                          )}
                          {lecturer?.pinVerified && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-gradient-to-r from-emerald-500 to-emerald-600 px-2.5 py-1 font-mono text-[10px] font-black text-white">🎓 emerald 8/8 bypass ✓</span>
                          )}
                          {lecturer?.verified && !lecturer?.pinVerified && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-500/15 px-2.5 py-1 font-mono text-[10px] font-bold text-amber-200">🎓 lecturer verified · add emerald pin for 8/8</span>
                          )}
                          {!squad?.members?.length && (
                            <button onClick={()=> setSquadOpen(true)} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-[10px] font-bold text-slate-400 hover:bg-white hover:text-black">+ invite 3 to form squad 1.5x</button>
                          )}
                          {!lecturer?.verified && (
                            <button onClick={()=> setLectOpen(true)} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-[10px] font-bold text-slate-400 hover:bg-white hover:text-black">+ lecturer verify .edu → emerald 8/8</button>
                          )}
                        </div>
                        {presence && (
                          <div className={`mt-3 flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-bold ${presence.isWitness ? "witness-gold border-amber-400/40 bg-gradient-to-r from-amber-400 to-yellow-300 text-black fused-purple-glow" : "border-white/15 bg-white/10 text-slate-300"}`} style={presence.isWitness ? { animation: "witnessPulse 1.6s ease-in-out infinite", transformOrigin: "center" } as any : undefined}>
                            <span className={`h-2 w-2 rounded-full ${presence.isWitness ? "bg-amber-600 animate-pulse" : "bg-slate-400"}`} />
                            {presence.isWitness ? "Witness +1.0 gold" : "Remote +0.3 grey"} {presence.dist!==null ? `· ${Math.round(presence.dist)}m` : ""} {presenceBusy ? "· locating" : ""}
                            <span className="ml-1 font-mono text-[10px]">score {presenceScore.toFixed(1)}</span>
                          </div>
                        )}
                        {presenceBusy && !presence && <p className="mt-2 font-mono text-[11px] text-amber-200">checking presence — requesting location…</p>}
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
                        {verified && (
                          <button onClick={()=>{ try{ downloadICS({ id: ev.id, title: ev.title, venue: ev.venue, event_date: ev.event_date, event_time: ev.event_time }); setToast("calendar .ics downloaded — WAT time + venue"); }catch{ setToast("calendar failed"); } }} className="rounded-full border border-emerald-400/30 bg-emerald-500 px-4 py-2 text-[13px] font-bold text-white hover:bg-emerald-600 transition">📅 Add to Calendar</button>
                        )}
                      </div>
                      {verified && (
                        <p className="mt-2 font-mono text-[10px] text-emerald-300/80">Verified ✓ — add to calendar includes WAT (Africa/Lagos), venue {ev.venue}, and link roadmap?event={ev.id.slice(0,8)}</p>
                      )}
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
              {/* Road chat 24h ephemeral */}
              <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                <p className="font-mono text-[11px] font-bold tracking-wide text-white">Road chat · 24h ephemeral</p>
                <p className="font-mono text-[10px] text-slate-500">localStorage · shows zara_11: msgs</p>
                <div className="mt-2 max-h-[120px] overflow-auto space-y-1 rounded-xl bg-black/30 p-2">
                  {chatMsgs.filter(m=> Date.now()-m.ts < 24*3600*1000).slice(-20).map((m,i)=> (
                    <p key={i} className="font-mono text-[11px] leading-4"><span className="font-bold" style={{ color: showHandles ? "#a78bfa" : GHOST_DOT_BG }}>{showHandles ? m.user : `#${anonDot(m.user)}`}:</span> <span className="text-slate-200">{m.text}</span></p>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <textarea value={chatDraft} onChange={e=> setChatDraft(e.target.value)} placeholder="say something…" rows={1} className="flex-1 resize-none rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-[12px] text-white placeholder:text-slate-500 outline-none focus:border-violet-500" />
                  <button onClick={sendChat} className="rounded-full bg-white px-4 py-2 text-[12px] font-black text-black hover:bg-slate-100">Send</button>
                </div>
              </div>
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
        {/* Squad modal — invite 3 friends forms squad, 1.5x on own gists */}
        {squadOpen && (
          <div className="fixed inset-0 z-[68] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm" onClick={()=> setSquadOpen(false)}>
            <div onClick={e=>e.stopPropagation()} className="w-full max-w-[400px] rounded-[22px] border border-white/10 bg-[#0b0f1e] p-5 shadow-2xl">
              <div className="flex items-center justify-between">
                <h3 className="text-[16px] font-black text-white">👥 Squad · sup-quorum 1.5x</h3>
                <button onClick={()=> setSquadOpen(false)} className="rounded-full bg-white/10 px-3 py-1 text-xs text-white">✕</button>
              </div>
              <p className="mt-1 font-mono text-[11px] text-slate-400">Invite 3 friends — squad Yes counts <b className="text-emerald-300">1.5x on own gists</b>. Stored localStorage <span className="font-mono text-violet-300">phys_squad</span>.</p>
              {squad && isSquadFormed(squad as any) && (
                <div className="mt-3 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-center">
                  <p className="text-[13px] font-black text-emerald-200">Squad formed ✓ — {squad.members.join(", ")}</p>
                  <p className="font-mono text-[11px] text-emerald-300">Your YES on squad gists counts 1.5x</p>
                </div>
              )}
              <div className="mt-3 grid gap-2">
                {[0,1,2].map(i=> (
                  <div key={i} className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-[11px] font-black text-white">{i+1}</span>
                    <input value={squadDraft[i]||""} onChange={e=>{ const a=[...squadDraft]; a[i]=e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,"").slice(0,16); setSquadDraft(a); }} placeholder={`friend ${i+1} handle e.g. zara_11`} className="flex-1 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-[13px] text-white placeholder:text-slate-500 outline-none focus:border-emerald-500" />
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <button onClick={()=>{
                  const cleaned = squadDraft.map(s=> String(s).trim().toLowerCase().replace(/[^a-z0-9_]/g,"")).filter(Boolean);
                  if(cleaned.length<3){ setToast("invite 3 friends — need 3 handles"); return; }
                  const s = saveSquad(cleaned, youHandle);
                  setSquadState(s); setToast("Squad formed ✓ 1.5x on own gists");
                }} className="flex-1 rounded-full bg-emerald-500 py-2.5 text-[13px] font-black text-white hover:bg-emerald-600">Form squad 3/3 → 1.5x</button>
                <button onClick={()=>{ clearSquad(); setSquadState(null); setSquadDraft(["","",""]); setToast("squad cleared"); }} className="rounded-full border border-white/15 bg-white/5 px-4 py-2.5 text-[13px] font-semibold text-white">Clear</button>
              </div>
              <p className="mt-2 text-center font-mono text-[10px] text-slate-500">phys_squad in localStorage — {squad?.members?.length||0}/3 · owner {youHandle||"anon"}</p>
              <div className="mt-3 flex gap-2">
                <button onClick={async()=>{ const link = typeof window!=="undefined" ? `${window.location.origin}/app/roadmap?invite=${encodeURIComponent(youHandle||"physicoin")}&squad=1` : ""; try{ await navigator.clipboard.writeText(link); setToast("squad invite link copied"); }catch{ setToast(link); } }} className="flex-1 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] font-bold text-violet-200">Copy squad invite link</button>
              </div>
            </div>
          </div>
        )}
        {/* Lecturer oracle modal — email domain + emerald pin 8/8 bypass */}
        {lectOpen && (
          <div className="fixed inset-0 z-[68] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm" onClick={()=> setLectOpen(false)}>
            <div onClick={e=>e.stopPropagation()} className="w-full max-w-[400px] rounded-[22px] border border-white/10 bg-[#0b0f1e] p-5 shadow-2xl">
              <div className="flex items-center justify-between">
                <h3 className="text-[16px] font-black text-white">🎓 Lecturer oracle · emerald 8/8</h3>
                <button onClick={()=> setLectOpen(false)} className="rounded-full bg-white/10 px-3 py-1 text-xs text-white">✕</button>
              </div>
              <p className="mt-1 font-mono text-[11px] text-slate-400">Verify via <b className="text-amber-200">university email domain</b> (.edu / .edu.ng / .ac.ng). Official pin gives <b className="text-emerald-300">emerald bypass 8/8</b> badge.</p>
              {lecturer?.verified && (
                <div className={`mt-3 rounded-xl border px-3 py-2 text-center ${lecturer.pinVerified ? "border-emerald-400/40 bg-emerald-500 text-white" : "border-amber-400/30 bg-amber-500/10 text-amber-200"}`}>
                  <p className="text-[13px] font-black">{lecturer.pinVerified ? "Emerald ✓ — 8/8 bypass active" : `Lecturer verified — ${lecturer.email}`}</p>
                  {lecturer.pinVerified && <p className="font-mono text-[11px] opacity-90">Official pin emerald — your YES = 8/8 instant verified + badge</p>}
                </div>
              )}
              <div className="mt-3 grid gap-2">
                <label className="font-mono text-[10px] font-bold tracking-wide text-slate-400">LECTURER EMAIL (.edu)</label>
                <div className="flex gap-2">
                  <input value={lectEmail} onChange={e=> setLectEmail(e.target.value)} placeholder="name@futo.edu.ng" className="flex-1 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-[13px] text-white placeholder:text-slate-500 outline-none focus:border-amber-500" />
                  <button onClick={()=>{
                    const r = verifyLecturerEmail(lectEmail);
                    if(!r.ok){ setToast(r.reason||"invalid email"); return; }
                    const l = getLecturer(); setLecturerState(l as any); setToast("lecturer email verified ✓");
                  }} className="rounded-full bg-amber-500 px-4 py-2 text-[12px] font-black text-black hover:bg-amber-600">Verify email</button>
                </div>
                <label className="mt-2 font-mono text-[10px] font-bold tracking-wide text-slate-400">OFFICIAL PIN (emerald)</label>
                <div className="flex gap-2">
                  <input value={lectPin} onChange={e=> setLectPin(e.target.value)} placeholder="EMERALD-8" className="flex-1 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-[13px] text-white placeholder:text-slate-500 outline-none focus:border-emerald-500" />
                  <button onClick={()=>{
                    const r = verifyLecturerPin(lectPin);
                    if(!r.ok){ setToast(r.reason||"invalid pin"); return; }
                    const l = getLecturer(); setLecturerState(l as any); setToast("emerald pin ✓ — 8/8 bypass active");
                  }} className="rounded-full bg-emerald-500 px-4 py-2 text-[12px] font-black text-white hover:bg-emerald-600">Verify pin</button>
                </div>
                <p className="font-mono text-[10px] text-slate-500">Try official pin: <span className="text-emerald-300 font-bold">EMERALD-8</span> · requires verified email first · badge emerald appears on votes</p>
              </div>
              <div className="mt-3 flex gap-2">
                <button onClick={()=>{ try{ localStorage.removeItem(LECTURER_KEY); setLecturerState(null); setLectEmail(""); setLectPin(""); setToast("lecturer cleared"); }catch{} }} className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-[12px] font-semibold text-white">Clear</button>
                <span className="flex-1 text-center font-mono text-[10px] text-slate-500 self-center">localStorage phys_lecturer · domain check</span>
              </div>
            </div>
          </div>
        )}
        {bazaarOpen && (
          <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm" onClick={()=> setBazaarOpen(false)}>
            <div onClick={e=>e.stopPropagation()} className="w-full max-w-[360px] rounded-[22px] border border-white/10 bg-[#0b0f1e] p-5 shadow-2xl">
              <div className="flex items-center justify-between"><h3 className="text-[15px] font-black text-white">Ghost Bazaar</h3><button onClick={()=> setBazaarOpen(false)} className="rounded-full bg-white/10 px-3 py-1 text-xs text-white">✕</button></div>
              <p className="mt-1 font-mono text-[11px] text-slate-400">Spend Rep · localStorage deduction</p>
              <div className="mt-3 grid gap-2">
                <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                  <div><p className="text-[13px] font-bold text-white">📌 Pin 24h</p><p className="font-mono text-[11px] text-slate-400">3 Rep · pinned 24h</p></div>
                  <button onClick={buyPin} className="rounded-full bg-emerald-500 px-4 py-2 text-[12px] font-black text-white hover:bg-emerald-600">Buy 3 Rep</button>
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                  <div><p className="text-[13px] font-bold text-white">🚀 Blast</p><p className="font-mono text-[11px] text-slate-400">5 Rep · blast to all</p></div>
                  <button onClick={buyBlast} className="rounded-full bg-violet-500 px-4 py-2 text-[12px] font-black text-white hover:bg-violet-600">Buy 5 Rep</button>
                </div>
              </div>
              <p className="mt-2 text-center font-mono text-[10px] text-slate-500">Balance: {myRep.toFixed(1)} Rep</p>
            </div>
          </div>
        )}
        {/* Ghost replay modal: past fork loser tappable */}
        {ghostModal?.open && ghostModal.ev && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm" onClick={()=> setGhostModal(null)}>
            <div onClick={e=>e.stopPropagation()} className="w-full max-w-[420px] rounded-[22px] border border-white/10 bg-[#0b0f1e] p-5 shadow-2xl relative overflow-hidden">
              {ghostConfetti && (
                <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
                  {Array.from({length:18}).map((_,i)=>{
                    const left=(i*6.2)%100; const delay=(Math.random()*0.4).toFixed(2); const dur=(1.6+Math.random()*1).toFixed(2);
                    const bg=["#8b5cf6","#10b981","#f59e0b","#ec4899","#06b6d4"][i%5];
                    return <div key={i} className="absolute top-0 h-3 w-2 rounded-sm" style={{ left:left+"%", background:bg, animation:`confettiFall ${dur}s ${delay}s ease-in forwards` }} />;
                  })}
                </div>
              )}
              <div className="flex items-center justify-between">
                <h3 className="text-[15px] font-black text-white">Ghost replay · fork loser</h3>
                <button onClick={()=> setGhostModal(null)} className="rounded-full bg-white/10 px-3 py-1 text-xs text-white">✕</button>
              </div>
              <p className="mt-1 font-mono text-[11px] text-slate-400">opacity 0.35 · tap to replay confetti · past node</p>
              <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.04] p-3">
                <p className="text-[14px] font-bold text-white">{ghostModal.ev.title}</p>
                <p className="font-mono text-[11px] text-slate-400">{ghostModal.ev.venue} · {fmtDate(ghostModal.ev.event_date)} {fmtTime(ghostModal.ev.event_time)} WAT</p>
                <p className="mt-1 font-mono text-[10px] text-slate-500">Fork outcome: {Number(ghostModal.ev.authority_points||0) >= FORK_THRESHOLD ? "WIN ✓" : "LOST — 0.35 dim"} · {ghostModal.ev.authority_points}/{FORK_THRESHOLD} · threshold {FORK_THRESHOLD}</p>
                <p className="mt-1 font-mono text-[10px] text-amber-200">Timestamp WAT: {(() => { const ts=eventInstant(ghostModal.ev!.event_date, ghostModal.ev!.event_time); const w=formatWAT(ts); return `${w.wday} ${w.datePart} ${w.timePart} WAT`; })()}</p>
              </div>
              <div className="mt-3">
                <p className="font-mono text-[11px] font-bold text-white">Who voted</p>
                {ghostModal.voters && ghostModal.voters.length>0 ? (
                  <ul className="mt-1 max-h-[140px] overflow-auto space-y-1">
                    {ghostModal.voters.slice(0,12).map((v:any,i:number)=>(
                      <li key={i} className="flex items-center justify-between rounded-full bg-white/5 px-3 py-1.5 font-mono text-[11px] text-slate-200">
                        <span>{String(v.verifier_id||v.handle||"anon").slice(0,12)} · {String(v.vote||"YES").toUpperCase()}</span>
                        <span className="text-[10px] text-slate-500">{v.created_at ? new Date(v.created_at).toLocaleTimeString() : ""}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="mt-1 font-mono text-[11px] text-slate-500">No voters yet — be first to decide fork.</p>}
              </div>
              <div className="mt-4 flex gap-2">
                <button onClick={()=>{ setGhostConfetti(true); setTimeout(()=> setGhostConfetti(false), 2800); setShowConfetti(true); setTimeout(()=> setShowConfetti(false), 2800); vibrate(20); }} className="flex-1 rounded-full bg-gradient-to-r from-amber-400 to-emerald-400 py-2.5 text-[13px] font-black text-black">Replay confetti 🎉</button>
                <button onClick={()=> setGhostModal(null)} className="rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-[13px] font-semibold text-white">Close</button>
              </div>
            </div>
          </div>
        )}
        {/* ── 6 intuitions: Candy Well + Forest 2.5D + Isotope + Streak + Bazaar ── */}
        <div className="pointer-events-auto fixed bottom-[78px] left-1/2 z-30 flex w-full max-w-[560px] -translate-x-1/2 flex-col gap-2 px-3">
          <CandyWell count={16} />
          <IsotopePanel rep={myRep} />
          <StreakRescueCard />
          <BazaarBlastCard squad={squad?.members||[]} />
          <div className="flex items-center gap-2 font-mono text-[9px] text-white/40">
            <span>ShardSync Vault · IndexedDB + Background Sync + BroadcastChannel CRDT</span>
            <button onClick={async()=>{ const n=await vaultFlush(); setToast(n? `ShardSync flushed ${n} shards ✓`:`Vault empty — offline entangle ready`); }} className="ml-auto rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-bold text-white/70">Flush vault</button>
            <button onClick={async()=>{ await vaultPut({ title: `Vault gist ${Date.now()}`, venue:"LT1", event_date:new Date().toISOString().slice(0,10), event_time:"10:00", scope_type:"whole_school" }); setToast("Vault entangle ✓ offline shard saved"); }} className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-black">Entangle</button>
          </div>
        </div>
        {/* Thumb-Gravity Glass Rail 60px single rail */}
        <GlassRail viewMode={viewMode} setViewMode={setViewMode} onFab={()=>setFabOpen(true)} bellCount={bellCount} bellOpen={bellOpen} setBellOpen={setBellOpen as any} fabFlash={fabFlash} hasNew={mineHasNew} />
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

