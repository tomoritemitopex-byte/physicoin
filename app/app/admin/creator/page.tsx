"use client";
import { useEffect, useState, useCallback } from "react";

export default function CreatorDashboard() {
  const [schools, setSchools] = useState<any[]>([]);
  const [pendingSchools, setPendingSchools] = useState<any[]>([]);
  const [disputes, setDisputes] = useState<any[]>([]);
  const [page, setPage] = useState<"schools" | "disputes">("schools");
  const [at, setAt] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  // Vine autopilot state
  const [choices, setChoices] = useState<any[]>([]);
  const [dropdownOptions, setDropdownOptions] = useState<any[]>([]);
  const [archived, setArchived] = useState<any[]>([]);
  const [historicalMap, setHistoricalMap] = useState<any[]>([]);
  const [proposal, setProposal] = useState("");
  const [deptProposal, setDeptProposal] = useState("");
  const [selectedSchoolForDept, setSelectedSchoolForDept] = useState<string>("");
  const [deptChoices, setDeptChoices] = useState<any[]>([]);
  const [deptDropdown, setDeptDropdown] = useState<any[]>([]);
  const [deptArchived, setDeptArchived] = useState<any[]>([]);

  const fetchSchools = useCallback(async () => {
    if (paused) return;
    try {
      const res = await fetch("/api/schools?limit=100", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSchools(Array.isArray(data.schools) ? data.schools : []);
      const pending = data.schools?.filter((s: any) => s.status === "pending") ?? [];
      setPendingSchools(pending);
      // Vine: aggregated choices + dropdown that updates live as votes come in
      if (Array.isArray(data.choices)) setChoices(data.choices);
      if (Array.isArray(data.dropdown_options)) setDropdownOptions(data.dropdown_options);
      else if (Array.isArray(data.choices)) setDropdownOptions(data.choices.filter((c:any)=>c.is_winner).map((c:any)=>({value:c.normalized,label:c.display_name,votes:c.total_votes})));
      if (Array.isArray(data.archived)) setArchived(data.archived);
      if (Array.isArray(data.historical_map)) setHistoricalMap(data.historical_map);
      if (!selectedSchoolForDept && data.schools?.[0]?.id) setSelectedSchoolForDept(data.schools[0].id);
      setAt(new Date().toLocaleTimeString());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [paused, selectedSchoolForDept]);

  const fetchDeptChoices = useCallback(async (schoolId: string) => {
    if (!schoolId || paused) return;
    try {
      const res = await fetch(`/api/schools/departments?school_id=${encodeURIComponent(schoolId)}`, { cache: "no-store" });
      const data = await res.json();
      if (Array.isArray(data.choices)) setDeptChoices(data.choices);
      if (Array.isArray(data.dropdown_options)) setDeptDropdown(data.dropdown_options);
      if (Array.isArray(data.archived)) setDeptArchived(data.archived);
    } catch {}
  }, [paused]);

  const fetchDisputes = useCallback(async () => {
    if (paused) return;
    try {
      const res = await fetch("/api/schools/disputes?limit=100", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDisputes(Array.isArray(data.disputes) ? data.disputes : []);
      setAt(new Date().toLocaleTimeString());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [paused]);

  useEffect(() => {
    fetchSchools();
    fetchDisputes();
    const id = setInterval(page === "schools" ? fetchSchools : fetchDisputes, 3000);
    return () => clearInterval(id);
  }, [fetchSchools, fetchDisputes, page, paused]);

  useEffect(() => {
    if (page === "schools" && selectedSchoolForDept) fetchDeptChoices(selectedSchoolForDept);
  }, [selectedSchoolForDept, page, fetchDeptChoices]);

  // live poll dept choices alongside schools
  useEffect(() => {
    if (page !== "schools" || !selectedSchoolForDept) return;
    const iv = setInterval(() => fetchDeptChoices(selectedSchoolForDept), 3000);
    return () => clearInterval(iv);
  }, [selectedSchoolForDept, page, fetchDeptChoices]);

  async function verifySchool(id: string, status: "verified" | "rejected") {
    try {
      const res = await fetch("/api/schools", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, status, rejection_reason: status === "rejected" ? "Not a genuine institution" : undefined }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.ok) {
        await fetchSchools();
      } else {
        setError(data.message ?? "Failed to verify");
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function resolveDispute(id: string, decision: "resolved_a_wins" | "resolved_b_wins") {
    try {
      const res = await fetch("/api/schools/disputes", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, status: decision }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.ok) {
        await fetchDisputes();
      } else {
        setError(data.message ?? "Failed to resolve");
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // Vine: free-text → lower() grouping → vote → dropdown
  async function proposeSchool() {
    const name = proposal.trim();
    if (!name) return;
    try {
      const res = await fetch("/api/schools", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok || data.ok === false) throw new Error(data.message || `HTTP ${res.status}`);
      setProposal("");
      await fetchSchools();
    } catch (e) { setError((e as Error).message); }
  }

  async function voteSchool(normalized: string, v: 1 | -1 = 1) {
    try {
      let voter_id: string | null = null;
      try { const raw = localStorage.getItem("physi_profile"); if (raw) voter_id = JSON.parse(raw)?.id ?? null; } catch {}
      const res = await fetch("/api/schools", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "vote", normalized, vote: v, voter_id }),
      });
      const data = await res.json();
      if (data.ok) {
        if (Array.isArray(data.choices)) setChoices(data.choices);
        await fetchSchools();
      }
    } catch (e) { setError((e as Error).message); }
  }

  async function proposeDept() {
    const name = deptProposal.trim();
    if (!name || !selectedSchoolForDept) return;
    try {
      const res = await fetch("/api/schools/departments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ school_id: selectedSchoolForDept, name }),
      });
      const data = await res.json();
      if (!res.ok || data.ok === false) throw new Error(data.message || `HTTP ${res.status}`);
      setDeptProposal("");
      await fetchDeptChoices(selectedSchoolForDept);
      await fetchSchools();
    } catch (e) { setError((e as Error).message); }
  }

  async function voteDept(normalized: string, v: 1 | -1 = 1) {
    try {
      let voter_id: string | null = null;
      try { const raw = localStorage.getItem("physi_profile"); if (raw) voter_id = JSON.parse(raw)?.id ?? null; } catch {}
      const res = await fetch("/api/schools/departments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "vote", normalized, school_id: selectedSchoolForDept, vote: v, voter_id }),
      });
      const data = await res.json();
      if (data.ok) {
        if (Array.isArray(data.choices)) setDeptChoices(data.choices);
        await fetchDeptChoices(selectedSchoolForDept);
      }
    } catch (e) { setError((e as Error).message); }
  }

  const pendingCount = pendingSchools.length;
  const disputeCount = disputes.filter((d: any) => d.status === "active").length;

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[18px] font-semibold tracking-tight text-white">Creator Dashboard</h1>
          <p className="mt-1 font-mono text-[11px] text-slate-400">
            Verify schools · resolve disputes · earn fees from burned coins
            {error ? <span className="ml-2 text-red-400">error: {error}</span> : null}
          </p>
          <p className="mt-1 font-mono text-[11px] text-slate-500">
            Pending schools: <span className="text-amber-300 font-semibold">{pendingCount}</span>
            {" · "}Active disputes: <span className="text-red-300 font-semibold">{disputeCount}</span>
            {" · "}Vine choices: <span className="text-cyan-300 font-semibold">{choices.length}</span> (lower() grouped)
            {" · "}{paused ? "paused" : `last ${at || "—"}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPaused((p) => !p)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${paused ? "border-amber-400/30 bg-amber-400/15 text-amber-200" : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.07]"}`}
          >
            {paused ? "Resume" : "Pause"}
          </button>
          <button
            onClick={() => { fetchSchools(); fetchDisputes(); if (selectedSchoolForDept) fetchDeptChoices(selectedSchoolForDept); }}
            className="rounded-full border border-white/10 bg-white px-3 py-1 text-xs font-semibold text-black hover:bg-slate-100"
          >
            Refresh
          </button>
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] ${paused ? "border-amber-400/20 bg-amber-400/10 text-amber-300" : "border-emerald-400/15 bg-emerald-400/10 text-emerald-300"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${paused ? "bg-amber-400" : "animate-pulse bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]"}`} />
            {paused ? "paused" : "live"}
          </span>
        </div>
      </div>

      {/* Vine autopilot — free-text → lower() aggregation → vote → dropdown → 90d archive */}
      <div className="mb-6 rounded-xl border border-cyan-400/20 bg-gradient-to-br from-cyan-500/[0.06] to-emerald-500/[0.06] p-4 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-white">Vine autopilot — Nigeria → Ghana</h2>
          <span className="font-mono text-[11px] text-cyan-300/80">free-text → lower() grouping → vote → dropdown + 90d auto-archive</span>
        </div>
        <p className="mt-1 font-mono text-[11px] text-slate-400">Students type school/dept names free-text. System aggregates duplicates case-insensitive (lower() grouping) → presents as choices → vote → winners become permanent dropdown options. Extinct depts (0 events 90d) auto-archive + historical map.</p>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {/* School vine */}
          <div className="rounded-lg border border-white/[0.07] bg-[#022c1e] p-3">
            <h3 className="font-mono text-xs font-semibold text-cyan-300">School vine</h3>
            <div className="mt-2 flex gap-2">
              <input
                value={proposal}
                onChange={e=>setProposal(e.target.value)}
                placeholder="Type school name free-text e.g. Unilag"
                className="flex-1 rounded-full border border-white/10 bg-[#0b1020] px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none"
                onKeyDown={e=>{ if(e.key==='Enter') proposeSchool(); }}
              />
              <button onClick={proposeSchool} className="rounded-full bg-cyan-500 px-4 py-2 text-xs font-bold text-black hover:bg-cyan-400">Propose</button>
            </div>
            {/* Aggregated choices with vote counts */}
            <div className="mt-3">
              <p className="font-mono text-[11px] text-slate-400">Aggregated choices (lower() grouped) — vote to tip winner:</p>
              <div className="mt-1 max-h-[160px] overflow-auto rounded-lg border border-white/10 bg-black/20 p-2 space-y-1">
                {choices.length===0 ? <p className="font-mono text-xs text-slate-500">No proposals yet — be first to type a school.</p> : choices.slice(0,12).map((c:any)=>(
                  <div key={c.normalized} className="flex items-center justify-between gap-2 rounded bg-white/[0.04] px-2 py-1.5">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-white">{c.display_name} <span className="font-mono text-[11px] text-slate-400">({c.normalized})</span> {c.is_winner && <span className="ml-1 rounded bg-emerald-500/20 px-1 py-0.5 text-[10px] text-emerald-300">✓ dropdown</span>}</p>
                      <p className="font-mono text-[11px] text-slate-400">{c.proposal_count} proposals + {c.vote_total} votes = {c.total_votes} total · yes {c.votes_yes}/no {c.votes_no}</p>
                    </div>
                    <button onClick={()=>voteSchool(c.normalized,1)} className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-semibold text-black hover:bg-slate-100">Vote +1</button>
                  </div>
                ))}
              </div>
            </div>
            {/* Live dropdown that updates as votes come in */}
            <div className="mt-3">
              <label className="font-mono text-[11px] text-slate-400">Live dropdown — permanent options (winners ≥3 votes, auto-promoted):</label>
              <select className="mt-1 w-full rounded-xl border border-cyan-400/30 bg-[#0b1020] px-3 py-2 text-sm text-white focus:outline-none">
                <option value="">— select verified school —</option>
                {dropdownOptions.map((o:any)=>(
                  <option key={o.value} value={o.value}>{o.label} — {o.votes} votes</option>
                ))}
              </select>
              <p className="mt-1 font-mono text-[11px] text-slate-500">Updates live every 3s as votes arrive. Nigeria → Ghana vine grows without manual seeding.</p>
            </div>
            {archived.length>0 && (
              <div className="mt-3 rounded border border-amber-500/20 bg-amber-500/10 px-2 py-1.5">
                <p className="font-mono text-[11px] text-amber-300">Auto-archived schools (historical map):</p>
                <p className="font-mono text-[11px] text-amber-200/80">{archived.slice(0,5).map((a:any)=> a.name).join(" · ")}{archived.length>5?` +${archived.length-5} more`:""}</p>
              </div>
            )}
          </div>

          {/* Dept vine */}
          <div className="rounded-lg border border-white/[0.07] bg-[#022c1e] p-3">
            <h3 className="font-mono text-xs font-semibold text-emerald-300">Department vine (per school)</h3>
            <select
              value={selectedSchoolForDept}
              onChange={e=>setSelectedSchoolForDept(e.target.value)}
              className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b1020] px-3 py-2 text-sm text-white focus:outline-none"
            >
              <option value="">— pick school for dept —</option>
              {schools.slice(0,50).map((s:any)=> <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <div className="mt-2 flex gap-2">
              <input
                value={deptProposal}
                onChange={e=>setDeptProposal(e.target.value)}
                placeholder="Type dept free-text e.g. Physiology"
                className="flex-1 rounded-full border border-white/10 bg-[#0b1020] px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none"
                onKeyDown={e=>{ if(e.key==='Enter') proposeDept(); }}
              />
              <button onClick={proposeDept} disabled={!selectedSchoolForDept} className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-bold text-black hover:bg-emerald-400 disabled:opacity-40">Add</button>
            </div>
            <div className="mt-3">
              <p className="font-mono text-[11px] text-slate-400">Aggregated dept choices for school — lower() grouped:</p>
              <div className="mt-1 max-h-[160px] overflow-auto rounded-lg border border-white/10 bg-black/20 p-2 space-y-1">
                {deptChoices.length===0 ? <p className="font-mono text-xs text-slate-500">No dept proposals for this school yet.</p> : deptChoices.slice(0,10).map((c:any)=>(
                  <div key={c.normalized} className="flex items-center justify-between gap-2 rounded bg-white/[0.04] px-2 py-1.5">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-white">{c.display_name} {c.is_winner && <span className="ml-1 rounded bg-emerald-500/20 px-1 py-0.5 text-[10px] text-emerald-300">✓ dropdown</span>}</p>
                      <p className="font-mono text-[11px] text-slate-400">{c.proposal_count}+{c.vote_total}={c.total_votes} votes</p>
                    </div>
                    <button onClick={()=>voteDept(c.normalized,1)} className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-semibold text-black hover:bg-slate-100">Vote</button>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-3">
              <label className="font-mono text-[11px] text-slate-400">Live dept dropdown (winners):</label>
              <select className="mt-1 w-full rounded-xl border border-emerald-400/30 bg-[#0b1020] px-3 py-2 text-sm text-white focus:outline-none">
                <option value="">— select verified dept —</option>
                {deptDropdown.map((o:any)=>(
                  <option key={o.value} value={o.value}>{o.label} — {o.votes} votes</option>
                ))}
              </select>
              <p className="mt-1 font-mono text-[11px] text-slate-500">Extinct depts (0 events 90d) auto-archive; historical map updated. Live every 3s.</p>
            </div>
            {deptArchived.length>0 && (
              <div className="mt-2 rounded border border-amber-500/20 bg-amber-500/10 px-2 py-1.5">
                <p className="font-mono text-[11px] text-amber-300">Archived depts (90d extinct): {deptArchived.slice(0,5).map((a:any)=>a.name).join(" · ")}</p>
              </div>
            )}
            {historicalMap.length>0 && (
              <details className="mt-2">
                <summary className="cursor-pointer font-mono text-[11px] text-slate-400">Historical map ({historicalMap.length} archived)</summary>
                <div className="mt-1 max-h-[80px] overflow-auto font-mono text-[11px] text-slate-500">
                  {historicalMap.slice(0,10).map((h:any,i:number)=> <div key={h.id||i}>{h.kind}: {h.name} · {h.reason} · {h.archived_at?new Date(h.archived_at).toLocaleDateString():""}</div>)}
                </div>
              </details>
            )}
          </div>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="mb-4 flex gap-2 border-b border-white/[0.07]">
        <button
          onClick={() => setPage("schools")}
          className={`rounded-t-lg px-4 py-2 text-sm font-medium transition ${page === "schools" ? "bg-white/[0.06] text-white border-b-2 border-cyan-400" : "text-slate-400 hover:text-slate-200"}`}
        >
          Schools ({schools.length}) · vine {choices.length}
        </button>
        <button
          onClick={() => setPage("disputes")}
          className={`rounded-t-lg px-4 py-2 text-sm font-medium transition ${page === "disputes" ? "bg-white/[0.06] text-white border-b-2 border-rose-400" : "text-slate-400 hover:text-slate-200"}`}
        >
          Disputes ({disputes.length})
        </button>
      </div>

      {/* Schools panel */}
      {page === "schools" && (
        <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.03]">
          <div className="flex items-center justify-between border-b border-white/[0.06] bg-white/[0.02] px-3 py-2">
            <span className="font-mono text-[11px] tracking-wide text-slate-400">All schools — newest first (excludes archived)</span>
            <span className="font-mono text-[11px] text-slate-500">{schools.length} schools · {dropdownOptions.length} in dropdown</span>
          </div>
          <div className="max-h-[60vh] overflow-auto overscroll-contain bg-[#022c1e]">
            {schools.length === 0 ? (
              <div className="px-4 py-10 text-center font-mono text-xs text-slate-500">No schools yet. Students create schools via vine free-text above — aggregates on lower() and votes tip winners.</div>
            ) : (
              <table className="w-full text-left font-mono text-[11.5px] leading-[1.35]">
                <thead className="sticky top-0 bg-[#0e1320] text-[10px] uppercase tracking-widest text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Depts</th>
                    <th className="px-3 py-2 font-medium">Events</th>
                    <th className="px-3 py-2 font-medium">Created</th>
                    <th className="px-3 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {schools.map((s: any, i: number) => (
                    <tr key={`${s.id}-${i}`} className={s.status === "pending" ? "bg-amber-500/[0.04] hover:bg-amber-500/[0.07]" : "hover:bg-white/[0.03]"}>
                      <td className="whitespace-nowrap px-3 py-1.5 text-slate-200 font-medium">{s.name}</td>
                      <td className="px-3 py-1.5">
                        <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold ${s.status === "verified" ? "bg-emerald-500/20 text-emerald-300" : s.status === "rejected" ? "bg-rose-500/20 text-rose-300" : "bg-amber-500/20 text-amber-300"}`}>
                          {s.status}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-slate-300">{s.department_count ?? 0}</td>
                      <td className="px-3 py-1.5 text-slate-300">{s.event_count ?? 0}</td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-slate-400">{new Date(s.created_at).toLocaleDateString()}</td>
                      <td className="px-3 py-1.5">
                        {s.status === "pending" && (
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => verifySchool(s.id, "verified")}
                              className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-200 hover:bg-emerald-500/30"
                            >
                              ✓ Verify
                            </button>
                            <button
                              onClick={() => verifySchool(s.id, "rejected")}
                              className="rounded bg-rose-500/20 px-2 py-0.5 text-[10px] font-semibold text-rose-200 hover:bg-rose-500/30"
                            >
                              ✗ Reject
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Disputes panel */}
      {page === "disputes" && (
        <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.03]">
          <div className="flex items-center justify-between border-b border-white/[0.06] bg-white/[0.02] px-3 py-2">
            <span className="font-mono text-[11px] tracking-wide text-slate-400">Active & resolved disputes</span>
            <span className="font-mono text-[11px] text-slate-500">{disputes.length} disputes</span>
          </div>
          <div className="max-h-[60vh] overflow-auto overscroll-contain bg-[#022c1e]">
            {disputes.length === 0 ? (
              <div className="px-4 py-10 text-center font-mono text-xs text-slate-500">No disputes yet. Disputes are created when two schools claim the same name or program.</div>
            ) : (
              <table className="w-full text-left font-mono text-[11.5px] leading-[1.35]">
                <thead className="sticky top-0 bg-[#0e1320] text-[10px] uppercase tracking-widest text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium">School A</th>
                    <th className="px-3 py-2 font-medium">School B</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Created</th>
                    <th className="px-3 py-2 font-medium">Resolution</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {disputes.map((d: any, i: number) => (
                    <tr key={`${d.id}-${i}`} className={d.status === "active" ? "bg-red-500/[0.04] hover:bg-red-500/[0.07]" : "hover:bg-white/[0.03]"}>
                      <td className="px-3 py-1.5">
                        <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold ${d.dispute_type === "school_name" ? "bg-blue-500/20 text-blue-300" : d.dispute_type === "department_name" ? "bg-purple-500/20 text-purple-300" : "bg-slate-500/20 text-slate-300"}`}>
                          {d.dispute_type === "school_name" ? "Same School Name" : d.dispute_type === "department_name" ? "Department Name" : "Unknown"}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-slate-200">{d.school_a?.name ?? d.school_id_a}</td>
                      <td className="px-3 py-1.5 text-slate-200">{d.school_b?.name ?? d.school_id_b}</td>
                      <td className="px-3 py-1.5">
                        <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold ${d.status === "active" ? "bg-red-500/20 text-red-300" : d.status.startsWith("resolved") ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-500/20 text-slate-300"}`}>
                          {d.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-slate-400">{new Date(d.created_at).toLocaleDateString()}</td>
                      <td className="px-3 py-1.5">
                        {d.status === "active" && (
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => resolveDispute(d.id, "resolved_a_wins")}
                              className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-200 hover:bg-emerald-500/30"
                            >
                              A Wins
                            </button>
                            <button
                              onClick={() => resolveDispute(d.id, "resolved_b_wins")}
                              className="rounded bg-rose-500/20 px-2 py-0.5 text-[10px] font-semibold text-rose-200 hover:bg-rose-500/30"
                            >
                              B Wins
                            </button>
                            <span className="text-[10px] text-slate-500 self-center">
                              Loser's coins → 30% burned, 70% to winner, 5% fee to you
                            </span>
                          </div>
                        )}
                        {d.status.startsWith("resolved") && (
                          <span className="text-[10px] text-slate-400">
                            Resolved {d.resolved_at ? new Date(d.resolved_at).toLocaleDateString() : ""}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Footer info */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
          <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Burn Mechanics</h3>
          <p className="mt-1 font-mono text-[11px] text-slate-500">
            When a dispute resolves: <span className="text-amber-300">losers burned</span>{" "}
            <span className="text-slate-300">30%</span>{" · "}
            <span className="text-emerald-300">winners get</span> <span className="text-slate-300">70%</span>{" · "}
            <span className="text-cyan-300">your fee</span> <span className="text-slate-300">5%</span>
          </p>
        </div>
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
          <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Balance Cap</h3>
          <p className="mt-1 font-mono text-[11px] text-slate-500">
            10,000 PHY per wallet — hard cap enforced in DB. Burned deflates supply; no 10M mint exists.
          </p>
        </div>
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
          <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Dispute Timeline</h3>
          <p className="mt-1 font-mono text-[11px] text-slate-500">
            Active disputes expire after <span className="text-slate-200">14 days</span>. Creator can resolve anytime. Expired = auto-settled (no burn).
          </p>
        </div>
      </div>

      <p className="mt-3 font-mono text-[11px] leading-relaxed text-slate-500">
        Creator dashboard — vine autopilot adds aggregation on lower(name) so Nigeria → Ghana grows without seeding. Archived depts reappear in historical map after 90d extinct.
      </p>
    </div>
  );
}
