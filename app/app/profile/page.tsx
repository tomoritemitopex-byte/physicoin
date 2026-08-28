"use client";
import { useEffect, useState, useMemo } from "react";

type StoredProfile = {
  id: string;
  nickname: string;
  full_name: string;
  programme: string;
  level: string;
  statuses: string[];
  authority_base: number | string;
  authority_final: number | string;
  mining_balance: number | string;
  created_at?: string;
  updated_at?: string;
};

const PROGRAMMES = [
  "Physiology",
  "Anatomy",
  "Biochemistry",
  "Medicine & Surgery",
  "Nursing",
  "Pharmacy",
  "Medical Laboratory Science",
  "Other Health Science",
];

const LEVELS = ["100L", "200L", "300L", "400L", "500L", "600L"];

const STATUS_OPTIONS = [
  { v: "class_rep", l: "Class rep" },
  { v: "lab_prefect", l: "Lab helper" },
  { v: "team_lead", l: "Group lead" },
  { v: "freshers_guide", l: "Freshers' guide" },
];

const HANDLE_SUGGESTIONS = ["alex_02", "bisola_11", "emma_07", "chidi_24", "zainab_03", "tunde_19"];

function handleValid(h: string) {
  return /^[a-z][a-z0-9_]{2,18}$/.test(h) && h.includes("_") && /[0-9]/.test(h.slice(-2));
}
function handleHint(h: string) {
  if (!h) return "pick something like alex_02 — people trust a real coursemate";
  if (h.length < 3) return "too short — add a bit more";
  if (/[A-Z]/.test(h)) return "keep it lowercase — alex_02 not Alex_02";
  if (!/^[a-z0-9_]+$/.test(h)) return "only letters, numbers and _";
  if (!h.includes("_")) return "add _ like alex_02";
  if (!/[0-9]/.test(h)) return "add a number — alex_02 not alex";
  if (hValidLight(h)) return "looks good ✓";
  return "aim for name_number like alex_02";
}
function hValidLight(h: string) {
  return /^[a-z0-9_]{3,20}$/.test(h) && h.includes("_");
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<StoredProfile | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(true);
  const [fetching, setFetching] = useState(false);

  // form
  const [nickname, setNickname] = useState("");
  const [fullName, setFullName] = useState("");
  const [programme, setProgramme] = useState(PROGRAMMES[0]);
  const [level, setLevel] = useState(LEVELS[1]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // run dice for suggestions
  const [diceSuggestions, setDiceSuggestions] = useState<string[]>(HANDLE_SUGGESTIONS);
  function shuffleSuggestions() {
    const bases = ["alex", "bisola", "emma", "zainab", "chidi", "tunde", "amara", "david", "faith", "umar", "lara", "simi"];
    const out: string[] = [];
    for (let i = 0; i < 6; i++) {
      const b = bases[Math.floor(Math.random() * bases.length)];
      const n = String(Math.floor(Math.random() * 90 + 10)).padStart(2, "0");
      out.push(`${b}_${n}`);
    }
    setDiceSuggestions(out);
  }

  // load from localStorage + refresh from db
  useEffect(() => {
    try {
      const raw = localStorage.getItem("physi_profile");
      if (raw) {
        const p = JSON.parse(raw) as StoredProfile;
        if (p?.id && p?.nickname) {
          setProfile(p);
          // try refresh in background
          setFetching(true);
          fetch(`/api/profile?id=${encodeURIComponent(p.id)}`, { cache: "no-store" })
            .then((r) => r.json())
            .then((j) => {
              if (j?.ok && j?.user) {
                const u = j.user as StoredProfile;
                setProfile(u);
                localStorage.setItem("physi_profile", JSON.stringify(u));
              }
            })
            .catch(() => {})
            .finally(() => setFetching(false));
        }
      }
    } catch {}
    setLoadingExisting(false);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  function toggleStatus(v: string) {
    setStatuses((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
  }

  const nicknameOk = useMemo(() => hValidLight(nickname.trim().toLowerCase()), [nickname]);
  const fullNameOk = fullName.trim().split(" ").filter(Boolean).length >= 2 && fullName.trim().length >= 5;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const nick = nickname.trim().toLowerCase();
    const name = fullName.trim();
    if (!hValidLight(nick)) {
      setErr("handle needs to look like alex_02 — lowercase, underscore and a number");
      return;
    }
    if (!fullNameOk) {
      setErr("add your full name — first and last, so coursemates know it's you");
      return;
    }
    if (!programme || !level) {
      setErr("pick your programme and level — we use it to show the right gist");
      return;
    }

    setSubmitting(true);
    try {
      const r = await fetch("/api/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nickname: nick,
          full_name: name,
          programme,
          level,
          statuses,
          authority_base: 1.0,
          authority_final: 1.0,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.status === 409 || j?.code === "NICKNAME_TAKEN") {
        setErr(`“${nick}” is taken — someone in your set already grabbed it. Try ${nick.slice(0, -2)}_${String(Math.floor(Math.random() * 90 + 10)).padStart(2, "0")} or another number.`);
        return;
      }
      if (!r.ok || j.ok === false) throw new Error(j.error || j.hint || "couldn't create profile");
      const user = j.user as StoredProfile;
      localStorage.setItem("physi_profile", JSON.stringify(user));
      setProfile(user);
      setToast("handle locked — you can now post and your votes count");
    } catch (e: any) {
      setErr(e.message || "something broke — try again");
    } finally {
      setSubmitting(false);
    }
  }

  function clearProfile() {
    localStorage.removeItem("physi_profile");
    setProfile(null);
    setErr(null);
    setConfirmDelete(false);
    setToast("cleared — pick a new handle");
  }

  async function handleDelete() {
    if (!profile?.id) return;
    setDeleting(true);
    setErr(null);
    try {
      const r = await fetch(`/api/profile?id=${encodeURIComponent(profile.id)}`, { method: "DELETE" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.ok === false) throw new Error(j.error || j.hint || "couldn't delete account");
      localStorage.removeItem("physi_profile");
      localStorage.removeItem("physi_mining_last");
      setProfile(null);
      setConfirmDelete(false);
      setToast("account deleted — handle and votes removed permanently");
    } catch (e: any) {
      setErr(e.message || "delete failed — try again");
    } finally {
      setDeleting(false);
    }
  }

  if (loadingExisting) {
    return (
      <div className="space-y-4">
        <div className="h-28 animate-pulse rounded-[20px] border border-white/[0.06] bg-white/[0.03]" />
        <div className="h-64 animate-pulse rounded-[20px] border border-white/[0.06] bg-white/[0.03]" />
      </div>
    );
  }

  // EXISTING PROFILE VIEW
  if (profile) {
    const ab = Number(profile.authority_base ?? 1).toFixed(2);
    const af = Number(profile.authority_final ?? 1).toFixed(2);
    const bal = Number(profile.mining_balance ?? 0).toFixed(2);
    const initial = (profile.nickname?.[0] ?? profile.full_name?.[0] ?? "?").toUpperCase();
    return (
      <div className="space-y-4">
        <div>
          <p className="font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-slate-500">profile · your handle</p>
          <h1 className="mt-1 text-[22px] font-bold tracking-[-0.025em] text-white sm:text-[26px]">You&apos;re all set</h1>
          <p className="mt-1 max-w-[640px] text-[13.5px] leading-5 text-slate-400">
            This is what your coursemates see when you post or tap Yes. Keep the handle — it&apos;s how your votes earn trust.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          {/* main card */}
          <div className="relative overflow-hidden rounded-[20px] border border-white/[0.08] bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-5 backdrop-blur sm:p-6">
            {/* soft glow */}
            <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-emerald-400/10 blur-[40px]" />
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white text-[18px] font-black tracking-tight text-[#070a12] shadow-[0_4px_20px_rgba(255,255,255,0.15)]">
                {initial}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-[18px] font-bold tracking-tight text-white">@{profile.nickname}</h2>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 font-mono text-[11px] font-medium text-emerald-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> active
                  </span>
                  {fetching && <span className="font-mono text-[11px] text-slate-500">syncing…</span>}
                </div>
                <p className="mt-0.5 truncate text-[14px] font-medium text-slate-200">{profile.full_name}</p>
                <p className="font-mono text-[12px] text-slate-500">
                  {profile.programme} · {profile.level}
                  {profile.created_at ? ` · since ${new Date(profile.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}` : ""}
                </p>
                {(profile.statuses?.length ?? 0) > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {profile.statuses.map((s) => (
                      <span key={s} className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 font-mono text-[11px] text-slate-300">
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* stats row */}
            <div className="mt-5 grid grid-cols-3 gap-2">
              {[
                ["base", ab, "starting weight"],
                ["final", af, "your vote weight"],
                ["TEST-PHYSI", bal, "24h energy"],
              ].map(([k, v, sub]) => (
                <div key={k} className="rounded-2xl border border-white/[0.07] bg-[#0b1020] px-3 py-3 text-center sm:px-4">
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-slate-500">{k}</p>
                  <p className="mt-1 font-mono text-[16px] font-bold tracking-tight text-white">{v}</p>
                  <p className="font-mono text-[10px] leading-none text-slate-500">{sub}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
              <p className="font-mono text-[11px] leading-4 text-slate-400">
                <span className="font-semibold text-slate-200">How your weight helps:</span> every Yes/No you tap counts as <span className="text-white">{af}</span> points toward the green tick.
                Post once, confirm when you&apos;re actually in the hall — that&apos;s how freshers stop missing class.
              </p>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <a href="/app/timetable" className="inline-flex items-center rounded-full bg-white px-5 py-2.5 text-[14px] font-semibold text-[#070a12] shadow-[0_4px_20px_rgba(255,255,255,0.12)] hover:bg-slate-100 transition">
                Go to timetable →
              </a>
              <a href="/app/verify" className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-5 py-2.5 text-[14px] font-medium text-slate-200 hover:bg-white/[0.08] transition">
                Verifygist
              </a>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <button onClick={clearProfile} className="font-mono text-[11px] text-slate-500 hover:text-slate-300">
                  use another handle
                </button>
                {!confirmDelete ? (
                  <button onClick={() => setConfirmDelete(true)} className="inline-flex items-center rounded-full border border-red-500/30 bg-red-500/10 px-4 py-2 font-mono text-[12px] font-medium text-red-300 hover:bg-red-500/20 transition">
                    Delete account
                  </button>
                ) : (
                  <span className="inline-flex flex-wrap items-center gap-2 rounded-xl border border-red-500/30 bg-red-950/40 px-3 py-2">
                    <span className="font-mono text-[11px] text-red-200">Are you sure?</span>
                    <button onClick={handleDelete} disabled={deleting} className="inline-flex items-center rounded-full bg-red-500 px-3 py-1.5 font-mono text-[11px] font-semibold text-white hover:bg-red-600 disabled:opacity-60 transition">
                      {deleting ? "Deleting…" : "Yes delete"}
                    </button>
                    <button onClick={() => setConfirmDelete(false)} disabled={deleting} className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-[11px] font-medium text-slate-300 hover:bg-white/10 transition">
                      Cancel
                    </button>
                  </span>
                )}
              </div>
            </div>
            {confirmDelete && <p className="mt-2 font-mono text-[11px] leading-4 text-red-300/80">Warning: deletes your handle and votes permanently — your verifications and mining history will be removed.</p>}
            {!confirmDelete && <p className="mt-2 font-mono text-[11px] leading-4 text-slate-500">Delete account deletes your handle and votes permanently.</p>}
            {err && <div className="mt-3 rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2.5 font-mono text-[12px] leading-4 text-red-200">{err}</div>}

            <p className="mt-3 font-mono text-[10.5px] leading-3 text-slate-600">
              id {String(profile.id).slice(0, 8)}… · stored in this browser as <code className="rounded bg-white/10 px-1 py-0.5">physi_profile</code> — that&apos;s how timetable counts your vote
            </p>
          </div>

          {/* side card — what happens next */}
          <div className="space-y-3">
            <div className="rounded-[20px] border border-white/[0.06] bg-white/[0.03] p-5">
              <h3 className="text-[14px] font-semibold text-white">What you can do now</h3>
              <ul className="mt-3 space-y-2.5">
                {[
                  ["Post what you heard", "e.g. “ANA 203 moved to LT2, Fri 8am” — shows instantly as advisory."],
                  ["Tap Yes if you were there", "One tap = +1 toward green tick. No essay."],
                  ["Daily check-in", "TEST-PHYSI resets in 24h — keeps your streak honest."],
                ].map(([t, d]) => (
                  <li key={t} className="flex gap-3">
                    <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-[11px] font-bold text-white">✓</span>
                    <div>
                      <p className="text-[13px] font-medium leading-tight text-white">{t}</p>
                      <p className="text-[12.5px] leading-4 text-slate-400">{d}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex gap-2">
                <a href="/app/timetable" className="flex-1 rounded-full bg-white px-3 py-2 text-center text-[13px] font-semibold text-[#070a12]">Open feed</a>
                <a href="/app/mining" className="flex-1 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-center text-[13px] font-medium text-slate-200">Daily check</a>
              </div>
            </div>

            <div className="rounded-2xl border border-amber-400/15 bg-amber-400/[0.06] px-4 py-3">
              <p className="font-mono text-[11px] leading-4 text-amber-200/70">
                Keep your handle consistent. If you switch to a new one you lose your streak. Advisory feed only — for exams, confirm with your department board.
              </p>
            </div>
          </div>
        </div>

        {toast && (
          <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full border border-white/10 bg-[#0f172a] px-4 py-2 text-[13px] font-medium text-white shadow-[0_8px_30px_rgba(0,0,0,0.5)]">{toast}</div>
        )}
      </div>
    );
  }

  // CREATE FORM VIEW
  return (
    <div className="space-y-4">
      <div>
        <p className="font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-slate-500">profile · pick your handle</p>
        <h1 className="mt-1 text-[22px] font-bold tracking-[-0.025em] text-white sm:text-[26px]">Your handle is your word</h1>
        <p className="mt-1 max-w-[640px] text-[13.5px] leading-5 text-slate-400">
          No one trusts “Dream” for a venue change. Pick something your coursemates will recognise — like <span className="rounded bg-white/10 px-1 py-0.5 font-mono text-slate-200">alex_02</span> or{" "}
          <span className="rounded bg-white/10 px-1 py-0.5 font-mono text-slate-200">bisola_11</span>. That&apos;s how your Yes earns a green tick.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        {/* form */}
        <form onSubmit={handleSubmit} className="rounded-[20px] border border-white/[0.08] bg-white/[0.04] p-4 backdrop-blur sm:p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-[14px] font-semibold text-white">Create your profile</h2>
            <span className="font-mono text-[10.5px] text-slate-500">one handle · all votes</span>
          </div>
          <p className="mt-1 text-[12.5px] text-slate-400">Takes 20 seconds. You can switch later but you&apos;ll lose streak — pick one you&apos;ll keep.</p>

          {/* handle */}
          <label className="mt-4 block space-y-1.5">
            <span className="font-mono text-[10.5px] uppercase tracking-wide text-slate-500">Handle — choose wisely</span>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[14px] text-slate-500">@</span>
              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                placeholder="alex_02"
                maxLength={20}
                className="w-full rounded-xl border border-white/10 bg-[#0b1020] py-2.5 pl-7 pr-3 font-mono text-[14px] text-white placeholder:text-slate-500 focus:border-white/20 focus:outline-none"
              />
              <span className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[11px] ${nicknameOk ? "text-emerald-400" : "text-slate-500"}`}>
                {nickname ? (nicknameOk ? "✓" : "—") : ""}
              </span>
            </div>
            <span className={`block font-mono text-[11px] ${nickname && !nicknameOk ? "text-amber-300" : "text-slate-500"}`}>{handleHint(nickname.toLowerCase())}</span>
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="font-mono text-[11px] text-slate-600">tap to try:</span>
              {diceSuggestions.map((s) => (
                <button key={s} type="button" onClick={() => setNickname(s)} className={`rounded-full border px-2.5 py-1 font-mono text-[11px] transition ${nickname === s ? "border-white bg-white text-[#070a12]" : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] hover:text-white"}`}>
                  {s}
                </button>
              ))}
              <button type="button" onClick={shuffleSuggestions} className="font-mono text-[11px] text-slate-500 hover:text-slate-300">
                ↻ shuffle
              </button>
            </div>
          </label>

          <label className="mt-4 block space-y-1.5">
            <span className="font-mono text-[10.5px] uppercase tracking-wide text-slate-500">Full name</span>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Aisha Bello"
              className="w-full rounded-xl border border-white/10 bg-[#0b1020] px-3 py-2.5 text-[14px] text-white placeholder:text-slate-500 focus:border-white/20 focus:outline-none"
            />
            <span className="block font-mono text-[11px] text-slate-500">first + last — so your rep knows it&apos;s really you, not gist</span>
          </label>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="font-mono text-[10.5px] uppercase tracking-wide text-slate-500">Programme</span>
              <select value={programme} onChange={(e) => setProgramme(e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#0b1020] px-3 py-2.5 text-[14px] text-white focus:border-white/20 focus:outline-none">
                {PROGRAMMES.map((p) => (
                  <option key={p} value={p} className="bg-[#0b1020]">
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="font-mono text-[10.5px] uppercase tracking-wide text-slate-500">Level</span>
              <select value={level} onChange={(e) => setLevel(e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#0b1020] px-3 py-2.5 text-[14px] text-white focus:border-white/20 focus:outline-none">
                {LEVELS.map((l) => (
                  <option key={l} value={l} className="bg-[#0b1020]">
                    {l}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-4">
            <span className="font-mono text-[10.5px] uppercase tracking-wide text-slate-500">Roles (optional — helps your weight make sense)</span>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {STATUS_OPTIONS.map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => toggleStatus(o.v)}
                  className={`rounded-full border px-3 py-1.5 text-[13px] font-medium transition ${statuses.includes(o.v) ? "border-white bg-white text-[#070a12]" : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.07] hover:text-white"}`}
                >
                  {statuses.includes(o.v) ? "✓ " : "+ "}
                  {o.l}
                </button>
              ))}
            </div>
            <p className="mt-1.5 font-mono text-[11px] text-slate-500">you can leave blank — it&apos;s just context for later</p>
          </div>

          {err && <div className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2.5 font-mono text-[12px] leading-4 text-red-200">{err}</div>}

          <div className="mt-5 flex items-center gap-3">
            <button disabled={submitting} className="inline-flex items-center justify-center rounded-full bg-white px-6 py-2.5 text-[14px] font-semibold text-[#070a12] shadow-[0_4px_20px_rgba(255,255,255,0.12)] hover:bg-slate-100 disabled:opacity-60 transition">
              {submitting ? "Creating…" : "Create handle →"}
            </button>
            <span className="font-mono text-[11px] text-slate-500">saves to this browser · <code className="rounded bg-white/10 px-1">physi_profile</code></span>
          </div>
        </form>

        {/* preview + explain */}
        <div className="space-y-3">
          <div className="rounded-[20px] border border-white/[0.06] bg-white/[0.03] p-5">
            <p className="font-mono text-[10.5px] uppercase tracking-wide text-slate-500">Preview</p>
            <div className="mt-3 flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-[#0b1020] px-4 py-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[13px] font-black text-[#070a12]">{(nickname?.[0] ?? "?").toUpperCase()}</div>
              <div className="min-w-0">
                <p className="truncate font-mono text-[13px] font-semibold text-white">@{nickname || "alex_02"}</p>
                <p className="truncate text-[13px] text-slate-300">{fullName || "Your name here"}</p>
                <p className="font-mono text-[11px] text-slate-500">
                  {programme} · {level}
                </p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[
                ["base", "1.00"],
                ["final", "1.00"],
                ["TEST-PHYSI", "0.00"],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl border border-white/5 bg-white/[0.03] px-2 py-2 text-center">
                  <p className="font-mono text-[10px] uppercase tracking-wide text-slate-500">{k}</p>
                  <p className="font-mono text-[13px] font-bold text-white">{v}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 font-mono text-[11px] leading-4 text-slate-500">
              Starter weight is 1.00. Post gist that gets confirmed and your final creeps up — your next Yes counts for more.
            </p>
          </div>

          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-4">
            <p className="text-[13px] font-semibold text-white">Why this matters for timetable</p>
            <p className="mt-1 text-[12.5px] leading-5 text-slate-400">
              Timetable asks “were you there?” and needs your handle to count it. No profile → vote button nudges you here first. With a handle, your
              Yes/No is stored as <span className="text-slate-200">physi_verifications</span> and pushes the post toward that{" "}
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[11px] font-bold text-white">✓ green</span> tick.
            </p>
            <div className="mt-3 rounded-xl bg-amber-400/10 px-3 py-2">
              <p className="font-mono text-[11px] leading-4 text-amber-200/75">
                Your handle is stored only in this browser and in the pilot DB. No password yet — don&apos;t pick your bank PIN. We&apos;ll add auth later; your handle is just how your set recognises you today.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-center font-mono text-[10.5px] leading-4 text-slate-600">
        PHYSI pilot · handle like <code className="rounded bg-white/10 px-1">alex_02</code> not “John Doe” or “Dream” · advisory only — confirm exams with your department
      </div>

      {toast && <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full border border-white/10 bg-[#0f172a] px-4 py-2 text-[13px] font-medium text-white shadow-[0_8px_30px_rgba(0,0,0,0.5)]">{toast}</div>}
    </div>
  );
}
