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
  const rawView = sp.get("view");
  const view = rawView === "list" ? "list" : rawView === "consensus" ? "consensus" : "map";
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

  const setView = (v: string) => {
    const p = new URLSearchParams(sp.toString()); p.set("view", v); router.replace(`/app/roadmap?${p.toString()}`);
  };
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
    if (!form.title || !form.venue || !form.event_date || !form.event_time) { setToast("Fill title, venue, date and time"); return; }
    setPosting(true); setDupHint(null);
    try {
      const r = await fetch("/api/timetable", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: form.title.trim(), venue: form.venue.trim(), event_date: form.event_date, event_time: form.event_time, scope_type: form.scope_type, scope_value: form.scope_value || null, prof_name: form.prof_name.trim() || null, severity: form.severity, created_by: getProfileId() }) });
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
        <button onClick={()=>setShowPost(v=>!v)} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-white px-6 min-h-[44px] text-sm font-semibold text-[#070a12] shadow-lg hover:bg-slate-100 transition">
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

      {/* Search + filters + view toggle — breathable, 44px touch targets */}
      <div className="mt-5 flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search courses, venues…" className="w-full rounded-full border border-white/10 bg-white/[0.04] py-3 pl-10 pr-4 text-sm text-white placeholder:text-slate-400 focus:border-white/15 focus:outline-none" />
          </div>
          <div className="flex items-center gap-1.5">
            {[
              { k:"all", label:"All" }, { k:"advisory", label:"Advisory" }, { k:"verified", label:"Green" }
            ].map(f=> (
              <button key={f.k} onClick={()=>setFilterParam(f.k)} className={`min-h-[40px] rounded-full px-4 text-sm font-medium transition ${filter===f.k ? "bg-white text-[#070a12]" : "border border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.07]"}`}>{f.label}</button>
            ))}
          </div>
        </div>
        <div className="flex w-fit items-center rounded-full border border-white/10 bg-white/[0.04] p-1">
          <button onClick={()=>setView("map")} className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-4 text-sm font-medium transition ${view==="map" ? "bg-white text-[#070a12]" : "text-slate-400 hover:text-white"}`}><MapIcon className="h-3.5 w-3.5" /> Map</button>
          <button onClick={()=>setView("list")} className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-4 text-sm font-medium transition ${view==="list" ? "bg-white text-[#070a12]" : "text-slate-400 hover:text-white"}`}><List className="h-3.5 w-3.5" /> List</button>
          <button onClick={()=>setView("consensus")} className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-4 text-sm font-medium transition ${view==="consensus" ? "bg-white text-[#070a12]" : "text-slate-400 hover:text-white"}`}><GitMerge className="h-3.5 w-3.5" /> Consensus</button>
        </div>
      </div>

      {/* Post form — disclosure, not always open */}
      {showPost && (
        <form onSubmit={handlePost} className="mt-4 rounded-[20px] border border-white/[0.07] bg-white/[0.04] p-5 backdrop-blur sm:p-6">
          <h3 className="text-sm font-semibold text-white">Post what you heard — keep it honest</h3>
          <p className="mt-1 text-sm text-slate-400">Example: “ANA 203 moved to LT2, Friday 8am — HOD announced after lab.”</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="space-y-1"><span className="font-mono text-xs text-slate-500">What</span><input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="ANA 203 — Osteology" className="w-full rounded-xl border border-white/10 bg-[#0b1020] px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-white/15 focus:outline-none" />
              {autoTitleHint && !form.title && <button type="button" onClick={()=>setForm(f=>({...f,title:autoTitleHint}))} className="mt-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 font-mono text-xs text-emerald-300 hover:bg-emerald-500 hover:text-white">Auto-suggest: {autoTitleHint} → use?</button>}
            </label>
            <label className="space-y-1"><span className="font-mono text-xs text-slate-500">Where</span>
              <div className="flex gap-1">
                <select value={hallOpts.includes(form.venue) ? form.venue : ""} onChange={e=>{ if(e.target.value) setForm(f=>({...f,venue:e.target.value})); }} className="w-28 shrink-0 rounded-xl border border-white/10 bg-[#0b1020] px-2 py-2.5 text-xs text-white focus:outline-none">
                  <option value="">— hall —</option>
                  {hallOpts.map(h=> <option key={h} value={h}>{h}</option>)}
                </select>
                <input value={form.venue} onChange={e=>setForm(f=>({...f,venue:e.target.value}))} placeholder="LT2 / Anatomy Hall" className="flex-1 rounded-xl border border-white/10 bg-[#0b1020] px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-white/15 focus:outline-none" />
              </div>
            </label>
            <label className="space-y-1"><span className="font-mono text-xs text-slate-500">Date (WAT)</span><input type="date" value={form.event_date} onChange={e=>setForm(f=>({...f,event_date:e.target.value}))} className="w-full rounded-xl border border-white/10 bg-[#0b1020] px-3 py-2.5 text-sm text-white focus:outline-none" /></label>
            <label className="space-y-1"><span className="font-mono text-xs text-slate-500">Time (WAT)</span><input type="time" value={form.event_time} onChange={e=>setForm(f=>({...f,event_time:e.target.value}))} className="w-full rounded-xl border border-white/10 bg-[#0b1020] px-3 py-2.5 text-sm text-white focus:outline-none" /></label>
            <label className="space-y-1"><span className="font-mono text-xs text-slate-500">Who needs this</span>
              <select value={form.scope_type} onChange={e=>setForm(f=>({...f,scope_type:e.target.value}))} className="w-full rounded-xl border border-white/10 bg-[#0b1020] px-3 py-2.5 text-sm text-white focus:outline-none">
                <option value="general">Everyone</option><option value="level">One level</option><option value="group">Group / dept</option>
              </select>
            </label>
            <label className="space-y-1"><span className="font-mono text-xs text-slate-500">Scope detail</span><input value={form.scope_value} onChange={e=>setForm(f=>({...f,scope_value:e.target.value}))} placeholder="200L or Physiology" className="w-full rounded-xl border border-white/10 bg-[#0b1020] px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none" /></label>
            <label className="space-y-1"><span className="font-mono text-xs text-slate-500">Prof (optional)</span><input value={form.prof_name} onChange={e=>setForm(f=>({...f,prof_name:e.target.value}))} placeholder="Prof Adams" className="w-full rounded-xl border border-white/10 bg-[#0b1020] px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none" /></label>
            <label className="space-y-1"><span className="font-mono text-xs text-slate-500">Type</span>
              <select value={form.severity} onChange={e=>setForm(f=>({...f,severity:e.target.value as any}))} className="w-full rounded-xl border border-white/10 bg-[#0b1020] px-3 py-2.5 text-sm text-white focus:outline-none">
                <option value="move">move (hall changed)</option><option value="shift">shift (time changed)</option><option value="cancelled">cancelled</option>
              </select>
            </label>
          </div>
          {dupHint && (
            <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3">
              <p className="text-sm font-medium text-amber-200">Looks like duplicate — merge?</p>
              <p className="mt-1 font-mono text-xs text-amber-200/70">{dupHint.hint || dupHint.message || "An event with same title + venue exists within 7 days."}</p>
              {dupHint.existing && <p className="mt-1 font-mono text-xs text-slate-400">{dupHint.existing.title} @ {dupHint.existing.venue} · {String(dupHint.existing.event_date).slice(0,10)}</p>}
              {dupHint.canonicalVenue && <button type="button" onClick={()=>setForm(f=>({...f,venue:dupHint.canonicalVenue}))} className="mt-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#070a12]">Use canonical: {dupHint.canonicalVenue}</button>}
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={async()=>{
                  // force create despite duplicate
                  setPosting(true);
                  try{
                    const r=await fetch("/api/timetable",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({title:form.title.trim(),venue:form.venue.trim(),event_date:form.event_date,event_time:form.event_time,scope_type:form.scope_type,scope_value:form.scope_value||null,prof_name:form.prof_name.trim()||null,severity:form.severity,created_by:getProfileId(),force:true})});
                    const j=await r.json(); if(!r.ok||j.ok===false) throw new Error(j.error||j.message||"post failed");
                    setToast("Posted despite duplicate ✓"); setDupHint(null); setShowPost(false); fetchFeed();
                  }catch(e:any){ setToast(e.message);}finally{ setPosting(false);}
                }} className="rounded-full border border-white/20 px-3 py-1 text-xs text-white hover:bg-white hover:text-[#070a12]">Post anyway</button>
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
            <button disabled={posting} className="min-h-[44px] rounded-full bg-white px-7 text-sm font-semibold text-[#070a12] hover:bg-slate-100 disabled:opacity-50 transition">{posting ? "Posting…" : "Post as advisory →"}</button>
            <button type="button" onClick={()=>setShowPost(false)} className="min-h-[44px] rounded-full border border-white/10 bg-white/[0.04] px-6 text-sm text-slate-300">Cancel</button>
          </div>
        </form>
      )}

      {/* Consensus — full on consensus tab, compact disclosure on map/list to reduce clutter */}
      {view === "consensus" ? (
        <div className="mt-6">
          <ConsensusMap />
        </div>
      ) : (
        <details className="mt-6 group rounded-[20px] border border-white/[0.06] bg-white/[0.02] open:bg-white/[0.03] open:border-white/[0.07]">
          <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4">
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-violet-400 animate-pulse" />
              <span className="text-sm font-semibold text-white">Consensus · pending decisions</span>
              <span className="hidden sm:inline font-mono text-xs text-slate-400">halls · lecturers · courses</span>
            </span>
            <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 font-mono text-xs text-slate-400 group-open:hidden">Show <span aria-hidden>▾</span></span>
            <span className="hidden items-center gap-1.5 rounded-full bg-white px-3 py-1 font-mono text-xs font-semibold text-[#070a12] group-open:inline-flex">Hide <span aria-hidden>▴</span></span>
          </summary>
          <div className="border-t border-white/[0.06] p-2 sm:p-3">
            <ConsensusMap />
          </div>
        </details>
      )}

      {/* Content — hidden when on consensus tab (events shown separately) */}
      {view === "consensus" ? null : loading ? (
        view==="map" ? <MapSkeleton /> : <RoadSkeleton />
      ) : err ? (
        <div className="mt-6 rounded-2xl border border-red-500/15 bg-red-500/10 px-4 py-4 text-sm text-red-200">{err} <button onClick={fetchFeed} className="ml-2 underline">Retry</button></div>
      ) : filtered.length===0 ? (
        <div className="mt-6 rounded-[20px] border border-dashed border-white/10 bg-white/[0.02] px-6 py-12 text-center">
          <p className="font-semibold text-white">No results</p>
          <p className="mt-1 text-sm text-slate-500">Try a different filter or post the first gist.</p>
          <button onClick={()=>setShowPost(true)} className="mt-4 rounded-full bg-white px-5 py-2 text-sm font-semibold text-[#070a12]">Post gist →</button>
        </div>
      ) : view==="map" ? (
        <div className="mt-6">
          {/* Minimal map — winding road SVG, nodes */}
          <div className="overflow-hidden rounded-[20px] border border-white/[0.07] bg-gradient-to-br from-[#0d3b2a] via-[#143d2e] to-[#1a5c3a] p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <p className="font-mono text-xs uppercase tracking-[0.12em] text-emerald-200/70">Endless road · WAT</p>
              <span className="rounded-full bg-white px-3 py-1 font-mono text-xs font-bold text-[#070a12]">{filtered.length} nodes</span>
            </div>
            <div className="relative mt-4 -mx-1 overflow-x-auto no-scrollbar sm:mx-0">
              <svg viewBox="0 0 640 170" className="h-[140px] w-full min-w-[520px] sm:h-[150px]" role="img" aria-label="Road">
                <defs>
                  <linearGradient id="roadGrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#6e45d0"/><stop offset="50%" stopColor="#8b5cf6"/><stop offset="100%" stopColor="#a78bfa"/></linearGradient>
                </defs>
                {(() => {
                  const d = "M 24 120 C 150 120, 150 36, 280 36 C 410 36, 410 120, 540 120 C 590 120, 620 110, 640 104";
                  return (<g>
                    <path d={d} fill="none" stroke="#1a1033" strokeWidth={30} strokeLinecap="round" opacity={0.9} />
                    <path d={d} fill="none" stroke="url(#roadGrad)" strokeWidth={24} strokeLinecap="round" />
                    <path d={d} fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeDasharray="10 10" opacity={0.9} />
                  </g>);
                })()}
                {filtered.slice(0,6).map((ev,i) => {
                  const xs = [90, 200, 310, 420, 520, 600];
                  const ys = [96, 44, 36, 72, 120, 108];
                  const x = xs[i % xs.length], y = ys[i % ys.length];
                  const v = isVerified(ev), p = pctOf(ev);
                  const isSelected = selectedId===ev.id;
                  return (
                    <g key={ev.id} onClick={()=>setSelectedId(ev.id)} className="cursor-pointer">
                      {isSelected && <circle cx={x} cy={y} r={28} fill="none" stroke="white" strokeWidth={1.5} opacity={0.5} />}
                      <circle cx={x} cy={y+3} r={18} fill="black" opacity={0.25} />
                      <circle cx={x} cy={y} r={17} fill={v ? "#ecfdf5" : "#fffbeb"} stroke={v ? "#10b981" : "#f59e0b"} strokeWidth={2} />
                      <text x={x} y={y+4} textAnchor="middle" fontSize={10} fontWeight={800} fill={v ? "#065f46" : "#92400e"}>{v ? "✓" : "●"}</text>
                      <g>
                        <rect x={x-36} y={y-38} width={72} height={16} rx={8} fill={v ? "white" : "rgba(0,0,0,0.65)"} stroke={v ? "#10b981" : "rgba(255,255,255,0.15)"} />
                        <text x={x} y={y-27} textAnchor="middle" fontSize={7} fontWeight={800} fill={v ? "#065f46" : "white"}>{ev.title.slice(0,14)}</text>
                      </g>
                      {p >= 85 && !v && <g><rect x={x-18} y={y+14} width={36} height={10} rx={5} fill="#f59e0b" /><text x={x} y={y+21.5} textAnchor="middle" fontSize={6} fontWeight={800} fill="white">{p}%</text></g>}
                    </g>
                  );
                })}
              </svg>
            </div>
            <p className="mt-2 text-center font-mono text-xs text-emerald-100/50">Tap a node to verify · {stats.verified} green · {stats.advisory} advisory</p>
          </div>

          {/* Selected detail */}
          {selected && (
            <div className="mt-4 rounded-2xl border border-white/[0.07] bg-white/[0.04] p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">{selected.title}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-400"><span className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2.5 py-1 text-xs text-slate-200"><MapPin className="h-3 w-3" />{selected.venue}</span><span className="inline-flex items-center gap-1 font-mono text-xs text-slate-500"><Clock3 className="h-3 w-3" />{selected.event_date.slice(0,10)} · {String(selected.event_time).slice(0,5)} WAT</span></p>
                  <p className="mt-2 font-mono text-xs text-slate-500">{Number(selected.authority_points)}/{Number(selected.required_points) || 8} · {pctOf(selected)}% · {isVerified(selected) ? "verified ✓" : "advisory"}</p>
                </div>
                <button onClick={()=>setSelectedId(null)} className="rounded-full border border-white/10 bg-white/[0.04] p-2 text-slate-400 hover:text-white"><X className="h-4 w-4" /></button>
              </div>
              <div className="mt-3 hidden h-1.5 overflow-hidden rounded-full bg-white/10 sm:flex"><div className={`h-full rounded-full ${isVerified(selected) ? "bg-emerald-400" : "bg-amber-400"}`} style={{ width: `${pctOf(selected)}%`}} /></div>
              <div className="mt-3"><EchoRing eventId={selected.id} /></div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button onClick={()=>vote(selected.id,"YES")} disabled={!!voteBusy} className="min-h-[44px] rounded-full bg-emerald-500 px-6 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50">{voteBusy===selected.id+"YES" ? "…" : "Yes ✓"}</button>
                <button onClick={()=>vote(selected.id,"NO")} disabled={!!voteBusy} className="min-h-[44px] rounded-full border border-white/10 bg-white/[0.05] px-6 text-sm font-medium text-slate-200 hover:bg-white hover:text-[#070a12] disabled:opacity-50">{voteBusy===selected.id+"NO" ? "…" : "No ✕"}</button>
                <button onClick={()=>vote(selected.id,"CANCEL")} disabled={!!voteBusy} className="min-h-[44px] rounded-full border border-white/10 bg-white/[0.02] px-6 text-sm text-slate-400 hover:bg-white/[0.06] disabled:opacity-50">Skip</button>
                {myWeightLabel && <span className="ml-1 self-center"><VoteWeightBadge weight={myWeight} label={myWeightLabel} /></span>}
              </div>
            </div>
          )}

          {/* List fallback below map — compact */}
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {filtered.slice(0,8).map(ev=> {
              const v = isVerified(ev), p = pctOf(ev);
              return (
                <div key={ev.id} onClick={()=>setSelectedId(ev.id)} className={`cursor-pointer rounded-2xl border bg-white/[0.03] p-4 transition ${selectedId===ev.id ? "border-white/15 bg-white/[0.06]" : "border-white/[0.06] hover:border-white/10 hover:bg-white/[0.05]"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">{ev.title}</p>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500"><MapPin className="h-3 w-3" />{ev.venue} · {String(ev.event_time).slice(0,5)} WAT</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 font-mono text-xs font-medium ${v ? "bg-emerald-500/15 text-emerald-300" : "border border-amber-500/20 bg-amber-500/10 text-amber-300"}`}>{v ? "✓ green" : "advisory"}</span>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10"><div className={`h-full rounded-full ${v ? "bg-emerald-400" : "bg-amber-400"}`} style={{ width:`${p}%`}} /></div>
                    <span className="font-mono text-xs text-slate-500">{p}%</span>
                  </div>
                  <div className="mt-2"><EchoRing eventId={ev.id} compact /></div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {filtered.map(ev=> {
            const v = isVerified(ev), p = pctOf(ev);
            return (
              <article key={ev.id} className="overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.03]">
                <div className="p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white">{ev.title}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2 py-1 text-slate-300"><MapPin className="h-3 w-3" />{ev.venue}</span>
                        <span className="inline-flex items-center gap-1 font-mono text-xs text-slate-500"><Clock3 className="h-3 w-3" />{ev.event_date.slice(0,10)} · {String(ev.event_time).slice(0,5)} WAT</span>
                        {ev.scope_value && <span className="rounded-full border border-white/10 px-2 py-0.5 font-mono text-[11px]">{ev.scope_type} · {ev.scope_value}</span>}
                      </p>
                      <div className="mt-3 flex items-center gap-2">
                        <div className="h-1.5 flex-1 max-w-[200px] overflow-hidden rounded-full bg-white/10"><div className={`h-full rounded-full ${v ? "bg-emerald-400" : "bg-amber-400"}`} style={{ width:`${p}%`}} /></div>
                        <span className="font-mono text-xs text-slate-500">{Number(ev.authority_points)}/{Number(ev.required_points)||8} · {p}%</span>
                        {v ? <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-mono text-xs text-emerald-300">✓ green</span> : <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 font-mono text-xs text-amber-300">advisory</span>}
                      </div>
                      <div className="mt-2"><EchoRing eventId={ev.id} compact /></div>
                    </div>
                    <span className={`hidden sm:inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${v ? "bg-emerald-500 text-white" : "bg-amber-500 text-white"}`}>{v ? "✓" : "●"}</span>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-xs uppercase tracking-wide text-slate-400">Were you there?</span>
                    <button onClick={()=>vote(ev.id,"YES")} disabled={!!voteBusy} className="min-h-[40px] rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 text-sm font-medium text-emerald-300 hover:bg-emerald-500 hover:text-white disabled:opacity-50">{voteBusy===ev.id+"YES" ? "…" : "Yes ✓"}</button>
                    <button onClick={()=>vote(ev.id,"NO")} disabled={!!voteBusy} className="min-h-[40px] rounded-full border border-white/10 bg-white/[0.04] px-4 text-sm text-slate-200 hover:bg-white hover:text-[#070a12] disabled:opacity-50">{voteBusy===ev.id+"NO" ? "…" : "No ✕"}</button>
                    <button onClick={()=>vote(ev.id,"CANCEL")} disabled={!!voteBusy} className="min-h-[40px] rounded-full border border-white/10 bg-white/[0.02] px-4 text-sm text-slate-400 hover:bg-white/[0.06] disabled:opacity-50">Skip</button>
                    {myWeightLabel && <VoteWeightBadge weight={myWeight} label={myWeightLabel} />}
                  </div>
                </div>
                <div className="h-1 bg-white/[0.04]"><div className={`h-full ${v ? "bg-emerald-400" : "bg-amber-400/60"}`} style={{ width:`${p}%`}} /></div>
              </article>
            );
          })}
        </div>
      )}

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
                <button type="submit" disabled={pickerBusy} className="flex-1 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-[#070a12] hover:bg-slate-100 disabled:opacity-50">{pickerBusy ? "Creating…" : "Create & verify →"}</button>
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
