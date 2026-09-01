"use client";
import { useEffect, useState, useCallback, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Search, Plus, Check, X, Map as MapIcon, List, Clock3, MapPin, Users } from "lucide-react";

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
  const view = sp.get("view") === "list" ? "list" : "map";
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
  const [form, setForm] = useState({ title: "", venue: "", event_date: "", event_time: "", scope_type: "general", scope_value: "" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerHandle, setPickerHandle] = useState("");
  const [pickerBusy, setPickerBusy] = useState(false);
  const [pickerErr, setPickerErr] = useState<string | null>(null);
  const pendingVoteRef = useState<{ id: string; v: "YES"|"NO"|"CANCEL" } | null>(null)[1] as any;
  const [pendingVote, setPendingVote] = pendingVoteRef as any;

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

  useEffect(() => { fetchFeed(); }, [fetchFeed]);
  useEffect(() => { if (!toast) return; const t = setTimeout(()=>setToast(null), 2600); return ()=>clearTimeout(t); }, [toast]);
  useEffect(() => { setFilter(filterParam); }, [filterParam]);

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
    setPosting(true);
    try {
      const r = await fetch("/api/timetable", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: form.title.trim(), venue: form.venue.trim(), event_date: form.event_date, event_time: form.event_time, scope_type: form.scope_type, scope_value: form.scope_value || null, status: "pending" }) });
      const j = await r.json(); if (!r.ok || j.ok===false) throw new Error(j.error || "post failed");
      setToast("Posted — live as advisory ✓"); setForm({ title:"", venue:"", event_date:"", event_time:"", scope_type:"general", scope_value:"" }); setShowPost(false); fetchFeed();
    } catch (e: any) { setToast(e.message); } finally { setPosting(false); }
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
      {/* Header — one clear title, single primary action */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.12em] text-slate-500">Road · live timetable · WAT</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-[26px]">Where&apos;s class today?</h1>
          <p className="mt-1 max-w-[560px] text-sm leading-5 text-slate-400">Post what you hear. Tap Yes if you were there — green tick when your coursemates confirm.</p>
        </div>
        <button onClick={()=>setShowPost(v=>!v)} className="inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-[#070a12] shadow-lg hover:bg-slate-100 transition">
          <Plus className="h-4 w-4" /> {showPost ? "Close" : "Post gist"}
        </button>
      </div>

      {/* Stats — minimal */}
      <div className="mt-5 grid grid-cols-3 gap-3">
        {[
          { label:"Live", value: stats.total, sub:"entries" },
          { label:"Green tick", value: stats.verified, sub:"confirmed", accent:"text-emerald-300" },
          { label:"Advisory", value: stats.advisory, sub:"awaiting", accent:"text-amber-300" },
        ].map(s=> (
          <div key={s.label} className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-3.5">
            <p className="font-mono text-[11px] uppercase tracking-wide text-slate-500">{s.label}</p>
            <p className={`mt-1 text-xl font-bold tracking-tight ${s.accent ?? "text-white"}`}>{s.value}</p>
            <p className="font-mono text-xs text-slate-500">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Search + filters + view toggle — single row, restrained */}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search courses, venues…" className="w-full rounded-full border border-white/10 bg-white/[0.04] py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-slate-500 focus:border-white/15 focus:outline-none" />
        </div>
        <div className="flex items-center gap-1.5">
          {[
            { k:"all", label:"All" }, { k:"advisory", label:"Advisory" }, { k:"verified", label:"Green" }
          ].map(f=> (
            <button key={f.k} onClick={()=>setFilterParam(f.k)} className={`rounded-full px-3.5 py-2 text-sm font-medium transition ${filter===f.k ? "bg-white text-[#070a12]" : "border border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.07]"}`}>{f.label}</button>
          ))}
        </div>
        <div className="flex items-center rounded-full border border-white/10 bg-white/[0.04] p-1">
          <button onClick={()=>setView("map")} className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition ${view==="map" ? "bg-white text-[#070a12]" : "text-slate-400"}`}><MapIcon className="h-3.5 w-3.5" /> Map</button>
          <button onClick={()=>setView("list")} className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition ${view==="list" ? "bg-white text-[#070a12]" : "text-slate-400"}`}><List className="h-3.5 w-3.5" /> List</button>
        </div>
      </div>

      {/* Post form — disclosure, not always open */}
      {showPost && (
        <form onSubmit={handlePost} className="mt-4 rounded-[20px] border border-white/[0.07] bg-white/[0.04] p-5 backdrop-blur">
          <h3 className="text-sm font-semibold text-white">Post what you heard — keep it honest</h3>
          <p className="mt-1 text-sm text-slate-400">Example: “ANA 203 moved to LT2, Friday 8am — HOD announced after lab.”</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="space-y-1"><span className="font-mono text-xs text-slate-500">What</span><input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="ANA 203 — Osteology" className="w-full rounded-xl border border-white/10 bg-[#0b1020] px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-white/15 focus:outline-none" /></label>
            <label className="space-y-1"><span className="font-mono text-xs text-slate-500">Where</span><input value={form.venue} onChange={e=>setForm(f=>({...f,venue:e.target.value}))} placeholder="LT2 / Anatomy Hall" className="w-full rounded-xl border border-white/10 bg-[#0b1020] px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-white/15 focus:outline-none" /></label>
            <label className="space-y-1"><span className="font-mono text-xs text-slate-500">Date (WAT)</span><input type="date" value={form.event_date} onChange={e=>setForm(f=>({...f,event_date:e.target.value}))} className="w-full rounded-xl border border-white/10 bg-[#0b1020] px-3 py-2.5 text-sm text-white focus:outline-none" /></label>
            <label className="space-y-1"><span className="font-mono text-xs text-slate-500">Time (WAT)</span><input type="time" value={form.event_time} onChange={e=>setForm(f=>({...f,event_time:e.target.value}))} className="w-full rounded-xl border border-white/10 bg-[#0b1020] px-3 py-2.5 text-sm text-white focus:outline-none" /></label>
            <label className="space-y-1"><span className="font-mono text-xs text-slate-500">Who needs this</span>
              <select value={form.scope_type} onChange={e=>setForm(f=>({...f,scope_type:e.target.value}))} className="w-full rounded-xl border border-white/10 bg-[#0b1020] px-3 py-2.5 text-sm text-white focus:outline-none">
                <option value="general">Everyone</option><option value="level">One level</option><option value="group">Group / dept</option>
              </select>
            </label>
            <label className="space-y-1"><span className="font-mono text-xs text-slate-500">Scope detail</span><input value={form.scope_value} onChange={e=>setForm(f=>({...f,scope_value:e.target.value}))} placeholder="200L or Physiology" className="w-full rounded-xl border border-white/10 bg-[#0b1020] px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none" /></label>
          </div>
          <div className="mt-4 flex gap-2">
            <button disabled={posting} className="rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-[#070a12] hover:bg-slate-100 disabled:opacity-50 transition">{posting ? "Posting…" : "Post as advisory →"}</button>
            <button type="button" onClick={()=>setShowPost(false)} className="rounded-full border border-white/10 bg-white/[0.04] px-5 py-2.5 text-sm text-slate-300">Cancel</button>
          </div>
        </form>
      )}

      {/* Content */}
      {loading ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[0,1,2,3,4,5].map(i=> <div key={i} className="h-32 animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.03]" />)}</div>
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
            <div className="relative mt-4 overflow-x-auto no-scrollbar">
              <svg viewBox="0 0 640 170" className="h-[140px] w-[640px] sm:h-[150px] sm:w-full" style={{ minWidth: 640 }} role="img" aria-label="Road">
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
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"><div className={`h-full rounded-full ${isVerified(selected) ? "bg-emerald-400" : "bg-amber-400"}`} style={{ width: `${pctOf(selected)}%`}} /></div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button onClick={()=>vote(selected.id,"YES")} disabled={!!voteBusy} className="rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50">{voteBusy===selected.id+"YES" ? "…" : "Yes ✓"}</button>
                <button onClick={()=>vote(selected.id,"NO")} disabled={!!voteBusy} className="rounded-full border border-white/10 bg-white/[0.05] px-5 py-2 text-sm font-medium text-slate-200 hover:bg-white hover:text-[#070a12] disabled:opacity-50">{voteBusy===selected.id+"NO" ? "…" : "No ✕"}</button>
                <button onClick={()=>vote(selected.id,"CANCEL")} disabled={!!voteBusy} className="rounded-full border border-white/10 bg-white/[0.02] px-5 py-2 text-sm text-slate-400 hover:bg-white/[0.06] disabled:opacity-50">Skip</button>
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
                        <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />{ev.event_date.slice(0,10)} · {String(ev.event_time).slice(0,5)} WAT</span>
                        {ev.scope_value && <span className="rounded-full border border-white/10 px-2 py-0.5 font-mono text-[11px]">{ev.scope_type} · {ev.scope_value}</span>}
                      </p>
                      <div className="mt-3 flex items-center gap-2">
                        <div className="h-1.5 flex-1 max-w-[200px] overflow-hidden rounded-full bg-white/10"><div className={`h-full rounded-full ${v ? "bg-emerald-400" : "bg-amber-400"}`} style={{ width:`${p}%`}} /></div>
                        <span className="font-mono text-xs text-slate-500">{Number(ev.authority_points)}/{Number(ev.required_points)||8} · {p}%</span>
                        {v ? <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-mono text-xs text-emerald-300">✓ green</span> : <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 font-mono text-xs text-amber-300">advisory</span>}
                      </div>
                    </div>
                    <span className={`hidden sm:inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${v ? "bg-emerald-500 text-white" : "bg-amber-500 text-white"}`}>{v ? "✓" : "●"}</span>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-xs uppercase tracking-wide text-slate-500">Were you there?</span>
                    <button onClick={()=>vote(ev.id,"YES")} disabled={!!voteBusy} className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-1.5 text-sm font-medium text-emerald-300 hover:bg-emerald-500 hover:text-white disabled:opacity-50">{voteBusy===ev.id+"YES" ? "…" : "Yes ✓"}</button>
                    <button onClick={()=>vote(ev.id,"NO")} disabled={!!voteBusy} className="rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-sm text-slate-200 hover:bg-white hover:text-[#070a12] disabled:opacity-50">{voteBusy===ev.id+"NO" ? "…" : "No ✕"}</button>
                    <button onClick={()=>vote(ev.id,"CANCEL")} disabled={!!voteBusy} className="rounded-full border border-white/10 bg-white/[0.02] px-3.5 py-1.5 text-sm text-slate-400 hover:bg-white/[0.06] disabled:opacity-50">Skip</button>
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
