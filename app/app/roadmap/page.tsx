"use client";
import { useEffect, useState, useCallback, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Search, Plus, X, Map as MapIcon, List, Clock3, MapPin, GitMerge } from "lucide-react";
import Onboarding from "@/components/Onboarding";
import { RoadSkeleton, MapSkeleton } from "@/components/Skeletons";
import { useVoteWeight } from "@/hooks/useVoteWeight";
import { VoteWeightBadge } from "@/components/VoteWeightBadge";
import ConsensusMap from "@/components/road/ConsensusMap";
import { EchoRing } from "@/components/road/EchoRing";

type EventRow = {
  id: string; title: string; venue: string; event_date: string; event_time: string;
  scope_type: string; scope_value: string | null; status: string;
  authority_points: number | string; required_points: number | string;
  created_at: string; created_by?: string | null;
  slot_key?: string; vote_weight_yes?: number; vote_weight_no?: number;
  tally_text?: string; progress_pct?: number; contenders?: any[]; venue_options?: string[]; group_size?: number; is_grouped?: boolean;
};

function isVerified(ev: EventRow) {
  if (ev.status === "verified") return true;
  const ap = Number(ev.authority_points ?? 0), rp = Number(ev.required_points ?? 0);
  return rp > 0 && ap >= rp;
}
function pctOf(ev: EventRow) {
  const ap = Number(ev.authority_points ?? 0), rp = Number(ev.required_points ?? 0);
  if (rp <= 0) return isVerified(ev) ? 100 : 0;
  return Math.min(100, Math.round((ap / rp) * 100));
}

export default function RoadmapPage() {
  return <Suspense fallback={<div className="mx-auto max-w-[1280px] px-4 py-10"><div className="h-32 animate-pulse rounded-2xl bg-white/[0.04]" /></div>}><RoadmapInner /></Suspense>;
}
function RoadmapInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const filterParam = sp.get("filter") || "all";

  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState(filterParam);
  const [showPost, setShowPost] = useState(false);
  const [posting, setPosting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [voteBusy, setVoteBusy] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", venue: "", event_date: "", event_time: "", scope_type: "general", scope_value: "", prof_name: "", severity: "move" as "move"|"shift"|"cancelled" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerHandle, setPickerHandle] = useState("");
  const [pickerBusy, setPickerBusy] = useState(false);
  const [pickerErr, setPickerErr] = useState<string | null>(null);
  const [pendingVote, setPendingVote] = useState<{ id: string; v: "YES"|"NO"|"CANCEL" } | null>(null);
  const [hallOpts, setHallOpts] = useState<string[]>([]);
  const [repeatBusy, setRepeatBusy] = useState(false);
  const [dupHint, setDupHint] = useState<any>(null);
  const [autoTitleHint, setAutoTitleHint] = useState<string|null>(null);
  const [myPid, setMyPid] = useState<string|null>(null);
  useEffect(()=>{ try{ const r=localStorage.getItem("physi_profile"); setMyPid(r?JSON.parse(r)?.id:null);}catch{} },[]);
  const { weight: myWeight, label: myWeightLabel } = useVoteWeight(myPid);

  const fetchFeed = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const r = await fetch("/api/timetable", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || j.ok === false) throw new Error(j.error || "couldn't load");
      setEvents(j.events ?? []);
    } catch (e: any) { setErr(e.message || "couldn't load"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchFeed(); const iv = setInterval(fetchFeed, 15000); return () => clearInterval(iv); }, [fetchFeed]);
  useEffect(() => { if (!toast) return; const t = setTimeout(()=>setToast(null), 2600); return ()=>clearTimeout(t); }, [toast]);
  useEffect(() => { setFilter(filterParam); }, [filterParam]);
  // consensus map → needs profile / toast bridge
  useEffect(() => {
    const onNeed = () => { setPickerHandle(""); setPickerErr(null); setPickerOpen(true); };
    const onToast = (e: any) => setToast(String(e.detail ?? "vote failed"));
    window.addEventListener("physi-needs-profile", onNeed as any);
    window.addEventListener("physi-toast", onToast as any);
    return () => {
      window.removeEventListener("physi-needs-profile", onNeed as any);
      window.removeEventListener("physi-toast", onToast as any);
    };
  }, []);
  // smart hall dropdown: resolved canonical halls for this programme/level
  useEffect(() => {
    const prog = (form.scope_value || "Physiology").split(",")[0]?.trim() || "Physiology";
    const lvl = form.scope_value || "";
    const qs = new URLSearchParams(); qs.set("status","resolved"); if(prog) qs.set("programme", prog);
    fetch(`/api/halls/alias?${qs.toString()}`,{cache:"no-store"}).then(r=>r.json()).then(j=>{
      const opts = Array.from(new Set((j.proposals||[]).map((x:any)=>String(x.canonical||x.alias).trim()).filter(Boolean))) as string[];
      if(opts.length) setHallOpts(opts);
      else setHallOpts(["LT1","LT2","Hall B","Anatomy Hall","New Lab","LT3","200L Hall"]);
    }).catch(()=> setHallOpts(["LT1","LT2","Hall B","Anatomy Hall"]));
  }, [form.scope_value]);

  const setFilterParam = (f: string) => {
    setFilter(f);
    const p = new URLSearchParams(sp.toString()); p.set("filter", f); router.replace(`/app/roadmap?${p.toString()}`);
  };

  const filtered = useMemo(() => {
    let r = events;
    if (filter === "verified") r = r.filter(isVerified);
    else if (filter === "advisory") r = r.filter(e => !isVerified(e));
    if (q.trim()) {
      const qq = q.toLowerCase();
      r = r.filter(e => `${e.title} ${e.venue} ${e.scope_value ?? ""}`.toLowerCase().includes(qq));
    }
    return [...r].sort((a,b)=> new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [events, filter, q]);

  const stats = useMemo(() => {
    const total = events.length, verified = events.filter(isVerified).length;
    return { total, verified, advisory: total - verified };
  }, [events]);

  async function handlePost(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title || !form.venue) { setToast("Tell us what and where"); return; }
    // 2-field post: auto-fill date/time if empty (student-native — no extra steps)
    let d = form.event_date; let t = form.event_time;
    if (!d) { const now=new Date(); const pad=(n:number)=>String(n).padStart(2,"0"); d=`${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`; }
    if (!t) t="08:00";
    setPosting(true); setDupHint(null);
    try {
      const r = await fetch("/api/timetable", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: form.title.trim(), venue: form.venue.trim(), event_date: d, event_time: t, scope_type: form.scope_type || "general", scope_value: form.scope_value || null, prof_name: form.prof_name.trim() || null, severity: form.severity, created_by: getProfileId() }) });
      const j = await r.json();
      if (j.code==="DUPLICATE_SUGGESTION" || r.status===409) {
        setDupHint(j.duplicate_suggestion || j);
        setToast(j.duplicate_suggestion?.hint || j.merge_hint || "Looks like duplicate — merge?");
        return;
      }
      if (!r.ok || j.ok===false) throw new Error(j.error || j.message || "post failed");
      try { const { autoBumpStreak } = await import("@/lib/streak"); autoBumpStreak("event_post"); } catch {}
      setToast("Posted — live as advisory ✓"); setForm({ title:"", venue:"", event_date:"", event_time:"", scope_type:"general", scope_value:"", prof_name:"", severity:"move" }); setDupHint(null); setShowPost(false); fetchFeed();
    } catch (e: any) { setToast(e.message); } finally { setPosting(false); }
  }

  // pre-check duplicate + auto-suggest when form changes
  useEffect(()=>{
    if (!form.title || !form.venue || !form.event_date) { setDupHint(null); return; }
    const t = setTimeout(async()=>{
      try {
        const qs=new URLSearchParams({ title: form.title.trim(), venue: form.venue.trim(), event_date: form.event_date });
        const r=await fetch(`/api/events/dedup?${qs.toString()}`,{cache:"no-store"});
        const j=await r.json();
        if (j.duplicate) setDupHint(j.duplicate_suggestion);
        else setDupHint(null);
      } catch {}
    }, 450);
    return ()=>clearTimeout(t);
  },[form.title, form.venue, form.event_date]);

  useEffect(()=>{
    if (!form.scope_value) { setAutoTitleHint(null); return; }
    if (form.title) return; // don't override if user already typed title
    const t=setTimeout(async()=>{
      try{
        const r=await fetch(`/api/events/dedup?scope_value=${encodeURIComponent(form.scope_value)}`,{cache:"no-store"});
        const j=await r.json();
        if (j.autoTitle) setAutoTitleHint(j.autoTitle);
      }catch{}
    },300);
    return ()=>clearTimeout(t);
  },[form.scope_value, form.title]);

  async function repeatLastWeek() {
    const pid = getProfileId();
    if (!pid) { setToast("Create a profile first"); setPickerOpen(true); return; }
    setRepeatBusy(true);
    try {
      const r = await fetch("/api/events/repeat", { method:"POST", headers:{ "content-type":"application/json" }, body: JSON.stringify({ user_id: pid, scope_value: form.scope_value || null }) });
      const j = await r.json(); if (!r.ok || j.ok===false) throw new Error(j?.message || j?.error || "repeat failed");
      try { const { autoBumpStreak } = await import("@/lib/streak"); autoBumpStreak("event_post"); } catch {}
      setToast(j.created ? `Repeated ${j.created} events → next week ✓` : "Nothing to repeat — post one first");
      fetchFeed();
    } catch (e:any){ setToast(e.message); } finally { setRepeatBusy(false); }
  }

  function sameAsLastMonday() {
    const last = [...events].sort((a,b)=> new Date(b.created_at).getTime()-new Date(a.created_at).getTime())[0];
    if (!last) { setToast("No previous event yet — fill manually"); return; }
    // find event from same weekday as last Monday (or last same title)
    const lastDate = new Date(last.event_date + "T00:00:00");
    const nextDate = new Date();
    // compute next occurrence of that weekday
    const targetDay = lastDate.getDay();
    const curDay = nextDate.getDay();
    let diff = targetDay - curDay;
    if (diff <= 0) diff += 7;
    nextDate.setDate(nextDate.getDate() + diff);
    const pad = (n:number)=>String(n).padStart(2,"0");
    const iso = `${nextDate.getFullYear()}-${pad(nextDate.getMonth()+1)}-${pad(nextDate.getDate())}`;
    setForm(f=> ({ ...f, title: last.title, venue: last.venue, scope_type: last.scope_type, scope_value: last.scope_value || "", event_date: iso, event_time: String(last.event_time).slice(0,5), prof_name: (last as any).prof_name || "" }));
    setToast(`Copied "${last.title}" → ${iso} — edit and post`);
  }

  function getProfileId(): string | null {
    try { const raw = localStorage.getItem("physi_profile"); if (raw) return JSON.parse(raw)?.id ?? null; } catch {}
    return null;
  }

  async function vote(id: string, v: "YES"|"NO"|"CANCEL") {
    const pid = getProfileId();
    if (!pid) { setPendingVote({ id, v }); setPickerHandle(""); setPickerErr(null); setPickerOpen(true); return; }
    setVoteBusy(id+v);
    try {
      const r = await fetch("/api/verify", { method:"POST", headers:{ "content-type":"application/json" }, body: JSON.stringify({ verifier_id: pid, event_id: id, vote: v }) });
      const j = await r.json(); if (!r.ok || j.ok===false) throw new Error(j.error || "vote failed");
      try { const { autoBumpStreak } = await import("@/lib/streak"); autoBumpStreak("verify"); } catch {}
      setToast(v==="YES" ? "You confirmed — thanks!" : v==="NO" ? "Marked not there" : "Skipped");
      fetchFeed();
    } catch (e: any) { setToast(e.message); } finally { setVoteBusy(null); }
  }


  async function handlePickerConfirm(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const h = pickerHandle.trim().toLowerCase().replace(/[^a-z0-9_]/g,"").slice(0,20);
    if (!h || h.length < 2) { setPickerErr("Pick a handle — 2+ chars"); return; }
    setPickerBusy(true); setPickerErr(null);
    try {
      const r = await fetch("/api/profile", { method:"POST", headers:{ "content-type":"application/json" }, body: JSON.stringify({ nickname: h, full_name: h, programme: "Physiology", level: "100L", statuses: [], authority_base: 1, authority_final: 1 }) });
      const j = await r.json(); if (!r.ok || j.ok===false) throw new Error(j.error || "handle taken — try another");
      localStorage.setItem("physi_profile", JSON.stringify(j.user));
      setPickerOpen(false); setToast(`Welcome @${h} ✓`);
      if (pendingVote) { const { id, v } = pendingVote as any; setPendingVote(null); setTimeout(()=> vote(id, v), 300);
      }
    } catch (e: any) { setPickerErr(e.message); } finally { setPickerBusy(false); }
  }

  const selected = selectedId ? events.find(e=> e.id===selectedId) : null;

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8">
      <Onboarding />
      {/* Header — one clear title, single primary action */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.12em] text-slate-400">Road · live timetable · WAT</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-[26px]">Where&apos;s class today?</h1>
          <p className="mt-1.5 max-w-[560px] text-sm leading-5 text-slate-400">Post what you hear. Tap Yes if you were there — green tick when your coursemates confirm.</p>
        </div>
        <button onClick={()=>setShowPost(v=>!v)} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-white px-6 min-h-[44px] text-sm font-semibold text-[#022c1e] shadow-lg hover:bg-slate-100 transition">
          <Plus className="h-4 w-4" /> {showPost ? "Close" : "Post gist"}
        </button>
      </div>

      {/* Stats — minimal, breathable */}
      <div className="mt-5 grid grid-cols-3 gap-3">
        {[
          { label:"Live", value: stats.total, sub:"entries" },
          { label:"Green tick", value: stats.verified, sub:"confirmed", accent:"text-emerald-300" },
          { label:"Advisory", value: stats.advisory, sub:"awaiting", accent:"text-amber-300" },
        ].map(s=> (
          <div key={s.label} className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-3.5">
            <p className="font-mono text-[11px] uppercase tracking-wide text-slate-400">{s.label}</p>
            <p className={`mt-1 text-xl font-bold tracking-tight ${s.accent ?? "text-white"}`}>{s.value}</p>
            <p className="font-mono text-xs text-slate-400">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Search + filters — student-native, no jargon chooser */}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search courses, halls…" className="w-full rounded-full border border-white/10 bg-white/[0.04] py-3 pl-10 pr-4 text-sm text-white placeholder:text-slate-400 focus:border-white/15 focus:outline-none" />
        </div>
        <div className="flex items-center gap-1.5">
          {[
            { k:"all", label:"All" }, { k:"advisory", label:"Needs help" }, { k:"verified", label:"Confirmed" }
          ].map(f=> (
            <button key={f.k} onClick={()=>setFilterParam(f.k)} className={`min-h-[40px] rounded-full px-4 text-sm font-medium transition ${filter===f.k ? "bg-white text-[#022c1e]" : "border border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.07]"}`}>{f.label}</button>
          ))}
        </div>
      </div>

      {/* Post form — disclosure, not always open */}
      {showPost && (
        <form onSubmit={handlePost} className="mt-4 rounded-[20px] border border-white/[0.07] bg-white/[0.04] p-5 backdrop-blur sm:p-6">
          <h3 className="text-sm font-semibold text-white">Post what you heard — keep it honest</h3>
          <p className="mt-1 text-sm text-slate-400">Example: “ANA 203 moved to LT2, Friday 8am — HOD announced after lab.”</p>
          {/* 2-field post: what → where (student-native) */}
          <div className="mt-4 grid gap-3 sm:grid-cols-[1.5fr_1fr]">
            <label className="space-y-1"><span className="font-mono text-xs font-semibold text-white">What</span><input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="ANA 203 — Osteology" className="w-full rounded-xl border border-white/10 bg-[#0b1020] px-3 py-3 text-sm text-white placeholder:text-slate-500 focus:border-white/15 focus:outline-none" />
              {autoTitleHint && !form.title && <button type="button" onClick={()=>setForm(f=>({...f,title:autoTitleHint}))} className="mt-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 font-mono text-xs text-emerald-300 hover:bg-emerald-500 hover:text-white">Suggestion: {autoTitleHint} → use?</button>}
            </label>
            <label className="space-y-1"><span className="font-mono text-xs font-semibold text-white">Where</span>
              <div className="flex gap-1">
                <select value={hallOpts.includes(form.venue) ? form.venue : ""} onChange={e=>{ if(e.target.value) setForm(f=>({...f,venue:e.target.value})); }} className="w-24 shrink-0 rounded-xl border border-white/10 bg-[#0b1020] px-2 py-3 text-xs text-white focus:outline-none">
                  <option value="">— hall —</option>
                  {hallOpts.map(h=> <option key={h} value={h}>{h}</option>)}
                </select>
                <input value={form.venue} onChange={e=>setForm(f=>({...f,venue:e.target.value}))} placeholder="LT2" className="flex-1 rounded-xl border border-white/10 bg-[#0b1020] px-3 py-3 text-sm text-white placeholder:text-slate-500 focus:border-white/15 focus:outline-none" />
              </div>
            </label>
          </div>
          <details className="mt-3 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2">
            <summary className="cursor-pointer font-mono text-xs text-slate-400">More details (optional)</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="space-y-1"><span className="font-mono text-xs text-slate-500">Date</span><input type="date" value={form.event_date} onChange={e=>setForm(f=>({...f,event_date:e.target.value}))} className="w-full rounded-xl border border-white/10 bg-[#0b1020] px-3 py-2.5 text-sm text-white focus:outline-none" /></label>
              <label className="space-y-1"><span className="font-mono text-xs text-slate-500">Time</span><input type="time" value={form.event_time} onChange={e=>setForm(f=>({...f,event_time:e.target.value}))} className="w-full rounded-xl border border-white/10 bg-[#0b1020] px-3 py-2.5 text-sm text-white focus:outline-none" /></label>
            </div>
          </details>
          {dupHint && (
            <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3">
              <p className="text-sm font-medium text-amber-200">Looks like duplicate — merge?</p>
              <p className="mt-1 font-mono text-xs text-amber-200/70">{dupHint.hint || dupHint.message || "An event with same title + venue exists within 7 days."}</p>
              {dupHint.existing && <p className="mt-1 font-mono text-xs text-slate-400">{dupHint.existing.title} @ {dupHint.existing.venue} · {String(dupHint.existing.event_date).slice(0,10)}</p>}
              {dupHint.canonicalVenue && <button type="button" onClick={()=>setForm(f=>({...f,venue:dupHint.canonicalVenue}))} className="mt-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#022c1e]">Use canonical: {dupHint.canonicalVenue}</button>}
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={async()=>{
                  // force create despite duplicate
                  setPosting(true);
                  try{
                    const r=await fetch("/api/timetable",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({title:form.title.trim(),venue:form.venue.trim(),event_date:form.event_date,event_time:form.event_time,scope_type:form.scope_type,scope_value:form.scope_value||null,prof_name:form.prof_name.trim()||null,severity:form.severity,created_by:getProfileId(),force:true})});
                    const j=await r.json(); if(!r.ok||j.ok===false) throw new Error(j.error||j.message||"post failed");
                    setToast("Posted despite duplicate ✓"); setDupHint(null); setShowPost(false); fetchFeed();
                  }catch(e:any){ setToast(e.message);}finally{ setPosting(false);}
                }} className="rounded-full border border-white/20 px-3 py-1 text-xs text-white hover:bg-white hover:text-[#022c1e]">Post anyway</button>
                <button type="button" onClick={()=>setDupHint(null)} className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-400">Dismiss</button>
              </div>
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={sameAsLastMonday} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-medium text-slate-300 hover:bg-white/[0.07]">↻ Same as Last Monday</button>
            <button type="button" onClick={repeatLastWeek} disabled={repeatBusy} className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-xs font-medium text-emerald-300 hover:bg-emerald-500 hover:text-white disabled:opacity-50">{repeatBusy?"…":"↻ Repeat last week"}</button>
            <span className="ml-1 font-mono text-xs text-slate-500">repeats all your events +7 days</span>
          </div>
          <div className="mt-4 flex gap-2">
            <button disabled={posting} className="min-h-[44px] rounded-full bg-white px-7 text-sm font-semibold text-[#022c1e] hover:bg-slate-100 disabled:opacity-50 transition">{posting ? "Posting…" : "Post as advisory →"}</button>
            <button type="button" onClick={()=>setShowPost(false)} className="min-h-[44px] rounded-full border border-white/10 bg-white/[0.04] px-6 text-sm text-slate-300">Cancel</button>
          </div>
        </form>
      )}

      {/* Programme-as-landscape: other levels toggle (student-native) */}
      <details className="mt-5 group rounded-[20px] border border-white/[0.06] bg-white/[0.02] open:bg-white/[0.03]">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3">
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-sm font-semibold text-white">More from other levels</span>
            <span className="hidden sm:inline font-mono text-xs text-slate-400">tap to explore</span>
          </span>
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 font-mono text-xs text-slate-400 group-open:hidden">Show ▾</span>
          <span className="hidden rounded-full bg-white px-3 py-1 font-mono text-xs font-semibold text-[#022c1e] group-open:inline-flex">Hide ▴</span>
        </summary>
        <div className="border-t border-white/[0.06] p-2 sm:p-3">
          <ConsensusMap />
        </div>
      </details>

      {/* One card per slot — leading hall highlighted with progress (student-native) */}
      {loading ? (
        <div className="mt-6"><RoadSkeleton /></div>
      ) : err ? (
        <div className="mt-6 rounded-2xl border border-red-500/15 bg-red-500/10 px-4 py-4 text-sm text-red-200">{err} <button onClick={fetchFeed} className="ml-2 underline">Retry</button></div>
      ) : filtered.length===0 ? (
        <div className="mt-6 rounded-[20px] border border-dashed border-white/10 bg-white/[0.02] px-6 py-12 text-center">
          <p className="font-semibold text-white">No results yet</p>
          <p className="mt-1 text-sm text-slate-500">Be the first to share where class is.</p>
          <button onClick={()=>setShowPost(true)} className="mt-4 rounded-full bg-white px-5 py-2 text-sm font-semibold text-[#022c1e]">Share gist →</button>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {filtered.map(ev=> {
            const v = isVerified(ev);
            // progress: prefer backend progress_pct / tally_text, fallback to pctOf
            const p = (ev as any).progress_pct ?? pctOf(ev);
            const tally = (ev as any).tally_text || (v ? `\u2713 Confirmed \u2014 ${Number(ev.authority_points)}/${Number(ev.required_points)||3} said yes` : `${Number(ev.authority_points)||0} of ${Number(ev.required_points)||3} said yes \u2014 needs ${Math.max(0, (Number(ev.required_points)||3)-(Number(ev.authority_points)||0))} more`);
            const contenders = (ev as any).contenders || [];
            const venueOpts = (ev as any).venue_options || [ev.venue];
            return (
              <article key={ev.id} onClick={()=>setSelectedId(ev.id)} className={`cursor-pointer overflow-hidden rounded-2xl border bg-white/[0.03] transition ${selectedId===ev.id ? "border-white/20 bg-white/[0.06]" : "border-white/[0.06] hover:border-white/10 hover:bg-white/[0.05]"}`}>
                <div className="p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white text-xs font-bold text-[#022c1e]">{String(ev.title).trim().slice(0,1).toUpperCase() || "•"}</span>
                        <p className="truncate text-sm font-semibold text-white">{ev.title}</p>
                        {(ev as any).group_size > 1 && <span className="rounded-full bg-amber-500/20 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-300">{(ev as any).group_size} halls</span>}
                      </div>
                      <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-200"><MapPin className="h-3 w-3" />{ev.venue}</span>
                        {contenders.length>0 && <span className="font-mono text-xs text-slate-500">vs {contenders.map((c:any)=>c.venue).join(", ")}</span>}
                        <span className="inline-flex items-center gap-1 font-mono text-xs text-slate-500"><Clock3 className="h-3 w-3" />{String(ev.event_date).slice(0,10)} · {String(ev.event_time).slice(0,5)}</span>
                      </p>
                      {/* Progress bar + tally — student-native */}
                      <div className="mt-3">
                        <div className="flex items-center gap-2">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10"><div className={`h-full rounded-full ${v ? "bg-emerald-400" : "bg-amber-400"}`} style={{ width:`${p}%`}} /></div>
                          <span className="font-mono text-xs font-medium text-slate-300">{p}%</span>
                        </div>
                        <p className="mt-1.5 font-mono text-xs text-slate-300">{tally}</p>
                        {venueOpts.length>1 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {venueOpts.map((ven:string)=> (
                              <span key={ven} className={`rounded-full px-2 py-0.5 font-mono text-[11px] ${ven===ev.venue ? "bg-white text-[#022c1e] font-bold" : "border border-white/10 bg-white/[0.04] text-slate-400"}`}>{ven}{ven===ev.venue?" ✓":""}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="mt-2"><EchoRing eventId={ev.id} compact /></div>
                    </div>
                    <span className={`hidden shrink-0 sm:inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${v ? "bg-emerald-500 text-white" : "bg-white/10 text-slate-300"}`}>{v ? "✓" : "•"}</span>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-xs uppercase tracking-wide text-slate-500">Were you there?</span>
                    <button onClick={(e)=>{e.stopPropagation(); vote(ev.id,"YES")}} disabled={!!voteBusy} className="min-h-[40px] rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 text-sm font-medium text-emerald-300 hover:bg-emerald-500 hover:text-white disabled:opacity-50">{voteBusy===ev.id+"YES" ? "…" : "Yes ✓"}</button>
                    <button onClick={(e)=>{e.stopPropagation(); vote(ev.id,"NO")}} disabled={!!voteBusy} className="min-h-[40px] rounded-full border border-white/10 bg-white/[0.04] px-4 text-sm text-slate-200 hover:bg-white hover:text-[#022c1e] disabled:opacity-50">{voteBusy===ev.id+"NO" ? "…" : "No ✕"}</button>
                    <button onClick={(e)=>{e.stopPropagation(); vote(ev.id,"CANCEL")}} disabled={!!voteBusy} className="min-h-[40px] rounded-full border border-white/10 bg-white/[0.02] px-4 text-sm text-slate-400 hover:bg-white/[0.06] disabled:opacity-50">Skip</button>
                    {myWeightLabel && <VoteWeightBadge weight={myWeight} label={myWeightLabel} />}
                  </div>
                  {selectedId===ev.id && (
                    <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-3">
                      <p className="font-mono text-xs text-slate-400">Hall options for this class</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {venueOpts.map((ven:string)=> <span key={ven} className={`rounded-full px-3 py-1 text-xs ${ven===ev.venue?"bg-emerald-500 text-white font-semibold":"border border-white/10 text-slate-300"}`}>{ven}</span>)}
                      </div>
                      {contenders.length>0 && <p className="mt-2 font-mono text-xs text-slate-500">{contenders.length} other {contenders.length===1?"hall":"halls"} claimed this slot — your vote picks the winner.</p>}
                    </div>
                  )}
                </div>
                <div className="h-1 bg-white/[0.04]"><div className={`h-full ${v ? "bg-emerald-400" : "bg-amber-400/60"}`} style={{ width:`${p}%`}} /></div>
              </article>
            );
          })}
        </div>
      )}

      {/* Handle picker      )}

      {/* Handle picker */}
      {pickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={()=>setPickerOpen(false)}>
          <div onClick={e=>e.stopPropagation()} className="w-full max-w-sm rounded-[20px] border border-white/10 bg-[#0c1222] p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-white">Pick a handle</h3>
            <p className="mt-1 text-sm text-slate-400">Like alex_02 — people trust a real coursemate. 2–20 chars, letters/numbers/_.</p>
            <form onSubmit={handlePickerConfirm} className="mt-4 space-y-3">
              <input value={pickerHandle} onChange={e=>setPickerHandle(e.target.value)} placeholder="alex_02" autoFocus className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-white/15 focus:outline-none" />
              {pickerErr && <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">{pickerErr}</p>}
              <div className="flex gap-2">
                <button type="submit" disabled={pickerBusy} className="flex-1 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-[#022c1e] hover:bg-slate-100 disabled:opacity-50">{pickerBusy ? "Creating…" : "Create & verify →"}</button>
                <button type="button" onClick={()=>setPickerOpen(false)} className="rounded-full border border-white/10 px-5 py-2.5 text-sm text-slate-300">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-full border border-white/10 bg-[#0c1222] px-4 py-2 text-sm font-medium text-white shadow-xl">{toast}</div>}
    </div>
  );
}
