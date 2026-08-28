"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type MiningHistory = {
  id: string;
  earned_amount: string | number;
  base_reward: string | number;
  authority_multiplier: string | number;
  created_at: string;
};

type MiningState = {
  balance: number;
  authority_final: number;
  canMine: boolean;
  nextMineAt: string | null;
  remainingMs: number;
  history: MiningHistory[];
};

const COOLDOWN_MS = 24 * 60 * 60 * 1000;

function formatCooldown(ms: number) {
  if (ms <= 0) return "00:00:00";
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function tierFromAuthority(v: number) {
  if (v >= 2) return { label: "Authority", icon: "◆", cls: "from-violet-500 to-fuchsia-500 border-violet-400/30 text-white" };
  if (v >= 1.5) return { label: "Elite", icon: "⬢", cls: "from-amber-400 to-orange-500 border-amber-400/30 text-slate-900" };
  if (v >= 1.2) return { label: "Trusted", icon: "●", cls: "from-emerald-400 to-teal-500 border-emerald-400/30 text-slate-900" };
  if (v >= 1.0) return { label: "Verified", icon: "◉", cls: "from-sky-400 to-blue-500 border-sky-400/30 text-white" };
  return { label: "Novice", icon: "○", cls: "from-slate-600 to-slate-700 border-white/15 text-slate-200" };
}

function useCountUp(target: number, duration = 900) {
  const [display, setDisplay] = useState(target);
  const prevRef = useRef(target);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = prevRef.current;
    const to = target;
    if (from === to) return;
    const start = performance.now();
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const v = from + (to - from) * ease(p);
      setDisplay(v);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
      else prevRef.current = to;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration]);

  useEffect(() => {
    // sync if no animation pending on mount
    if (prevRef.current === display) {
      prevRef.current = target;
      setDisplay(target);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return display;
}

export function MiningPanel({ initialNickname = "" }: { initialNickname?: string }) {
  const [nickname, setNickname] = useState(initialNickname);
  const [data, setData] = useState<MiningState | null>(null);
  const [remainingMs, setRemainingMs] = useState(0);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "info">("info");
  const [pulse, setPulse] = useState(false);
  const [burst, setBurst] = useState(false);
  const [shake, setShake] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const animatedBalance = useCountUp(data?.balance ?? 0);

  const fetchMining = useCallback(async (nick: string) => {
    if (!nick.trim()) return;
    setFetching(true);
    try {
      const res = await fetch(`/api/mining?nickname=${encodeURIComponent(nick.trim())}`);
      const json = await res.json();
      if (!json.ok) {
        if (res.status === 404) {
          setMessageType("error");
          setMessage("User not found. Create profile first.");
        } else {
          setMessageType("error");
          setMessage(json.error || "Could not load mining data");
        }
        return;
      }
      setData({
        balance: Number(json.balance ?? 0),
        authority_final: Number(json.authority_final ?? 1),
        canMine: Boolean(json.canMine),
        nextMineAt: json.nextMineAt ?? null,
        remainingMs: Number(json.remainingMs ?? 0),
        history: json.history ?? [],
      });
      setRemainingMs(Number(json.remainingMs ?? 0));
      if (json.canMine) triggerHaptic("light");
      setMessage("");
    } catch {
      setMessageType("error");
      setMessage("Network error loading mining data");
      triggerShake();
    } finally {
      setFetching(false);
    }
  }, []);

  function triggerHaptic(kind: "light" | "success" | "error" = "light") {
    try {
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        if (kind === "success") navigator.vibrate([15, 30, 15, 30, 40]);
        else if (kind === "error") navigator.vibrate([40, 30, 40]);
        else navigator.vibrate(12);
      }
    } catch {}
  }
  function triggerShake() {
    setShake(true);
    setTimeout(() => setShake(false), 420);
  }

  // Countdown
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (remainingMs <= 0 || data?.canMine) return;
    timerRef.current = setInterval(() => {
      setRemainingMs((prev) => {
        const next = prev - 1000;
        if (next <= 0) {
          if (timerRef.current) clearInterval(timerRef.current);
          if (nickname.trim()) fetchMining(nickname.trim());
          triggerHaptic("success");
          return 0;
        }
        return next;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [remainingMs, data?.canMine, nickname, fetchMining]);

  useEffect(() => {
    if (initialNickname.trim()) fetchMining(initialNickname.trim());
  }, [initialNickname, fetchMining]);

  async function handleMine() {
    if (!nickname.trim()) {
      setMessageType("error");
      setMessage("Enter your nickname first");
      triggerHaptic("error");
      triggerShake();
      return;
    }
    if (!data?.canMine) {
      triggerHaptic("error");
      triggerShake();
    }
    setLoading(true);
    setMessage("");
    // optimistic pulse start
    setPulse(true);
    setTimeout(() => setPulse(false), 700);
    try {
      const res = await fetch("/api/mining", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: nickname.trim() }),
      });
      const json = await res.json();
      if (!json.ok) {
        if (res.status === 429) {
          setMessageType("error");
          setMessage(`Cooldown active. Next mine at ${new Date(json.nextMineAt).toLocaleString()}`);
          setRemainingMs(Number(json.remainingMs ?? 0));
          if (data) setData({ ...data, canMine: false, nextMineAt: json.nextMineAt, remainingMs: json.remainingMs });
          triggerHaptic("error");
          triggerShake();
        } else {
          setMessageType("error");
          setMessage(json.error || "Mining failed");
          triggerHaptic("error");
          triggerShake();
        }
        return;
      }
      // success burst
      setBurst(true);
      setTimeout(() => setBurst(false), 900);
      triggerHaptic("success");
      setMessageType("success");
      setMessage(`+${Number(json.earned).toFixed(2)} PHYSI mined! New balance ${Number(json.balance).toFixed(2)}`);
      setData((prev) =>
        prev
          ? {
              ...prev,
              balance: Number(json.balance),
              canMine: false,
              nextMineAt: json.nextMineAt,
              remainingMs: COOLDOWN_MS,
              history: json.log ? [json.log, ...prev.history] : prev.history,
            }
          : {
              balance: Number(json.balance),
              authority_final: Number(json.authority_multiplier ?? 1),
              canMine: false,
              nextMineAt: json.nextMineAt,
              remainingMs: COOLDOWN_MS,
              history: json.log ? [json.log] : [],
            }
      );
      setRemainingMs(COOLDOWN_MS);
    } catch {
      setMessageType("error");
      setMessage("Network error during mining");
      triggerHaptic("error");
      triggerShake();
    } finally {
      setLoading(false);
    }
  }

  const canMineNow = data ? data.canMine && remainingMs <= 0 : false;
  const tier = data ? tierFromAuthority(Number(data.authority_final)) : tierFromAuthority(0);
  const progress = remainingMs > 0 ? 1 - remainingMs / COOLDOWN_MS : canMineNow ? 1 : 0;
  // ring math
  const R = 72;
  const C = 2 * Math.PI * R;
  const dashOffset = C * (1 - progress);

  const displayBalance = data ? animatedBalance.toFixed(2) : "--";
  const authorityMultiplier = data ? Number(data.authority_final).toFixed(2) + "x" : "--";
  const expectedReward = data ? (10 * Number(data.authority_final)).toFixed(2) : "10.00";

  return (
    <section
      className={`relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.06] p-6 shadow-2xl backdrop-blur ${shake ? "animate-[shake_0.42s_ease]" : ""}`}
    >
      {/* ambient glow */}
      <div className="pointer-events-none absolute -top-28 -right-28 h-72 w-72 rounded-full bg-amber-400/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl" />

      {/* header */}
      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.32em] text-amber-300">Mining Engine · Daily Loop</p>
          <h3 className="mt-2 flex items-center gap-2 text-2xl font-black text-white">
            Daily Tap-to-Mine
            <span className="rounded-full bg-white px-2.5 py-0.5 text-[10px] font-black tracking-widest text-slate-900">PHYSI</span>
          </h3>
          <p className="mt-1 text-sm text-slate-400">10 × authority multiplier · 24h cooldown · on-chain via physi_mining_logs</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-black tracking-wide ${canMineNow ? "border-emerald-400/30 bg-emerald-400/15 text-emerald-300" : remainingMs > 0 ? "border-amber-400/25 bg-amber-400/10 text-amber-300" : "border-white/10 bg-white/5 text-slate-300"}`}
          >
            <span className={`h-2 w-2 rounded-full ${canMineNow ? "bg-emerald-400 animate-pulse" : remainingMs > 0 ? "bg-amber-400" : "bg-slate-400"}`} />
            {canMineNow ? "Ready to mine" : remainingMs > 0 ? "Cooling down" : "Enter nickname"}
          </span>
          {data && (
            <span className={`inline-flex items-center gap-1.5 rounded-full border bg-gradient-to-br px-3 py-1 text-xs font-black ${tier.cls}`}>
              <span className="text-[10px]">{tier.icon}</span> {tier.label} · {authorityMultiplier}
            </span>
          )}
        </div>
      </div>

      {/* nickname */}
      <div className="relative mt-6 flex gap-3">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500">@</span>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && fetchMining(nickname)}
            placeholder="Enter nickname"
            className="w-full rounded-2xl border border-white/10 bg-slate-950/70 py-3 pl-8 pr-4 text-sm font-semibold text-white outline-none placeholder:text-slate-500 focus:border-amber-400/40 focus:bg-slate-950"
          />
        </div>
        <button
          onClick={() => fetchMining(nickname)}
          disabled={fetching || !nickname.trim()}
          className="rounded-2xl bg-white px-5 py-3 text-sm font-black text-slate-950 shadow-lg shadow-black/20 transition hover:bg-slate-100 active:scale-[0.98] disabled:opacity-40"
        >
          {fetching ? "…" : "Load"}
        </button>
      </div>

      {/* hero: balance + coin */}
      <div className="relative mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        {/* balance card */}
        <div className="rounded-[1.75rem] border border-white/10 bg-slate-900/70 p-5 backdrop-blur">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Balance</p>
            <span className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-bold text-slate-300">PHYSI</span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <p className="text-4xl font-black tabular-nums tracking-tight text-white">
              {displayBalance === "--" ? "--" : displayBalance}
            </p>
            <span className="text-sm font-black text-amber-300">PHYSI</span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-300 to-orange-500 transition-all duration-700"
              style={{ width: `${data ? Math.min(100, (data.balance / 500) * 100) : 0}%` }}
            />
          </div>
          <p className="mt-2 text-xs font-medium text-slate-500">
            {data ? `${data.history.length} taps · next +${expectedReward} PHYSI` : "Load profile to see balance ticker"}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Authority</p>
              <p className="mt-1 text-lg font-black text-white">{authorityMultiplier}</p>
              <p className="text-xs font-semibold text-sky-300">multiplier</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Next Reward</p>
              <p className="mt-1 text-lg font-black text-white">{expectedReward}</p>
              <p className="text-xs font-semibold text-emerald-300">10 × authority</p>
            </div>
          </div>
        </div>

        {/* coin + ring */}
        <div className="flex flex-col items-center justify-center rounded-[1.75rem] border border-white/10 bg-gradient-to-br from-slate-900/80 to-slate-950/80 p-6">
          <div className="relative flex h-[170px] w-[170px] items-center justify-center">
            {/* cooldown ring */}
            <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 160 160">
              <circle cx="80" cy="80" r={R} stroke="rgba(255,255,255,0.08)" strokeWidth="8" fill="none" />
              <circle
                cx="80"
                cy="80"
                r={R}
                stroke={canMineNow ? "#facc15" : remainingMs > 0 ? "#f59e0b" : "rgba(255,255,255,0.2)"}
                strokeWidth="8"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={dashOffset}
                style={{ transition: "stroke-dashoffset 1s linear, stroke 0.3s" }}
              />
            </svg>
            {/* pulse halo */}
            {canMineNow && <span className="absolute inset-2 rounded-full bg-amber-400/10 animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite]" />}
            {burst && <span className="absolute inset-0 rounded-full bg-amber-400/20 animate-[ping_0.7s_ease_out]" />}
            {/* coin */}
            <button
              onClick={handleMine}
              disabled={loading || !canMineNow}
              aria-label="Tap to mine"
              className={`relative flex h-[116px] w-[116px] items-center justify-center rounded-full bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-500 text-4xl font-black text-slate-900 shadow-[0_12px_40px_rgba(245,158,11,0.35)] transition-all duration-200 ${canMineNow ? "hover:scale-[1.03] active:scale-[0.96] cursor-pointer" : "grayscale-[0.25] opacity-90 cursor-not-allowed"} ${pulse ? "animate-[coinPulse_0.6s_ease]" : ""} ${loading ? "opacity-70" : ""}`}
            >
              $
              {burst && (
                <>
                  <span className="pointer-events-none absolute -top-1 -right-1 animate-[floatUp_0.9s_ease_forwards] text-sm font-black text-amber-300">+{expectedReward}</span>
                  <span className="pointer-events-none absolute -bottom-1 -left-2 animate-[floatUp_0.9s_0.12s_ease_forwards] text-xs font-black text-white">◆</span>
                </>
              )}
            </button>
          </div>

          {/* cooldown label */}
          {remainingMs > 0 ? (
            <div className="mt-3 text-center">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300">Cooldown</p>
              <p className="mt-1 font-mono text-2xl font-black tabular-nums text-white">{formatCooldown(remainingMs)}</p>
              {data?.nextMineAt && <p className="mt-1 text-xs text-slate-400">Next mine: {new Date(data.nextMineAt).toLocaleString()}</p>}
              <div className="mt-2 h-1 w-40 overflow-hidden rounded-full bg-white/10">
                <div className="h-full bg-amber-400 transition-all duration-1000" style={{ width: `${progress * 100}%` }} />
              </div>
            </div>
          ) : canMineNow ? (
            <p className="mt-3 animate-pulse text-sm font-black text-amber-300">Tap the coin to mine!</p>
          ) : (
            <p className="mt-3 text-sm font-medium text-slate-500">Load your nickname to begin</p>
          )}
        </div>
      </div>

      {/* Tap to Mine primary CTA */}
      <button
        onClick={handleMine}
        disabled={loading || !canMineNow}
        className={`mt-6 flex w-full items-center justify-center gap-3 rounded-2xl px-6 py-4 text-base font-black shadow-lg transition-all active:scale-[0.99] ${
          canMineNow
            ? "bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-500 text-slate-900 shadow-amber-500/20 hover:brightness-[1.06]"
            : "border border-white/10 bg-white/5 text-slate-400 cursor-not-allowed"
        }`}
      >
        {loading ? (
          <span className="inline-flex items-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-900 border-t-transparent" /> Mining…
          </span>
        ) : canMineNow ? (
          <>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-amber-400 shadow-inner">$</span>
            Tap to Mine · +{expectedReward} PHYSI
          </>
        ) : remainingMs > 0 ? (
          `Cooldown ${formatCooldown(remainingMs)}`
        ) : (
          "Load profile to mine"
        )}
      </button>

      {message && (
        <p
          className={`mt-3 rounded-xl border px-4 py-2.5 text-sm font-semibold leading-6 ${
            messageType === "success"
              ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
              : messageType === "error"
                ? "border-red-400/20 bg-red-400/10 text-red-300"
                : "border-white/10 bg-white/5 text-slate-300"
          }`}
        >
          {message}
        </p>
      )}

      {/* History timeline */}
      <div className="mt-6">
        <div className="flex items-center justify-between">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-400">Mining Feed {data ? `· ${data.history.length}` : ""}</p>
          {data && data.history.length > 0 && <span className="text-xs font-semibold text-slate-500">latest first · 50 max</span>}
        </div>

        {!data ? (
          <div className="mt-3 rounded-2xl border border-dashed border-white/15 bg-white/[0.03] px-6 py-10 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 text-xl">⛏️</div>
            <p className="mt-3 text-sm font-bold text-white">No profile loaded</p>
            <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-slate-500">Enter your nickname above and tap Load to see your balance, cooldown, and mining timeline.</p>
          </div>
        ) : data.history.length === 0 ? (
          <div className="mt-3 rounded-2xl border border-dashed border-white/15 bg-gradient-to-br from-amber-400/[0.06] to-transparent px-6 py-10 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-amber-500 text-2xl font-black text-slate-900 shadow-lg">
              $
            </div>
            <p className="mt-4 text-sm font-black text-white">No mining history yet</p>
            <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-slate-400">Your daily tap creates a log in <span className="font-mono text-xs text-amber-300">physi_mining_logs</span>. Tap the coin to start your loop!</p>
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-400/10 px-4 py-1.5 text-xs font-bold text-amber-300">
              <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" /> Ready when you are
            </div>
          </div>
        ) : (
          <div className="relative mt-4 max-h-[360px] overflow-auto pr-1">
            <div className="absolute bottom-0 left-[18px] top-2 w-px bg-gradient-to-b from-white/15 via-white/10 to-transparent" />
            <div className="space-y-3">
              {data.history.map((h) => {
                const earned = Number(h.earned_amount);
                const mult = Number(h.authority_multiplier);
                const d = new Date(h.created_at);
                return (
                  <div key={h.id} className="relative flex gap-3 pl-1">
                    <div className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-amber-400/20 bg-gradient-to-br from-amber-400/25 to-orange-500/20 text-amber-300 shadow">
                      <span className="text-xs font-black">◆</span>
                    </div>
                    <div className="flex flex-1 items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 backdrop-blur">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-sm font-black text-white">
                          <span className="tabular-nums">+{earned.toFixed(2)} PHYSI</span>
                          <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] font-bold text-emerald-300">+{earned.toFixed(2)}</span>
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                          <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 font-mono text-[11px] text-slate-300">
                            {d.toLocaleDateString()} · {d.toLocaleTimeString()}
                          </span>
                          <span className="hidden sm:inline text-slate-600">·</span>
                          <span className="inline-flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
                            {mult.toFixed(2)}x authority
                          </span>
                        </p>
                      </div>
                      <span className="hidden shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold tabular-nums text-slate-200 sm:inline-flex">
                        {Number(h.base_reward).toFixed(0)} × {mult.toFixed(2)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes coinPulse { 0%{transform:scale(1)} 30%{transform:scale(1.08)} 60%{transform:scale(0.98)} 100%{transform:scale(1)} }
        @keyframes ping { 75%,100%{transform:scale(1.08);opacity:0} }
        @keyframes floatUp { 0%{transform:translateY(0);opacity:1} 100%{transform:translateY(-18px);opacity:0} }
        @keyframes shake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-4px)} 40%{transform:translateX(4px)} 60%{transform:translateX(-3px)} 80%{transform:translateX(3px)} }
      `}</style>
    </section>
  );
}
