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

  const fetchSchools = useCallback(async () => {
    if (paused) return;
    try {
      const res = await fetch("/api/schools?limit=100", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSchools(Array.isArray(data.schools) ? data.schools : []);
      const pending = data.schools?.filter((s: any) => s.status === "pending") ?? [];
      setPendingSchools(pending);
      setAt(new Date().toLocaleTimeString());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
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
        // Refresh to show updated status
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
            onClick={() => { fetchSchools(); fetchDisputes(); }}
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

      {/* Tab switcher */}
      <div className="mb-4 flex gap-2 border-b border-white/[0.07]">
        <button
          onClick={() => setPage("schools")}
          className={`rounded-t-lg px-4 py-2 text-sm font-medium transition ${page === "schools" ? "bg-white/[0.06] text-white border-b-2 border-cyan-400" : "text-slate-400 hover:text-slate-200"}`}
        >
          Schools ({schools.length})
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
            <span className="font-mono text-[11px] tracking-wide text-slate-400">All schools — newest first</span>
            <span className="font-mono text-[11px] text-slate-500">{schools.length} schools</span>
          </div>
          <div className="max-h-[60vh] overflow-auto overscroll-contain bg-[#022c1e]">
            {schools.length === 0 ? (
              <div className="px-4 py-10 text-center font-mono text-xs text-slate-500">No schools yet. Students create schools via the student app.</div>
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
        Creator dashboard — verify schools and resolve disputes. Every coin burn earns you a 5% arbiter fee.
        GPI coins are tracked in <code>physi_coins_burned</code>.
      </p>
    </div>
  );
}
