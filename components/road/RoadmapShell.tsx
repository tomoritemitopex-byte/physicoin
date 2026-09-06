"use client";
import { useEffect, useState, useCallback, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Search, Plus, Clock3 } from "lucide-react";
import { RoadSkeleton } from "@/components/Skeletons";
import WindingRoad from "@/components/road/WindingRoad";

type EventRow = {
  id: string; title: string; venue: string; event_date: string; event_time: string;
  scope_type: string; scope_value: string | null; status: string;
  created_at: string; created_by?: string | null;
  required_points?: number | string; vote_weight_yes?: number; vote_weight_no?: number;
  severity?: string;
};

function isVerified(ev: EventRow) {
  if (ev.status === "verified") return true;
  const yes = Number(ev.vote_weight_yes ?? 0);
  return yes >= (Number(ev.required_points ?? 0) || 8);
}

function getProfileId() {
  try {
    const raw = localStorage.getItem("physi_profile");
    return raw ? JSON.parse(raw)?.id ?? null : null;
  } catch { return null; }
}

export default function RoadmapShell({
  initialEvents,
  initialOk,
  filterParam,
  fallback,
}: {
  initialEvents: EventRow[];
  initialOk: boolean;
  filterParam: string;
  fallback: React.ReactNode;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [events, setEvents] = useState<EventRow[]>(initialEvents);
  const [loading, setLoading] = useState(!initialOk && initialEvents.length === 0);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState(filterParam);
  const [toast, setToast] = useState<string | null>(null);
  const [voteBusy, setVoteBusy] = useState<string | null>(null);
  const [showPost, setShowPost] = useState(false);
  const [posting, setPosting] = useState(false);
  const [form, setForm] = useState({
    title: "", venue: "", event_date: "", event_time: "",
    scope_type: "general", scope_value: "", prof_name: "",
    severity: "move" as "move" | "shift" | "cancelled",
  });

  const fetchFeed = useCallback(async () => {
    if (initialOk) { setLoading(false); return; }
    setLoading(true); setErr(null);
    try {
      const r = await fetch("/api/timetable", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || j.ok === false) throw new Error(j.error || "couldn't load");
      setEvents(j.events ?? []);
    } catch (e: any) { setErr(e.message || "couldn't load"); }
    finally { setLoading(false); }
  }, [initialOk]);

  useEffect(() => {
    if (initialOk) return;
    fetchFeed();
    const iv = setInterval(fetchFeed, 15000);
    return () => clearInterval(iv);
  }, [fetchFeed, initialOk]);

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2600); return () => clearTimeout(t); }, [toast]);
  useEffect(() => { setFilter(filterParam); }, [filterParam]);

  const setFilterParam = (f: string) => {
    setFilter(f);
    const p = new URLSearchParams(sp.toString());
    p.set("filter", f);
    router.replace(`/app/roadmap?${p.toString()}`);
  };

  const filtered = useMemo(() => {
    let r = events;
    if (filter === "verified") r = r.filter(isVerified);
    else if (filter === "advisory") r = r.filter(e => !isVerified(e));
    if (q.trim()) {
      const qq = q.toLowerCase();
      r = r.filter(e => `${e.title} ${e.venue} ${e.scope_value ?? ""}`.toLowerCase().includes(qq));
    }
    return [...r].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [events, filter, q]);

  async function handleVerify(ev: EventRow) {
    setVoteBusy(ev.id);
    try {
      const r = await fetch("/api/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ verifier_id: getProfileId(), event_id: ev.id, vote: "YES" }),
      });
      const j = await r.json().catch(() => ({} as any));
      if (r.ok && j.ok !== false) {
        setEvents(prev => prev.map(e => {
          if (e.id !== ev.id) return e;
          return { ...e, vote_weight_yes: Number(e.vote_weight_yes ?? 0) + 1 };
        }));
        setToast("Confirmed ✓");
      } else { setToast(j.error || "vote failed"); }
    } catch { setToast("Network error — retry"); }
    finally { setVoteBusy(null); }
  }

  async function handlePost(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title || !form.venue) { setToast("Tell us what and where"); return; }
    let d = form.event_date; let t = form.event_time;
    if (!d) { const now = new Date(); const pad = (n: number) => String(n).padStart(2, "0"); d = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`; }
    if (!t) t = "08:00";
    setPosting(true);
    try {
      const r = await fetch("/api/timetable", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(), venue: form.venue.trim(),
          event_date: d, event_time: t, scope_type: form.scope_type || "general",
          scope_value: form.scope_value || null, prof_name: form.prof_name.trim() || null,
          severity: form.severity, created_by: getProfileId(),
        }),
      });
      const j = await r.json();
      if (!r.ok || j.ok === false) throw new Error(j.error || "post failed");
      setToast("Posted — live as advisory ✓");
      setForm({ title: "", venue: "", event_date: "", event_time: "", scope_type: "general", scope_value: "", prof_name: "", severity: "move" });
      setShowPost(false);
      fetchFeed();
    } catch (e: any) { setToast(e.message); }
    finally { setPosting(false); }
  }

  if (loading && events.length === 0) {
    return <div className="mx-auto max-w-[1280px] px-4 py-10">{fallback}</div>;
  }

  if (!initialOk && err) {
    return (
      <div className="mx-auto max-w-[1280px] px-4 py-10">
        <div className="rounded-[20px] border border-dashed border-white/10 bg-white/[0.02] px-6 py-10 text-center">
          <p className="text-sm font-semibold text-white">Couldn't load timetable</p>
          <p className="mt-1 text-sm text-slate-400">{err}</p>
          <button onClick={fetchFeed} className="mt-4 rounded-full bg-white px-5 py-2 text-sm font-semibold text-[#022c1e] hover:bg-white/90">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1280px] px-4 pb-[88px]">
      {/* Header controls */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search venues, titles..."
            className="w-full rounded-full border border-white/10 bg-[#1a5f48]/60 pl-10 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#34d399]"
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-full border border-white/10 bg-[#1a5f48]/60 p-1">
            {(["all", "advisory", "verified"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilterParam(f)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                  filter === f
                    ? "bg-[#34d399] text-[#022c1e] shadow-[0_2px_8px_rgba(52,211,153,0.3)]"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {f === "all" ? "All" : f === "advisory" ? "Pending" : "Verified"}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowPost(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#34d399] px-4 py-2 text-sm font-semibold text-[#022c1e] hover:bg-[#6ee7b7] transition"
            aria-label="Post a new event"
          >
            <Plus className="h-4 w-4" /> Post
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="mb-4 flex items-center gap-4 text-xs font-mono text-slate-400">
        <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-[#34d399]" /> {filtered.length} events</span>
        <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" /> {filtered.filter(isVerified).length} verified</span>
        <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-[#f59e0b]" /> {filtered.filter(e => !isVerified(e)).length} advisory</span>
      </div>

      {/* Events — WindingRoad with WhatsApp-style cards */}
      <WindingRoad events={filtered} onVerify={handleVerify} />

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 rounded-full border border-[rgba(52,211,153,0.15)] bg-[#1a5f48]/80 px-4 py-2 font-mono text-xs text-[#f0fdf4] shadow-[0_4px_16px_rgba(0,0,0,0.3)]">
          {toast}
        </div>
      )}
    </div>
  );
}
