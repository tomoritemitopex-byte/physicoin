"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Clock3, Users, CheckCircle2, AlertCircle, Sparkles, TrendingUp, MessageCircle, Timer } from "lucide-react";
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
  created_by?: string | null;
};

type Verification = {
  verifier_id: string;
  event_id: string;
  vote: string;
  authority_weight: number | string;
  created_at: string;
};

// ── ghost / candy ──
const GHOST_NAMES = ["Bisola","Tunde","Chiamaka","Emeka","Aisha","Femi","Zainab","Kola","Ngozi","Yusuf","Amara","Seyi","Ada","Kunle","Ife","Bola","Chidi","Nana","Sade","Tobi","Lola"," Bayo","Kemi","Uche","Funmi","Jide","Nimi","Hassan"];
const CANDY_COLORS = ["#FF6B6B","#4ECDC4","#FFE66D","#A78BFA","#34D399","#F472B6","#60A5FA","#F59E0B","#F87171","#6EE7B7","#C084FC","#FB923C"];

function hashCode(s: string): number {
  let h = 0; for (let i=0;i<s.length;i++) h = (h*31 + s.charCodeAt(i)) >>> 0; return h;
}
function pickGhostName(seed: string): string {
  return GHOST_NAMES[hashCode(seed) % GHOST_NAMES.length];
}
function pickCandyColor(seed: string): string {
  return CANDY_COLORS[hashCode(seed) % CANDY_COLORS.length];
}

// ── time helpers — WAT (Africa/Lagos = UTC+1, no DST) ──
function timeAgo(iso: string): string {
  if (!iso) return "just now";
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "just now";
  const diff = Date.now() - t;
  const s = Math.floor(diff/1000);
  if (s < 60) return "just now";
  const m = Math.floor(s/60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m/60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h/24); if (d < 7) return `${d}d ago`;
  // fallback: date in WAT
  return new Date(iso).toLocaleDateString("en-GB", { timeZone: "Africa/Lagos", day:"2-digit", month:"short" });
}
function fmtTimeWAT(s: string): string {
  return String(s).slice(0,5);
}
// Expiry: event_date + event_time interpreted as WAT (+01:00) + 24h
function getExpiryMs(ev: EventRow): number | null {
  try {
    const d = String(ev.event_date).slice(0,10);
    const t = String(ev.event_time).slice(0,8);
    if (!d || d.includes("undefined")) return null;
    // ensure time has seconds
    const timePart = t.split(":").length === 2 ? `${t}:00` : t;
    const watIso = `${d}T${timePart}+01:00`; // WAT
    const ms = new Date(watIso).getTime();
    if (isNaN(ms)) return null;
    return ms + 24*60*60*1000;
  } catch { return null; }
}
function formatExpiryLabel(msLeft: number): string {
  if (msLeft <= 0) return "expired";
  const h = Math.floor(msLeft / 3600000);
  const m = Math.floor((msLeft % 3600000)/60000);
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m left`;
}
function formatWATDate(ev: EventRow): string {
  try {
    const d = String(ev.event_date).slice(0,10);
    const t = String(ev.event_time).slice(0,8);
    const timePart = t.split(":").length === 2 ? `${t}:00` : t;
    const dt = new Date(`${d}T${timePart}+01:00`);
    return dt.toLocaleDateString("en-GB", { timeZone:"Africa/Lagos", weekday:"short", day:"2-digit", month:"short" }) + " · " + dt.toLocaleTimeString("en-GB", { timeZone:"Africa/Lagos", hour:"2-digit", minute:"2-digit" }) + " WAT";
  } catch { return `${ev.event_date} ${fmtTimeWAT(String(ev.event_time))} WAT`; }
}

// ── candy avatar ──
function CandyAvatar({ name, size=22 }: { name: string; size?: number }) {
  const bg = pickCandyColor(name);
  const letter = (name.trim()[0] || "?").toUpperCase();
  return (
    <span
      title={name}
      style={{ background: bg, width:size, height:size }}
      className="inline-flex shrink-0 items-center justify-center rounded-full border border-white/15 text-[10px] font-black text-white shadow-[0_2px_8px_rgba(0,0,0,0.3)]"
    >
      {letter}
    </span>
  );
}

export default function TimetablePage() {
  const router = useRouter();
  useEffect(() => {
    try { router.replace("/app/roadmap?view=list&filter=all"); } catch {}
  }, [router]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [showPost, setShowPost] = useState(false);
  const [posting, setPosting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [voteBusy, setVoteBusy] = useState<string | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const [verMap, setVerMap] = useState<Record<string, Verification[]>>({});
  const [nickMap, setNickMap] = useState<Record<string, string>>({});
  const [posterMap, setPosterMap] = useState<Record<string, string>>({});

  const [form, setForm] = useState({ title:"", venue:"", event_date:"", event_time:"", scope_type:"general", scope_value:"" });

  // tick for fading bar
  useEffect(()=>{ const id=setInterval(()=>setNow(Date.now()), 30000); return ()=>clearInterval(id); },[]);

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

  // fetch verifiers per event (verifications + nicknames)
  useEffect(()=>{
    if (!events.length) return;
    let cancelled=false;
    async function run(){
      const nextVer: Record<string, Verification[]> = {};
      const nextNick: Record<string, string> = {};
      // limit concurrent: process in batches of 6
      const ids = events.slice(0,30).map(e=>e.id);
      const batches: string[][] = [];
      for(let i=0;i<ids.length;i+=6) batches.push(ids.slice(i,i+6));
      for(const batch of batches){
        await Promise.all(batch.map(async (eid)=>{
          try{
            const r= await fetch(`/api/verify?event_id=${encodeURIComponent(eid)}`, { cache:"no-store" });
            const j= await r.json();
            if (j.ok && Array.isArray(j.verifications)) {
              nextVer[eid]= j.verifications as Verification[];
              // resolve nicknames for each verifier (best-effort, no fake DB writes)
              await Promise.all(j.verifications.slice(0,8).map(async (v: Verification)=>{
                const vid = String(v.verifier_id);
                if (nextNick[vid]) return;
                try{
                  const pr= await fetch(`/api/profile?id=${encodeURIComponent(vid)}`, { cache:"no-store" });
                  const pj= await pr.json();
                  if (pj.ok && pj.user?.nickname) nextNick[vid]= String(pj.user.nickname);
                }catch{}
              }));
            } else nextVer[eid]=[];
          }catch{ nextVer[eid]=[]; }
        }));
        if (cancelled) return;
      }
      if(!cancelled){
        setVerMap(prev=> ({...prev, ...nextVer}));
        setNickMap(prev=> ({...prev, ...nextNick}));
      }
    }
    run();
    return ()=>{cancelled=true;};
  },[events]);

  // resolve poster nicknames from created_by
  useEffect(()=>{
    const need = events.filter(e=> e.created_by && !posterMap[e.created_by!]).map(e=> e.created_by!);
    const uniq = Array.from(new Set(need)).slice(0,12);
    if (!uniq.length) return;
    let cancelled=false;
    (async()=>{
      const m: Record<string,string> = {};
      await Promise.all(uniq.map(async id=>{
        try{
          const r= await fetch(`/api/profile?id=${encodeURIComponent(id)}`, { cache:"no-store" });
          const j= await r.json();
          if (j.ok && j.user?.nickname) m[id]= String(j.user.nickname);
        }catch{}
      }));
      if(!cancelled) setPosterMap(prev=> ({...prev,...m}));
    })();
    return ()=>{cancelled=true;};
  },[events, posterMap]);

  const stats = useMemo(()=>{
    const total = events.length;
    const verified = events.filter(ev=> ev.status==="verified" || (Number(ev.required_points)>0 && Number(ev.authority_points)>=Number(ev.required_points))).length;
    const advisory = events.filter(ev=> ev.status==="pending").length;
    return { total, verified, advisory };
  },[events]);

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
      // refresh verifiers for that event
      try{
        const vr= await fetch(`/api/verify?event_id=${encodeURIComponent(id)}`, { cache:"no-store" });
        const vj= await vr.json();
        if (vj.ok) setVerMap(prev=> ({...prev, [id]: vj.verifications ?? []}));
      }catch{}
    }catch(e: unknown){ logError("VERIFY_SUBMIT_FAILED", e, { page: "timetable" }); setToast(getErrorMessage("VERIFY_SUBMIT_FAILED")); } finally{ setVoteBusy(null); }
  }

  // sorted chat feed: newest created_at first (WhatsApp recent top)
  const sorted = useMemo(()=>{
    return [...events].sort((a,b)=> new Date(b.created_at || b.event_date).getTime() - new Date(a.created_at || a.event_date).getTime());
  },[events]);

  const FILTERS = [
    { k:"all", label:"Everything" },
    { k:"pending", label:"Advisory" },
    { k:"verified", label:"Green tick" },
  ];

  return (
    <div className="space-y-4">
      {/* redirect alias banner */}
      <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 flex items-center justify-between gap-3">
        <p className="text-[13px] font-bold text-amber-200">Moved to Road List — this feed now lives at <span className="font-mono text-amber-100">/app/roadmap?view=list&amp;filter=all</span></p>
        <a href="/app/roadmap?view=list&filter=all" className="shrink-0 rounded-full bg-white px-4 py-1.5 text-[13px] font-black text-black hover:bg-slate-100">Open Road List →</a>
      </div>
      {/* header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-slate-500">live timetable · advisory · WAT</p>
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

      {/* stats */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {[
          { label:"Live entries", value: stats.total, sub: `${stats.total} in feed · WAT`, icon: Users, accent:"text-sky-300", bg:"bg-sky-500/10 border-sky-500/15" },
          { label:"Green tick", value: stats.verified, sub: `${stats.total?Math.round(stats.verified/stats.total*100):0}% confirmed`, icon: CheckCircle2, accent:"text-emerald-300", bg:"bg-emerald-500/10 border-emerald-500/15" },
          { label:"Advisory", value: stats.advisory, sub: "awaiting confirmations", icon: AlertCircle, accent:"text-amber-300", bg:"bg-amber-500/10 border-amber-500/15" },
          { label:"Chat feed", value: sorted.length, sub: "WhatsApp-style · newest first", icon: MessageCircle, accent:"text-violet-300", bg:"bg-violet-500/10 border-violet-500/15" },
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

      {/* post form */}
      {showPost && (
        <form onSubmit={handlePost} className="rounded-[20px] border border-white/[0.08] bg-white/[0.04] p-4 backdrop-blur sm:p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-[13px] font-semibold text-white flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-amber-300"/>Post what you heard — keep it honest</h3>
            <span className="font-mono text-[10.5px] text-slate-500">advisory until confirmed · WAT</span>
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
              <span className="font-mono text-[10.5px] uppercase tracking-wide text-slate-500">Date (WAT)</span>
              <input type="date" value={form.event_date} onChange={e=>setForm(f=>({...f,event_date:e.target.value}))} className="w-full rounded-xl border border-white/10 bg-[#0b1020] px-3 py-2.5 text-[14px] text-white focus:border-white/20 focus:outline-none"/>
            </label>
            <label className="space-y-1">
              <span className="font-mono text-[10.5px] uppercase tracking-wide text-slate-500">Time (WAT)</span>
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
            <p className="font-mono text-[11px] text-slate-500">shows instantly · green tick comes from votes · WAT</p>
          </div>
        </form>
      )}

      {/* filters */}
      <div className="flex items-center gap-2">
        {FILTERS.map(f=>(
          <button key={f.k} onClick={()=>setFilter(f.k)} className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${filter===f.k ? "bg-white text-[#0a0f1e]" : "border border-white/10 bg-white/[0.04] text-slate-400 hover:text-white"}`}>{f.label}</button>
        ))}
        <span className="ml-auto hidden items-center gap-1 font-mono text-[11px] text-slate-600 sm:inline-flex"><TrendingUp className="h-3 w-3"/>{events.length} in feed</span>
        <button onClick={fetchFeed} className="font-mono text-[11px] text-slate-500 hover:text-slate-300">↻ refresh</button>
      </div>

      {/* ── CHAT FEED ── */}
      {loading ? (
        <div className="space-y-3">{[0,1,2].map(i=>(
          <div key={i} className="animate-pulse rounded-[18px] border border-white/[0.06] bg-white/[0.03] p-4"><div className="h-4 w-2/3 rounded bg-white/10"/><div className="mt-3 h-3 w-1/2 rounded bg-white/5"/></div>
        ))}</div>
      ) : err ? (
        <div className="rounded-[18px] border border-red-400/20 bg-red-400/10 p-5 text-center">
          <p className="text-[14px] font-medium text-red-200">feed is down</p>
          <p className="mt-1 font-mono text-[12px] text-red-200/70">{err}</p>
          <button onClick={fetchFeed} className="mt-3 rounded-full bg-white px-4 py-1.5 text-[13px] font-semibold text-[#0a0f1e]">try again</button>
        </div>
      ) : sorted.length===0 ? (
        <div className="rounded-[20px] border border-dashed border-white/10 bg-white/[0.02] px-6 py-12 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.06] text-lg">◐</div>
          <p className="mt-3 text-[15px] font-semibold text-white">No gist yet</p>
          <p className="mx-auto mt-1 max-w-[420px] text-[13.5px] leading-5 text-slate-400">Be the first to post. Heard a venue change, a time shift? Drop it — your coursemates will sort truth from gist.</p>
          <button onClick={()=>setShowPost(true)} className="mt-4 rounded-full bg-white px-5 py-2 text-[13px] font-semibold text-[#0a0f1e]">Post the first gist</button>
        </div>
      ) : (
        <div className="space-y-3">
          {/* WhatsApp-style stack — slight overlap with tail effect via rounded corners */}
          {sorted.map(ev=>{
            const ap=Number(ev.authority_points ?? 0); const rp=Number(ev.required_points ?? 0);
            const verified = ev.status==="verified" || (rp>0 && ap>=rp);
            const pct = rp>0 ? Math.min(100, Math.round((ap/rp)*100)) : verified?100:0;
            const verifications = verMap[ev.id] ?? [];
            const yesCount = verifications.filter(v=> v.vote==="YES").length;
            const noCount = verifications.filter(v=> v.vote==="NO").length;
            // poster name: try resolved, else ghost from created_by or id
            const posterRaw = ev.created_by ? (posterMap[ev.created_by] ?? "") : "";
            const posterName = posterRaw || pickGhostName(ev.created_by || ev.id);
            // chat line: "Bisola: BIO 101 moved to LT2 — ..."
            const chatTitle = `${ev.title} → ${ev.venue}`;
            // time ago from created_at, else event_date fallback
            const ago = timeAgo(ev.created_at || `${String(ev.event_date).slice(0,10)}T${String(ev.event_time).slice(0,8)}+01:00`);
            // 24h fading: based on event_date+time+24h vs now
            const expiry = getExpiryMs(ev);
            let pctLeft = 100;
            let msLeft = 24*3600000;
            let opacity = 1;
            if (expiry !== null) {
              msLeft = expiry - now;
              pctLeft = Math.max(0, Math.min(100, (msLeft / (24*3600000))*100));
              opacity = 0.6 + 0.4 * (pctLeft/100); // 1 → 0.6
              // if not yet started (event in future), keep full opacity but show full bar
              if (msLeft > 24*3600000) { pctLeft=100; opacity=1; }
            } else {
              // fallback: created_at +24h
              const c = ev.created_at ? new Date(ev.created_at).getTime() : NaN;
              if (!isNaN(c)) {
                const exp2 = c + 24*3600000;
                msLeft = exp2 - now;
                pctLeft = Math.max(0, Math.min(100, (msLeft / (24*3600000))*100));
                opacity = 0.6 + 0.4 * (pctLeft/100);
              }
            }
            const expired = msLeft <= 0;
            const progressColor = expired ? "bg-slate-600" : verified ? "bg-emerald-400" : pctLeft < 25 ? "bg-amber-400" : "bg-sky-400";
            return (
              <article
                key={ev.id}
                style={{ opacity }}
                className={`group relative overflow-hidden rounded-[18px] border transition ${verified ? "border-emerald-400/25 bg-gradient-to-br from-emerald-500/[0.08] to-white/[0.03] shadow-[0_4px_24px_rgba(16,185,129,0.08)]" : "border-white/[0.06] bg-white/[0.03] hover:border-white/[0.10] hover:bg-white/[0.045]" }`}
              >
                {/* 24h fading progress bar at top */}
                <div className="absolute left-0 right-0 top-0 h-[3px] bg-white/5">
                  <div className={`h-full transition-all duration-700 ${progressColor}`} style={{ width: `${pctLeft}%` }} />
                </div>
                {/* expiry label + opacity hint */}
                <div className="absolute right-3 top-2.5 hidden items-center gap-1.5 sm:flex">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] ${expired ? "bg-slate-700 text-slate-300" : "bg-white/[0.06] text-slate-400 border border-white/10"}`}>
                    <Timer className="h-3 w-3" /> {formatExpiryLabel(msLeft)}
                  </span>
                </div>

                <div className="p-4 sm:p-4">
                  {/* WhatsApp-style line */}
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-black text-[#0a0f1e] sm:flex">
                      {(posterName[0]||"?").toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] leading-tight">
                        <span className="font-bold text-emerald-300">{posterName}:</span>
                        <span className="ml-1 font-semibold text-white">{chatTitle}</span>
                        <span className="ml-2 font-mono text-[11px] text-slate-500">{ago}</span>
                        {verified && <span className="ml-2 inline-flex items-center rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold text-white">✓ green</span>}
                        {!verified && <span className="ml-2 inline-flex items-center rounded-full border border-amber-400/20 bg-amber-400/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-amber-200">advisory</span>}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-slate-400">
                        <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-slate-200"><MapPin className="h-3 w-3 opacity-60"/>{ev.venue}</span>
                        <span className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-500"><Clock3 className="h-3 w-3"/>{formatWATDate(ev)}</span>
                        {ev.scope_value ? <span className="rounded-full border border-white/10 bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-slate-400">{ev.scope_type} · {ev.scope_value}</span> : <span className="rounded-full border border-white/10 bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-slate-400">{ev.scope_type}</span>}
                      </p>
                      {/* Yes count + faces row */}
                      <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-white text-[#0a0f1e] px-2.5 py-1 text-[12px] font-bold shadow-sm">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> {yesCount} Yes
                          {noCount>0 && <span className="ml-1 font-mono text-[11px] font-medium text-slate-600">· {noCount} No</span>}
                        </span>
                        {rp>0 && <span className="font-mono text-[11px] text-slate-500">{verified ? <span className="text-emerald-300">✓ {ap}/{rp}</span> : <span>{ap}/{rp} · {pct}%</span>}</span>}
                        <span className="font-mono text-[11px] text-slate-600 sm:hidden">{formatExpiryLabel(msLeft)}</span>
                      </div>

                      {/* candy avatars of verifiers */}
                      <div className="mt-2 flex items-center gap-1.5">
                        {verifications.length===0 ? (
                          <span className="font-mono text-[11px] text-slate-500">no verifiers yet — be first to tap Yes</span>
                        ) : (
                          <>
                            <div className="flex -space-x-1.5">
                              {verifications.slice(0,6).map(v=>{
                                const vid = String(v.verifier_id);
                                const nick = nickMap[vid] || pickGhostName(vid);
                                const isYes = v.vote==="YES";
                                return (
                                  <span key={vid} className={`relative flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 text-[9px] font-black text-white ${isYes ? "border-emerald-400/40" : "border-white/10"}`} style={{ background: pickCandyColor(nick) }} title={`${nick} · ${v.vote} · ×${Number(v.authority_weight).toFixed(2)}`}>
                                    {(nick[0]||"?").toUpperCase()}
                                  </span>
                                );
                              })}
                            </div>
                            <span className="font-mono text-[11px] text-slate-500">
                              {verifications.slice(0,6).map(v=> nickMap[String(v.verifier_id)] || pickGhostName(String(v.verifier_id))).join(", ")}
                              {verifications.length>6 && ` +${verifications.length-6} more`}
                            </span>
                            <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2 py-0.5 font-mono text-[10px] text-slate-400"><Users className="h-3 w-3"/> {verifications.length}</span>
                          </>
                        )}
                      </div>

                      {/* tiny candy dots for quick visual */}
                      {verifications.length>0 && (
                        <div className="mt-1.5 flex gap-1">
                          {verifications.slice(0,8).map(v=>{
                            const vid=String(v.verifier_id);
                            const nick=nickMap[vid] || pickGhostName(vid);
                            return <span key={vid} className="h-1.5 w-1.5 rounded-full" style={{ background: pickCandyColor(nick), opacity: v.vote==="YES"?1:0.45 }} title={`${nick}:${v.vote}`} />;
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* verify buttons — keep /api/verify, WAT label */}
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-[10.5px] uppercase tracking-wide text-slate-500">Were you there? (WAT)</span>
                    <div className="flex items-center gap-1.5">
                      <button onClick={()=>vote(ev.id,"YES")} disabled={!!voteBusy} className="rounded-full border border-emerald-500/30 bg-emerald-500/15 px-3 py-1.5 text-[13px] font-medium text-emerald-300 hover:bg-emerald-500 hover:text-white hover:border-emerald-500 transition disabled:opacity-50">{voteBusy===ev.id+"YES" ? "…" : "Yes ✓"}</button>
                      <button onClick={()=>vote(ev.id,"NO")} disabled={!!voteBusy} className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[13px] font-medium text-slate-200 hover:bg-white hover:text-[#0a0f1e] transition disabled:opacity-50">{voteBusy===ev.id+"NO" ? "…" : "No ✕"}</button>
                      <button onClick={()=>vote(ev.id,"CANCEL")} disabled={!!voteBusy} className="rounded-full border border-white/10 bg-white/[0.02] px-3 py-1.5 text-[13px] font-medium text-slate-400 hover:bg-white/[0.08] hover:text-white transition disabled:opacity-50">{voteBusy===ev.id+"CANCEL" ? "…" : "Skip"}</button>
                    </div>
                    <span className="font-mono text-[11px] text-slate-600">via /api/verify</span>
                  </div>
                </div>
                {/* bottom fading bar mirror (progress) */}
                <div className="h-1 bg-white/[0.03]">
                  <div className={`h-full ${progressColor} opacity-60`} style={{ width:`${pctLeft}%`}} />
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-center">
        <a href="/terms" className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 font-mono text-[11px] font-medium text-amber-200 hover:bg-amber-400/15 transition">Advisory · TEST-PHYSI no cash value — see Terms →</a>
      </div>

      {toast && <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-full border border-white/10 bg-[#0f172a] px-4 py-2 text-[13px] font-medium text-white shadow-[0_8px_30px_rgba(0,0,0,0.5)]">{toast}</div>}
    </div>
  );
}
