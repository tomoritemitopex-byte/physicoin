"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { ChevronLeft, ChevronRight, CalendarDays, Columns, LayoutGrid, List, Calendar, Clock3, MapPin, Users, CheckCircle2, AlertCircle, Sparkles, TrendingUp } from "lucide-react";
import { logError, getErrorMessage } from "@/lib/adapters/error";

// ── types ──
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

type View = "month" | "week" | "day" | "list";

const FILTERS = [
  { k: "all", label: "Everything" },
  { k: "pending", label: "Advisory" },
  { k: "verified", label: "Green tick" },
];

// ── date helpers (bespoke, inspired by big-calendar helpers — no date-fns dep) ──
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function startOfWeek(d: Date) { const x = new Date(d); const day = x.getDay(); x.setDate(x.getDate() - day); x.setHours(0,0,0,0); return x; }
function endOfWeek(d: Date) { const s = startOfWeek(d); const e = new Date(s); e.setDate(s.getDate()+6); return e; }
function addMonths(d: Date, n: number){ const x=new Date(d); x.setMonth(x.getMonth()+n); return x; }
function addWeeks(d: Date, n: number){ const x=new Date(d); x.setDate(x.getDate()+n*7); return x; }
function addDays(d: Date, n: number){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
function isSameDay(a: Date,b: Date){ return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }
function isToday(d: Date){ const t=new Date(); return isSameDay(d,t); }
function fmt(d: Date, opts: Intl.DateTimeFormatOptions){ return d.toLocaleDateString("en-GB", opts); }
function fmtTime(s: string){ return String(s).slice(0,5); }
function parseEventDate(ev: EventRow): Date | null {
  if(!ev.event_date) return null;
  // event_date is YYYY-MM-DD, event_time HH:mm:ss
  try { const [y,m,da]=ev.event_date.split("T")[0].split("-").map(Number); return new Date(y,m-1,da); } catch { return null; }
}
function eventDayKey(ev: EventRow){ return String(ev.event_date).slice(0,10); }

function rangeText(view: View, date: Date){
  if(view==="day") return fmt(date,{weekday:"long", day:"2-digit", month:"long", year:"numeric"});
  if(view==="week"){ const s=startOfWeek(date); const e=endOfWeek(date); return `${fmt(s,{month:"short", day:"2-digit"})} – ${fmt(e,{month:"short", day:"2-digit", year:"numeric"})}`; }
  if(view==="month") return fmt(date,{month:"long", year:"numeric"});
  return fmt(date,{month:"long", year:"numeric"});
}
function navigateDate(date: Date, view: View, dir: "prev"|"next"){
  const n = dir==="next"?1:-1;
  if(view==="day") return addDays(date,n);
  if(view==="week") return addWeeks(date,n);
  return addMonths(date,n);
}
function getCalendarCells(selected: Date){
  const start = startOfMonth(selected);
  const end = endOfMonth(selected);
  const gridStart = startOfWeek(start);
  const cells: { date: Date; currentMonth: boolean; day: number }[]=[];
  for(let i=0;i<42;i++){
    const d = addDays(gridStart,i);
    cells.push({ date:d, currentMonth: d.getMonth()===selected.getMonth(), day: d.getDate() });
  }
  return cells;
}

// ── small pills ──
function StatusPill({ status, verified }: { status: string; verified: boolean }) {
  if (verified) return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-1 text-[11px] font-bold tracking-wide text-white shadow-[0_2px_10px_rgba(16,185,129,0.35)]"><span className="text-[11px]">✓</span> green tick</span>;
  if (status === "pending") return <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/20 bg-amber-400/10 px-2.5 py-1 font-mono text-[11px] font-medium text-amber-200">● advisory</span>;
  return <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-[11px] text-slate-400">{status}</span>;
}

export default function TimetablePage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState<Date>(()=> new Date());
  const [showPost, setShowPost] = useState(false);
  const [posting, setPosting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [voteBusy, setVoteBusy] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const [form, setForm] = useState({ title:"", venue:"", event_date:"", event_time:"", scope_type:"general", scope_value:"" });

  const fetchFeed = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const qs = filter === "all" ? "" : `?status=${filter}`;
      const r = await fetch(`/api/timetable${qs}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || j.ok === false) throw new Error(j.error || j.hint || "couldn't load feed");
      setEvents(j.events ?? []);
    } catch (e: unknown) { logError("TIMETABLE_FETCH_FAILED", e, { page: "timetable" }); setErr(getErrorMessage("TIMETABLE_FETCH_FAILED")); }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(()=>{ fetchFeed(); },[fetchFeed]);
  useEffect(()=>{ if(!toast) return; const t=setTimeout(()=>setToast(null),2400); return ()=>clearTimeout(t); },[toast]);

  // stats — TailAdmin-style subtle header
  const stats = useMemo(()=>{
    const total = events.length;
    const verified = events.filter(ev=> ev.status==="verified" || (Number(ev.required_points)>0 && Number(ev.authority_points)>=Number(ev.required_points))).length;
    const advisory = events.filter(ev=> ev.status==="pending").length;
    const now = new Date(); const weekEnd = addDays(now,7);
    const thisWeek = events.filter(ev=>{ const d=parseEventDate(ev); return d && d>= now && d <= weekEnd; }).length;
    return { total, verified, advisory, thisWeek };
  },[events]);

  // grouped by day for calendar views
  const eventsByDay = useMemo(()=>{
    const m = new Map<string, EventRow[]>();
    for(const ev of events){ const k=eventDayKey(ev); if(!m.has(k)) m.set(k,[]); m.get(k)!.push(ev); }
    return m;
  },[events]);

  const weekDays = useMemo(()=> {
    const s = startOfWeek(cursor);
    return Array.from({length:7},(_,i)=> addDays(s,i));
  },[cursor]);

  const visibleEvents = useMemo(()=>{
    if(view==="day"){
      const k = cursor.toISOString().slice(0,10);
      return eventsByDay.get(k) ?? [];
    }
    if(view==="week"){
      const keys = new Set(weekDays.map(d=> d.toISOString().slice(0,10)));
      return events.filter(ev=> keys.has(eventDayKey(ev)));
    }
    return events;
  },[view,cursor,events,eventsByDay,weekDays]);

  async function handlePost(e: React.FormEvent){
    e.preventDefault();
    if (!form.title || !form.venue || !form.event_date || !form.event_time){ setToast("fill title, venue, date and time — we need basics to post"); return; }
    setPosting(true);
    try{
      const r = await fetch("/api/timetable",{ method:"POST", headers:{ "content-type":"application/json" }, body: JSON.stringify({ title:form.title.trim(), venue:form.venue.trim(), event_date:form.event_date, event_time:form.event_time, scope_type:form.scope_type, scope_value: form.scope_value || null, status:"pending" }) });
      const j = await r.json(); if(!r.ok || j.ok===false) throw new Error(j.error || "post failed");
      setToast("posted — it's live as advisory. tell your coursemates to confirm!");
      setForm({ title:"", venue:"", event_date:"", event_time:"", scope_type:"general", scope_value:"" });
      setShowPost(false); fetchFeed();
    }catch(e: unknown){ logError("TIMETABLE_CREATE_FAILED", e, { page: "timetable" }); setToast(getErrorMessage("TIMETABLE_CREATE_FAILED")); } finally{ setPosting(false); }
  }
  async function vote(id: string, v: "YES"|"NO"|"CANCEL"){
    let verifierId: string | null = null;
    try{ const raw=localStorage.getItem("physi_profile"); if(raw) verifierId=JSON.parse(raw)?.id ?? null; }catch{}
    if(!verifierId){ setToast("create a profile first — we need your handle to count the vote"); return; }
    setVoteBusy(id+v);
    try{
      const r=await fetch("/api/verify",{ method:"POST", headers:{ "content-type":"application/json" }, body: JSON.stringify({ verifier_id:verifierId, event_id:id, vote:v }) });
      const j=await r.json(); if(!r.ok || j.ok===false) throw new Error(j.error || "vote failed");
      setToast(v==="YES" ? "you said you were there — thanks!" : v==="NO" ? "marked as not there" : "skipped — all good");
      fetchFeed();
    }catch(e: unknown){ logError("VERIFY_SUBMIT_FAILED", e, { page: "timetable" }); setToast(getErrorMessage("VERIFY_SUBMIT_FAILED")); } finally{ setVoteBusy(null); }
  }

  const cells = useMemo(()=> getCalendarCells(cursor),[cursor]);

  // ── render helpers for cards ──
  function EventCard({ ev, compact=false }:{ ev: EventRow; compact?: boolean }){
    const ap=Number(ev.authority_points ?? 0); const rp=Number(ev.required_points ?? 0);
    const verified = ev.status==="verified" || (rp>0 && ap>=rp);
    const pct = rp>0 ? Math.min(100, Math.round((ap/rp)*100)) : verified?100:0;
    const d = ev.event_date ? new Date(ev.event_date).toLocaleDateString("en-GB",{weekday:"short", day:"2-digit", month:"short"}) : ev.event_date;
    return (
      <article className={`group relative overflow-hidden rounded-[18px] border p-4 transition ${verified ? "border-emerald-400/25 bg-gradient-to-br from-emerald-500/[0.08] to-white/[0.03] shadow-[0_4px_24px_rgba(16,185,129,0.08)]" : "border-white/[0.06] bg-white/[0.03] hover:border-white/[0.10] hover:bg-white/[0.045]" } ${compact?"sm:p-4":"sm:p-5"}`}>
        {!verified && rp>0 && <div className="absolute left-0 right-0 top-0 h-[3px] bg-white/5"><div className="h-full bg-emerald-400 transition-all" style={{width:`${pct}%`}}/></div>}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={ev.status} verified={verified} />
              {ev.scope_value ? <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 font-mono text-[11px] text-slate-400">{ev.scope_type} · {ev.scope_value}</span> : <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 font-mono text-[11px] text-slate-400">{ev.scope_type}</span>}
            </div>
            <h3 className="mt-2 truncate text-[15px] font-semibold leading-tight text-white sm:text-[16px]">{ev.title}</h3>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-slate-400">
              <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2.5 py-1 text-[12px] text-slate-200"><MapPin className="h-3 w-3 opacity-70"/>{ev.venue}</span>
              <span className="inline-flex items-center gap-1 font-mono text-[12px] text-slate-500"><Calendar className="h-3 w-3"/>{d} · <Clock3 className="h-3 w-3 ml-1"/>{fmtTime(String(ev.event_time))}</span>
            </p>
            {rp>0 && <p className="mt-2 font-mono text-[11px] text-slate-500">{verified ? <span className="text-emerald-300">✓ confirmed — {ap} / {rp} points</span> : <span>{ap} / {rp} points · {pct}% to green tick</span>}</p>}
          </div>
          <div className="hidden shrink-0 text-right font-mono text-[10.5px] text-slate-500 sm:block">{ev.created_at ? new Date(ev.created_at).toLocaleDateString("en-GB") : ""}</div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="font-mono text-[11px] uppercase tracking-wide text-slate-500">Were you there?</span>
          <div className="flex items-center gap-1.5">
            <button onClick={()=>vote(ev.id,"YES")} disabled={!!voteBusy} className="rounded-full border border-emerald-500/30 bg-emerald-500/15 px-3 py-1.5 text-[13px] font-medium text-emerald-300 hover:bg-emerald-500 hover:text-white hover:border-emerald-500 transition disabled:opacity-50">{voteBusy===ev.id+"YES" ? "…" : "Yes ✓"}</button>
            <button onClick={()=>vote(ev.id,"NO")} disabled={!!voteBusy} className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[13px] font-medium text-slate-200 hover:bg-white hover:text-[#0a0f1e] transition disabled:opacity-50">{voteBusy===ev.id+"NO" ? "…" : "No ✕"}</button>
            <button onClick={()=>vote(ev.id,"CANCEL")} disabled={!!voteBusy} className="rounded-full border border-white/10 bg-white/[0.02] px-3 py-1.5 text-[13px] font-medium text-slate-400 hover:bg-white/[0.08] hover:text-white transition disabled:opacity-50">{voteBusy===ev.id+"CANCEL" ? "…" : "Skip"}</button>
          </div>
          <span className="font-mono text-[11px] text-slate-600">one tap</span>
        </div>
      </article>
    );
  }

  return (
    <div className="space-y-4">
      {/* header copy + post CTA */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-slate-500">live timetable · advisory</p>
          <h1 className="mt-1 text-[22px] font-bold tracking-[-0.025em] text-white sm:text-[26px]">Where&apos;s class today?</h1>
          <p className="mt-1 max-w-[560px] text-[13.5px] leading-5 text-slate-400">
            Gist moves fast. Someone heard the LT changed — they post it here. You tap <span className="text-slate-200">Yes</span> if you showed up and it was real, <span className="text-slate-200">No</span> if you trekked and it was lies. Enough <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[11px] font-bold text-white">✓ green</span> and freshers stop missing class.
          </p>
        </div>
        <button onClick={()=>setShowPost(v=>!v)} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-white px-5 py-2.5 text-[14px] font-semibold text-[#0a0f1e] shadow-[0_4px_20px_rgba(255,255,255,0.12)] hover:bg-slate-100 transition">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0a0f1e] text-[12px] text-white">+</span>
          {showPost ? "Close" : "Post what you heard"}
        </button>
      </div>

      {/* TailAdmin-style header stats */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {[
          { label:"Live entries", value: stats.total, sub: view==="list" ? "all time in feed" : rangeText(view,cursor), icon: CalendarDays, accent:"text-sky-300", bg:"bg-sky-500/10 border-sky-500/15" },
          { label:"Green tick", value: stats.verified, sub: `${stats.total?Math.round(stats.verified/stats.total*100):0}% confirmed`, icon: CheckCircle2, accent:"text-emerald-300", bg:"bg-emerald-500/10 border-emerald-500/15" },
          { label:"Advisory", value: stats.advisory, sub: "awaiting confirmations", icon: AlertCircle, accent:"text-amber-300", bg:"bg-amber-500/10 border-amber-500/15" },
          { label:"This week", value: stats.thisWeek, sub: "next 7 days", icon: TrendingUp, accent:"text-violet-300", bg:"bg-violet-500/10 border-violet-500/15" },
        ].map(s=>(
          <div key={s.label} className="relative overflow-hidden rounded-[16px] border border-white/[0.06] bg-white/[0.03] px-4 py-3.5 backdrop-blur">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-mono text-[10.5px] uppercase tracking-wide text-slate-500">{s.label}</p>
                <p className="mt-1 text-[22px] font-bold tracking-[-0.02em] text-white">{s.value}</p>
                <p className="mt-0.5 font-mono text-[11px] text-slate-500 truncate pr-2">{s.sub}</p>
              </div>
              <span className={`flex h-8 w-8 items-center justify-center rounded-full border ${s.bg} ${s.accent}`}><s.icon className="h-4 w-4"/></span>
            </div>
          </div>
        ))}
      </div>

      {/* explainer */}
      <div className="grid gap-2 sm:grid-cols-3">
        {[
          ["Green tick = real","Enough coursemates tapped Yes. Trust it — but still confirm exams officially."],
          ["Advisory = fresh gist","Just posted, waiting for confirmations. Might be true, might be stale gist."],
          ["Your tap matters","One Yes/No moves the needle. Ten of you decides the truth."],
        ].map(([t,d])=>(
          <div key={t} className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
            <p className="text-[13px] font-semibold text-white">{t}</p>
            <p className="mt-1 text-[12.5px] leading-4 text-slate-400">{d}</p>
          </div>
        ))}
      </div>

      {/* post form (kept) */}
      {showPost && (
        <form onSubmit={handlePost} className="rounded-[20px] border border-white/[0.08] bg-white/[0.04] p-4 backdrop-blur sm:p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-[13px] font-semibold text-white flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-amber-300"/>Post what you heard — keep it honest</h3>
            <span className="font-mono text-[10.5px] text-slate-500">advisory until confirmed</span>
          </div>
          <p className="mt-1 text-[12.5px] text-slate-400">Example: &quot;ANA 203 moved to LT2, Friday 8am — HOD announced after lab.&quot; No broadcast gist.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="font-mono text-[10.5px] uppercase tracking-wide text-slate-500">What</span>
              <input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="ANA 203 — Osteology revision" className="w-full rounded-xl border border-white/10 bg-[#0b1020] px-3 py-2.5 text-[14px] text-white placeholder:text-slate-500 focus:border-white/20 focus:outline-none"/>
            </label>
            <label className="space-y-1">
              <span className="font-mono text-[10.5px] uppercase tracking-wide text-slate-500">Where</span>
              <input value={form.venue} onChange={e=>setForm(f=>({...f,venue:e.target.value}))} placeholder="LT2 / Anatomy Hall" className="w-full rounded-xl border border-white/10 bg-[#0b1020] px-3 py-2.5 text-[14px] text-white placeholder:text-slate-500 focus:border-white/20 focus:outline-none"/>
            </label>
            <label className="space-y-1">
              <span className="font-mono text-[10.5px] uppercase tracking-wide text-slate-500">Date</span>
              <input type="date" value={form.event_date} onChange={e=>setForm(f=>({...f,event_date:e.target.value}))} className="w-full rounded-xl border border-white/10 bg-[#0b1020] px-3 py-2.5 text-[14px] text-white focus:border-white/20 focus:outline-none"/>
            </label>
            <label className="space-y-1">
              <span className="font-mono text-[10.5px] uppercase tracking-wide text-slate-500">Time</span>
              <input type="time" value={form.event_time} onChange={e=>setForm(f=>({...f,event_time:e.target.value}))} className="w-full rounded-xl border border-white/10 bg-[#0b1020] px-3 py-2.5 text-[14px] text-white focus:border-white/20 focus:outline-none"/>
            </label>
            <label className="space-y-1">
              <span className="font-mono text-[10.5px] uppercase tracking-wide text-slate-500">Who needs this</span>
              <select value={form.scope_type} onChange={e=>setForm(f=>({...f,scope_type:e.target.value}))} className="w-full rounded-xl border border-white/10 bg-[#0b1020] px-3 py-2.5 text-[14px] text-white focus:border-white/20 focus:outline-none">
                <option value="general">Everyone (general gist)</option>
                <option value="level">One level (e.g. 200L)</option>
                <option value="group">Group / dept</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="font-mono text-[10.5px] uppercase tracking-wide text-slate-500">Scope detail (optional)</span>
              <input value={form.scope_value} onChange={e=>setForm(f=>({...f,scope_value:e.target.value}))} placeholder="200L or Physiology" className="w-full rounded-xl border border-white/10 bg-[#0b1020] px-3 py-2.5 text-[14px] text-white placeholder:text-slate-500 focus:border-white/20 focus:outline-none"/>
            </label>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <button disabled={posting} className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-[14px] font-semibold text-[#0a0f1e] disabled:opacity-60">{posting ? "Posting…" : "Post as advisory →"}</button>
            <p className="font-mono text-[11px] text-slate-500">shows instantly · green tick comes from votes</p>
          </div>
        </form>
      )}

      {/* calendar toolbar — inspired by big-calendar header (view toggle + date navigator) */}
      <div className="flex flex-col gap-3 rounded-[18px] border border-white/[0.06] bg-white/[0.02] p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <button onClick={()=>setCursor(new Date())} className="rounded-full border border-white/10 bg-white px-3.5 py-1.5 text-[13px] font-semibold text-[#0a0f1e] hover:bg-slate-100 transition">Today</button>
          <div className="flex items-center rounded-full border border-white/10 bg-white/[0.04] p-1">
            <button aria-label="Previous" onClick={()=>setCursor(d=> navigateDate(d, view, "prev"))} className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-white/10 text-slate-300"><ChevronLeft className="h-4 w-4"/></button>
            <button aria-label="Next" onClick={()=>setCursor(d=> navigateDate(d, view, "next"))} className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-white/10 text-slate-300"><ChevronRight className="h-4 w-4"/></button>
          </div>
          <span className="ml-1 hidden text-[14px] font-semibold tracking-[-0.01em] text-white sm:inline">{rangeText(view,cursor)}</span>
          <span className="ml-1 text-[13px] font-semibold text-white sm:hidden">{rangeText(view,cursor)}</span>
        </div>

        <div className="flex items-center gap-2">
          {/* view toggle — shadcn segment inspired by big-calendar */}
          <div className="inline-flex rounded-full border border-white/10 bg-[#0b1020] p-1">
            {[
              { k:"month", label:"Month", icon: LayoutGrid },
              { k:"week", label:"Week", icon: Columns },
              { k:"day", label:"Day", icon: Calendar },
              { k:"list", label:"List", icon: List },
            ].map(v=>(
              <button key={v.k} onClick={()=>setView(v.k as View)} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition ${view===v.k ? "bg-white text-[#0a0f1e] shadow" : "text-slate-400 hover:text-white"}`}>
                <v.icon className="h-3.5 w-3.5"/> <span className="hidden sm:inline">{v.label}</span>
              </button>
            ))}
          </div>
          <button onClick={fetchFeed} className="hidden font-mono text-[11px] text-slate-500 hover:text-slate-300 sm:inline">↻ refresh</button>
        </div>
      </div>

      {/* filters — kept secondary */}
      <div className="flex items-center gap-2">
        {FILTERS.map(f=>(
          <button key={f.k} onClick={()=>setFilter(f.k)} className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${filter===f.k ? "bg-white text-[#0a0f1e]" : "border border-white/10 bg-white/[0.04] text-slate-400 hover:text-white"}`}>{f.label}</button>
        ))}
        <span className="ml-auto hidden items-center gap-1 font-mono text-[11px] text-slate-600 sm:inline-flex"><Users className="h-3 w-3"/>{events.length} in view</span>
        <button onClick={fetchFeed} className="font-mono text-[11px] text-slate-500 hover:text-slate-300 sm:hidden">↻</button>
      </div>

      {/* ── main view area ── */}
      {loading ? (
        <div className="grid gap-3">{[0,1,2].map(i=>(
          <div key={i} className="animate-pulse rounded-[18px] border border-white/[0.06] bg-white/[0.03] p-4"><div className="h-4 w-2/3 rounded bg-white/10"/><div className="mt-3 h-3 w-1/2 rounded bg-white/5"/></div>
        ))}</div>
      ) : err ? (
        <div className="rounded-[18px] border border-red-400/20 bg-red-400/10 p-5 text-center">
          <p className="text-[14px] font-medium text-red-200">feed is down</p>
          <p className="mt-1 font-mono text-[12px] text-red-200/70">{err || "Something went wrong. Please try again."}</p>
          <button onClick={fetchFeed} className="mt-3 rounded-full bg-white px-4 py-1.5 text-[13px] font-semibold text-[#0a0f1e]">try again</button>
        </div>
      ) : (
        <>
          {/* MONTH VIEW — big-calendar month grid inspiration */}
          {view==="month" && (
            <div className="overflow-hidden rounded-[18px] border border-white/[0.06] bg-white/[0.02]">
              <div className="grid grid-cols-7 divide-x divide-white/[0.04] border-b border-white/[0.06] bg-white/[0.03]">
                {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d=>(
                  <div key={d} className="py-2 text-center font-mono text-[11px] font-medium uppercase tracking-wide text-slate-500">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 auto-rows-[96px] sm:auto-rows-[118px]">
                {cells.map(cell=>{
                  const k = cell.date.toISOString().slice(0,10);
                  const dayEvents = eventsByDay.get(k) ?? [];
                  const selected = selectedDay===k;
                  const today = isToday(cell.date);
                  return (
                    <button
                      key={k}
                      onClick={()=> setSelectedDay(k)}
                      className={`relative flex flex-col gap-1 border-b border-r border-white/[0.04] p-1.5 text-left transition hover:bg-white/[0.03] sm:p-2 ${!cell.currentMonth ? "bg-white/[0.01] opacity-60" : "bg-transparent"} ${selected ? "ring-1 ring-inset ring-white/20 bg-white/[0.04]" : ""} ${today ? "bg-sky-500/[0.04]" : ""}`}
                    >
                      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-semibold ${today ? "bg-white text-[#0a0f1e]" : cell.currentMonth ? "text-slate-200" : "text-slate-500"} ${!cell.currentMonth ? "opacity-70": ""}`}>{cell.day}</span>
                      <div className="hidden flex-col gap-1 sm:flex">
                        {dayEvents.slice(0,3).map(ev=>{
                          const verified = ev.status==="verified" || (Number(ev.required_points)>0 && Number(ev.authority_points)>=Number(ev.required_points));
                          return (
                            <span key={ev.id} className={`truncate rounded-full px-2 py-0.5 text-[11px] font-medium leading-none ${verified ? "bg-emerald-500 text-white" : "bg-amber-400/15 text-amber-200 border border-amber-400/15"}`}>
                              {fmtTime(String(ev.event_time))} {ev.title}
                            </span>
                          );
                        })}
                        {dayEvents.length>3 && <span className="font-mono text-[11px] text-slate-500">+{dayEvents.length-3} more</span>}
                      </div>
                      <div className="flex gap-1 sm:hidden">
                        {dayEvents.slice(0,4).map(ev=>{
                          const verified = ev.status==="verified" || (Number(ev.required_points)>0 && Number(ev.authority_points)>=Number(ev.required_points));
                          return <span key={ev.id} className={`h-1.5 w-1.5 rounded-full ${verified ? "bg-emerald-400" : "bg-amber-400"}`} />;
                        })}
                      </div>
                    </button>
                  );
                })}
              </div>
              {/* selected day drawer */}
              {selectedDay && (
                <div className="border-t border-white/[0.06] bg-[#0b1020]/60 p-3 sm:p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-[13px] font-semibold text-white">{new Date(selectedDay).toLocaleDateString("en-GB",{weekday:"long", day:"2-digit", month:"long", year:"numeric"})} <span className="font-mono text-[11px] font-normal text-slate-500">· { (eventsByDay.get(selectedDay) ?? []).length } { (eventsByDay.get(selectedDay) ?? []).length===1 ? "entry" : "entries"}</span></p>
                    <button onClick={()=>setSelectedDay(null)} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[12px] text-slate-300 hover:text-white">close</button>
                  </div>
                  <div className="mt-3 grid gap-3">
                    {(eventsByDay.get(selectedDay) ?? []).length===0
                      ? <p className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-center text-[13px] text-slate-400">No gist for this day. Tap another date or post what you heard.</p>
                      : (eventsByDay.get(selectedDay) ?? []).map(ev=> <EventCard key={ev.id} ev={ev} />)
                    }
                  </div>
                </div>
              )}
            </div>
          )}

          {/* WEEK VIEW */}
          {view==="week" && (
            <div className="overflow-hidden rounded-[18px] border border-white/[0.06] bg-white/[0.02]">
              <div className="grid grid-cols-8 divide-x divide-white/[0.04] border-b border-white/[0.06] bg-white/[0.03]">
                <div className="py-2 text-center font-mono text-[11px] text-slate-500">GMT+1</div>
                {weekDays.map(d=>(
                  <div key={d.toISOString()} className={`py-2 text-center ${isToday(d) ? "bg-white text-[#0a0f1e]" : ""} ${isSameDay(d,cursor) ? "ring-1 ring-inset ring-white/20" : ""}`}>
                    <p className={`font-mono text-[10.5px] uppercase tracking-wide ${isToday(d) ? "text-[#0a0f1e]/70" : "text-slate-500"}`}>{fmt(d,{weekday:"short"})}</p>
                    <p className={`text-[13px] font-semibold ${isToday(d) ? "text-[#0a0f1e]" : "text-white"}`}>{d.getDate()}</p>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-8 divide-x divide-white/[0.04]">
                <div className="divide-y divide-white/[0.04]">
                  {Array.from({length:13},(_,i)=> 7+i).map(h=>(
                    <div key={h} className="h-[52px] pr-2 text-right font-mono text-[10.5px] text-slate-600 pt-1">{String(h).padStart(2,"0")}:00</div>
                  ))}
                </div>
                {weekDays.map(d=>{
                  const k=d.toISOString().slice(0,10);
                  const dayEvents=(eventsByDay.get(k) ?? []).slice().sort((a,b)=> String(a.event_time).localeCompare(String(b.event_time)));
                  return (
                    <div key={k} className={`relative divide-y divide-white/[0.03] ${isToday(d) ? "bg-sky-500/[0.02]" : ""}`}>
                      {Array.from({length:13}).map((_,i)=> <div key={i} className="h-[52px]"/>)}
                      <div className="absolute inset-0 p-1">
                        {dayEvents.map(ev=>{
                          const [hh,mm]=String(ev.event_time).split(":").map(Number);
                          const top = Math.max(0, (hh - 7)*52 + (mm/60)*52 + 2);
                          const verified = ev.status==="verified" || (Number(ev.required_points)>0 && Number(ev.authority_points)>=Number(ev.required_points));
                          if(hh<7 || hh>19) return null;
                          return (
                            <div key={ev.id} style={{ top }} className={`absolute left-1 right-1 rounded-xl border px-2 py-1.5 text-[11px] leading-tight shadow-sm ${verified ? "border-emerald-400/25 bg-emerald-500 text-white" : "border-amber-400/20 bg-[#1a2236] text-amber-100"}`}>
                              <p className="truncate font-semibold">{ev.title}</p>
                              <p className="truncate opacity-80">{fmtTime(String(ev.event_time))} · {ev.venue}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* week list below for voting */}
              <div className="border-t border-white/[0.06] bg-[#0b1020]/40 p-3 sm:p-4">
                <p className="font-mono text-[11px] uppercase tracking-wide text-slate-500">{visibleEvents.length} {visibleEvents.length===1?"entry":"entries"} this week — tap to confirm</p>
                <div className="mt-3 grid gap-3">
                  {visibleEvents.length===0 ? <p className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-center text-[13px] text-slate-400">Nothing this week. Change week or post gist.</p> : visibleEvents.map(ev=> <EventCard key={ev.id} ev={ev} />)}
                </div>
              </div>
            </div>
          )}

          {/* DAY VIEW */}
          {view==="day" && (
            <div className="overflow-hidden rounded-[18px] border border-white/[0.06] bg-white/[0.02]">
              <div className="flex items-center justify-between border-b border-white/[0.06] bg-white/[0.03] px-4 py-3">
                <p className="text-[14px] font-semibold text-white">{rangeText("day", cursor)} <span className="font-mono text-[11px] font-normal text-slate-500">· {visibleEvents.length} entries</span></p>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${isToday(cursor) ? "bg-emerald-500 text-white" : "bg-white/[0.06] text-slate-300"}`}>{isToday(cursor) ? "today" : fmt(cursor,{weekday:"short"})}</span>
              </div>
              <div className="grid grid-cols-[64px_1fr] divide-x divide-white/[0.04]">
                <div className="divide-y divide-white/[0.04] bg-white/[0.01]">
                  {Array.from({length:13},(_,i)=> 7+i).map(h=>(
                    <div key={h} className="h-[64px] pr-2 pt-1 text-right font-mono text-[10.5px] text-slate-600">{String(h).padStart(2,"0")}:00</div>
                  ))}
                </div>
                <div className="relative divide-y divide-white/[0.03]">
                  {Array.from({length:13}).map((_,i)=> <div key={i} className="h-[64px]"/>)}
                  <div className="absolute inset-0">
                    {visibleEvents.length===0 && <div className="flex h-full items-center justify-center p-6"><p className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-8 text-center text-[13px] text-slate-400">No gist for this day.<br/><span className="font-mono text-[11px]">Try another date or be first to post.</span></p></div>}
                    {visibleEvents.slice().sort((a,b)=> String(a.event_time).localeCompare(String(b.event_time))).map(ev=>{
                      const [hh,mm]=String(ev.event_time).split(":").map(Number);
                      const top = Math.max(0, (hh-7)*64 + (mm/60)*64 + 4);
                      const verified = ev.status==="verified" || (Number(ev.required_points)>0 && Number(ev.authority_points)>=Number(ev.required_points));
                      if(hh<7 || hh>19) return null;
                      return (
                        <div key={ev.id} style={{ top }} className={`absolute left-3 right-3 rounded-[14px] border p-3 flex items-center justify-between gap-3 ${verified ? "border-emerald-400/25 bg-gradient-to-r from-emerald-500/15 to-white/[0.03]" : "border-white/10 bg-[#111a2e]"}`}>
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-semibold text-white">{ev.title}</p>
                            <p className="flex items-center gap-2 text-[11px] text-slate-400"><MapPin className="h-3 w-3"/>{ev.venue} · {fmtTime(String(ev.event_time))} {ev.scope_value ? `· ${ev.scope_value}`: ""}</p>
                          </div>
                          <StatusPill status={ev.status} verified={verified} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              {visibleEvents.length>0 && (
                <div className="border-t border-white/[0.06] bg-[#0b1020]/40 p-3 sm:p-4">
                  <div className="grid gap-3">{visibleEvents.map(ev=> <EventCard key={ev.id} ev={ev} />)}</div>
                </div>
              )}
            </div>
          )}

          {/* LIST VIEW — polished feed */}
          {view==="list" && (
            <>
              {events.length===0 ? (
                <div className="rounded-[20px] border border-dashed border-white/10 bg-white/[0.02] px-6 py-12 text-center">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.06] text-lg">◐</div>
                  <p className="mt-3 text-[15px] font-semibold text-white">No gist yet</p>
                  <p className="mx-auto mt-1 max-w-[420px] text-[13.5px] leading-5 text-slate-400">Be the first to post. Heard a venue change, a time shift, even a &quot;lecturer said maybe next week&quot;? Drop it — your coursemates will sort truth from gist.</p>
                  <button onClick={()=>setShowPost(true)} className="mt-4 rounded-full bg-white px-5 py-2 text-[13px] font-semibold text-[#0a0f1e]">Post the first gist</button>
                </div>
              ) : (
                <div className="grid gap-3">{events.map(ev=> <EventCard key={ev.id} ev={ev} />)}</div>
              )}
            </>
          )}
        </>
      )}

      <div className="rounded-2xl border border-amber-400/10 bg-amber-400/[0.04] px-4 py-3">
        <p className="font-mono text-[11px] leading-4 text-amber-200/70">Heads up: this is student gist, not an official circular. Green tick just means your coursemates confirmed it with their own eyes. For exams, tests, or anything that can carry over — confirm with your course rep or department notice board.</p>
      </div>

      {toast && <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full border border-white/10 bg-[#0f172a] px-4 py-2 text-[13px] font-medium text-white shadow-[0_8px_30px_rgba(0,0,0,0.5)]">{toast}</div>}
    </div>
  );
}
