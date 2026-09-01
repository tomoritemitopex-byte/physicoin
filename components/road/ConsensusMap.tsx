"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import ConsensusVoteButton from "@/components/ui/ConsensusVoteButton";

/**
 * ConsensusMap — single visualization of ALL pending truth coordination.
 * Student-native vocabulary: halls / lecturers / courses — not blocks/mempool/mining.
 * Graph + list hybrid: clustered nodes with vote progress, inline voting, resolution animation.
 * 15s polling for live updates.
 */

type ConsensusItem = {
  id: string;
  type: "hall" | "prof" | "scope";
  alias: string;
  canonical: string;
  votes_yes: number;
  votes_no: number;
  total: number;
  total_weight: number;
  quorum_progress: number;
  yes_pct: number;
  programme: string | null;
  level: string | null;
  group_key: string | null;
  created_at: string;
  expires_at: string | null;
  status: string;
};

const TYPE_LABEL: Record<string, { label: string; short: string; dot: string; ring: string }> = {
  hall: { label: "Hall", short: "Hall", dot: "bg-sky-400", ring: "ring-sky-400/30" },
  prof: { label: "Lecturer", short: "Who", dot: "bg-violet-400", ring: "ring-violet-400/30" },
  scope: { label: "Course", short: "Course", dot: "bg-amber-400", ring: "ring-amber-400/30" },
};

function timeAgo(iso: string): string {
  const d = new Date(iso).getTime();
  const now = Date.now();
  const s = Math.floor((now - d) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function NodePair({ item, selected, onSelect }: { item: ConsensusItem; selected: boolean; onSelect: () => void }) {
  const t = TYPE_LABEL[item.type] ?? TYPE_LABEL.hall;
  const total = item.votes_yes + item.votes_no;
  const nearQuorum = total >= 6;
  const progress = item.quorum_progress;
  const yesPct = item.yes_pct;

  return (
    <button
      onClick={onSelect}
      className={`group relative flex w-full items-center gap-2 rounded-2xl border px-3 py-3 text-left transition ${
        selected ? "border-white/20 bg-white/[0.07] shadow-lg" : "border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/10"
      } ${nearQuorum ? "ring-1 " + t.ring : ""}`}
    >
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${t.dot} ${nearQuorum ? "animate-pulse" : ""}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-white">{item.alias}</span>
          <span className="shrink-0 font-mono text-xs text-slate-500">↔</span>
          <span className="truncate text-sm font-medium text-slate-200">{item.canonical}</span>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className={`rounded-full border px-1.5 py-0.5 font-mono text-[10px] leading-none ${selected ? "border-white/15 text-white" : "border-white/10 text-slate-400"}`}>{t.short}</span>
          <span className="font-mono text-xs text-slate-400">
            {total}/8 · {yesPct}%
          </span>
          {nearQuorum && <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-300">close</span>}
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-emerald-400 transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      </div>
      <span className={`shrink-0 rounded-full px-2 py-1 font-mono text-xs font-semibold ${progress >= 100 ? "bg-emerald-500 text-white" : "bg-white/10 text-slate-300"}`}>
        {item.votes_yes}/{item.votes_no}
      </span>
    </button>
  );
}

function ClusterRail({ items, selectedId, onSelect }: { items: ConsensusItem[]; selectedId: string | null; onSelect: (id: string) => void }) {
  // Group by type for visual clusters; hall chain style: [LT 1] ←→ [LT 2] ←→ [Theatre A]
  const byType = useMemo(() => {
    const m: Record<string, ConsensusItem[]> = { hall: [], prof: [], scope: [] };
    for (const it of items) (m[it.type] ?? (m[it.type] = [])).push(it);
    return m;
  }, [items]);

  const hasMultipleTypes = Object.values(byType).filter((a) => a.length > 0).length > 1;

  if (!hasMultipleTypes) {
    return (
      <div className="grid gap-2">
        {items.map((it) => (
          <NodePair key={it.id} item={it} selected={selectedId === it.id} onSelect={() => onSelect(it.id)} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {(["hall", "prof", "scope"] as const).map((k) => {
        const arr = byType[k] ?? [];
        if (!arr.length) return null;
        const t = TYPE_LABEL[k];
        return (
          <div key={k}>
            <div className="mb-2 flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${t.dot}`} />
              <span className="font-mono text-xs uppercase tracking-wide text-slate-400">{t.label}s · {arr.length} pending</span>
              <span className="h-px flex-1 bg-white/5" />
            </div>
            {/* Hall dedup cluster: interconnected strip; others: grid */}
            {k === "hall" && arr.length > 1 ? (
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
                {arr.map((it) => (
                  <div key={it.id} className="min-w-[220px] max-w-[260px]">
                    <NodePair item={it} selected={selectedId === it.id} onSelect={() => onSelect(it.id)} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid gap-2">
                {arr.map((it) => (
                  <NodePair key={it.id} item={it} selected={selectedId === it.id} onSelect={() => onSelect(it.id)} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function ConsensusMap({ pollMs = 15000 }: { pollMs?: number }) {
  const [items, setItems] = useState<ConsensusItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "hall" | "prof" | "scope">("all");
  const [justResolvedIds, setJustResolvedIds] = useState<Set<string>>(new Set());
  const [myPid, setMyPid] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("physi_profile");
      setMyPid(raw ? JSON.parse(raw)?.id ?? null : null);
    } catch {
      setMyPid(null);
    }
  }, []);

  const fetchConsensus = useCallback(async () => {
    try {
      // Prefer programme/level filter when available (hall dedup relevance)
      let qs = "";
      try {
        const raw = localStorage.getItem("physi_profile");
        if (raw) {
          const p = JSON.parse(raw);
          const params = new URLSearchParams();
          if (p?.programme) params.set("programme", String(p.programme));
          if (p?.level) params.set("level", String(p.level));
          qs = params.toString() ? `?${params.toString()}` : "";
        }
      } catch {}
      const r = await fetch(`/api/consensus${qs}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || j.ok === false) throw new Error(j.error || "couldn't load");
      const next: ConsensusItem[] = j.items ?? [];
      // Detect resolutions: ids that disappeared since last fetch (were pending, now gone)
      setItems((prev) => {
        if (prev.length > 0) {
          const nextIds = new Set(next.map((x) => x.id));
          const resolved = prev.filter((p) => !nextIds.has(p.id)).map((p) => p.id);
          if (resolved.length > 0) {
            setJustResolvedIds((s) => {
              const n = new Set(s);
              for (const id of resolved) n.add(id);
              return n;
            });
            setTimeout(() => {
              setJustResolvedIds((s) => {
                const n = new Set(s);
                for (const id of resolved) n.delete(id);
                return n;
              });
            }, 2200);
          }
        }
        return next;
      });
      setErr(null);
    } catch (e: any) {
      setErr(e.message || "couldn't load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConsensus();
    const iv = setInterval(fetchConsensus, pollMs);
    const onVoted = () => fetchConsensus();
    window.addEventListener("physi-consensus-voted", onVoted as any);
    return () => {
      clearInterval(iv);
      window.removeEventListener("physi-consensus-voted", onVoted as any);
    };
  }, [fetchConsensus, pollMs]);

  const filtered = useMemo(() => {
    if (filter === "all") return items;
    return items.filter((x) => x.type === filter);
  }, [items, filter]);

  const selected = selectedId ? filtered.find((x) => x.id === selectedId) ?? items.find((x) => x.id === selectedId) ?? null : null;

  const counts = useMemo(() => {
    const c = { hall: 0, prof: 0, scope: 0 };
    for (const it of items) c[it.type as keyof typeof c] = (c[it.type as keyof typeof c] ?? 0) + 1;
    return c;
  }, [items]);

  if (loading) {
    return (
      <div className="rounded-[20px] border border-white/[0.07] bg-white/[0.03] p-5">
        <div className="h-6 w-40 animate-pulse rounded bg-white/10" />
        <div className="mt-4 grid gap-2">
          {[0, 1, 2].map((k) => (
            <div key={k} className="h-20 animate-pulse rounded-2xl bg-white/[0.04]" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[20px] border border-white/[0.07] bg-white/[0.03] backdrop-blur">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-white/[0.06] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.12em] text-slate-500">Truth coordination · live</p>
          <h2 className="mt-1 text-base font-bold tracking-tight text-white">Consensus Map</h2>
          <p className="mt-1 max-w-[520px] text-sm leading-5 text-slate-400">All pending decisions your coursemates are settling — halls, lecturers, courses. Tap to weigh in.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 font-mono text-xs text-emerald-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> {items.length} pending
          </span>
        </div>
      </div>

      {/* Type filter pills */}
      <div className="flex items-center gap-1.5 px-5 py-3">
        {[
          { k: "all", label: `All · ${items.length}` },
          { k: "hall", label: `Halls · ${counts.hall}` },
          { k: "prof", label: `Lecturers · ${counts.prof}` },
          { k: "scope", label: `Courses · ${counts.scope}` },
        ].map((f) => (
          <button
            key={f.k}
            onClick={() => setFilter(f.k as any)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${filter === f.k ? "bg-white text-[#070a12]" : "border border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]"}`}
          >
            {f.label}
          </button>
        ))}
        <span className="ml-auto hidden font-mono text-xs text-slate-500 sm:inline">15s live · most votes first</span>
      </div>

      {err && <p className="px-5 pb-2 font-mono text-xs text-amber-300">{err}</p>}

      {filtered.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <p className="text-sm font-medium text-white">All clear — no pending decisions</p>
          <p className="mt-1 font-mono text-xs text-slate-500">When classmates spot a duplicate hall, lecturer, or course name, it shows up here for a quick vote.</p>
          <div className="mt-4 flex justify-center gap-2 font-mono text-[11px] text-slate-500">
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1">[LT1] ↔ [LT 2]</span>
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1">[Prof Adams] ↔ [Dr. Adams]</span>
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1">[Cell Bio] ↔ [Cellular Mechanisms]</span>
          </div>
        </div>
      ) : (
        <div className="grid gap-0 lg:grid-cols-[1.15fr_0.85fr]">
          {/* Graph + list */}
          <div className="border-white/[0.06] px-5 py-4 lg:border-r">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-mono text-xs uppercase tracking-wide text-slate-500">Pending · {filtered.length} · tap to vote</span>
              <span className="font-mono text-xs text-slate-500">{filtered.length > 0 ? `${filtered[0].votes_yes + filtered[0].votes_no}/8 closest` : ""}</span>
            </div>
            <ClusterRail items={filtered} selectedId={selectedId} onSelect={(id) => setSelectedId((c) => (c === id ? null : id))} />
            {/* Resolution animation banner */}
            {justResolvedIds.size > 0 && (
              <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 font-mono text-xs text-emerald-300 animate-pulse">
                ✓ Settled — {justResolvedIds.size} decision{justResolvedIds.size > 1 ? "s" : ""} just tipped quorum and is now canonical
              </div>
            )}
            {/* Mini legend */}
            <div className="mt-4 flex flex-wrap items-center gap-3 font-mono text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-sky-400" /> hall</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-violet-400" /> lecturer</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-400" /> course</span>
              <span className="ml-auto">6/8 · 75% — almost there</span>
            </div>
          </div>

          {/* Inspector — inline vote */}
          <div className="px-5 py-4">
            {!selected ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-8 text-center">
                <p className="text-sm font-medium text-slate-200">Pick a card to vote</p>
                <p className="mx-auto mt-1 max-w-[280px] font-mono text-xs leading-4 text-slate-500">You&apos;re deciding the canonical name everyone will see. 8 votes + 70% agreement settles it.</p>
                <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 font-mono text-xs text-slate-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> live · 15s refresh
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 font-mono text-xs ${selected.type === "hall" ? "border-sky-500/20 bg-sky-500/10 text-sky-300" : selected.type === "prof" ? "border-violet-500/20 bg-violet-500/10 text-violet-300" : "border-amber-500/20 bg-amber-500/10 text-amber-300"}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${selected.type === "hall" ? "bg-sky-400" : selected.type === "prof" ? "bg-violet-400" : "bg-amber-400"}`} /> {TYPE_LABEL[selected.type]?.label ?? selected.type}
                    </span>
                    <h3 className="mt-2 text-base font-bold leading-5 text-white">
                      <span className="text-sky-200">{selected.alias}</span> <span className="font-mono text-sm font-normal text-slate-500">↔</span> <span className="text-white">{selected.canonical}</span>
                    </h3>
                    <p className="mt-1 font-mono text-xs text-slate-500">
                      {selected.group_key ? `Group: ${selected.group_key.slice(0, 48)}` : "Campus-wide"} · {timeAgo(selected.created_at)} · expires {selected.expires_at ? timeAgo(selected.expires_at) : "—"}
                    </p>
                  </div>
                  <button onClick={() => setSelectedId(null)} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-xs text-slate-300 hover:bg-white hover:text-[#070a12]">
                    Close
                  </button>
                </div>

                {/* Interconnected preview */}
                <div className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-[#0b1020] px-3 py-3">
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-white">{selected.alias}</span>
                  <span className="font-mono text-sm text-slate-500">←→</span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-white">{selected.canonical}</span>
                </div>

                {/* Vote progress */}
                <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
                  <div className="flex items-center justify-between font-mono text-xs">
                    <span className={selected.total >= 7 ? "font-bold text-amber-300" : "text-slate-400"}>
                      {selected.total}/8 · {selected.yes_pct}% {selected.total >= 7 ? "· 1 more!" : ""}
                    </span>
                    <span className={selected.total >= 8 && selected.yes_pct >= 70 ? "text-emerald-300" : "text-slate-500"}>
                      {selected.total >= 8 && selected.yes_pct >= 70 ? "tipping to canonical ✓" : `${Math.max(0, 8 - selected.total)} more to quorum`}
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full bg-emerald-400 transition-all duration-500" style={{ width: `${selected.quorum_progress}%` }} />
                  </div>
                  <div className="mt-1 flex justify-between font-mono text-[11px] text-slate-500">
                    <span>Yes {selected.votes_yes}</span>
                    <span>No {selected.votes_no}</span>
                  </div>
                </div>

                <ConsensusVoteButton
                  item={{ id: selected.id, type: selected.type, alias: selected.alias, canonical: selected.canonical, votes_yes: selected.votes_yes, votes_no: selected.votes_no, total: selected.total, quorum_progress: selected.quorum_progress, yes_pct: selected.yes_pct }}
                  voterId={myPid}
                  onVoted={fetchConsensus}
                />

                {!myPid && (
                  <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 font-mono text-xs text-amber-200">
                    Pick a handle first — then your vote counts. Tap Yes/No to create one.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
