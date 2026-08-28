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

function formatCooldown(ms: number) {
  if (ms <= 0) return "00:00:00";
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function MiningPanel({
  initialNickname = "",
}: {
  initialNickname?: string;
}) {
  const [nickname, setNickname] = useState(initialNickname);
  const [data, setData] = useState<MiningState | null>(null);
  const [remainingMs, setRemainingMs] = useState(0);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "info">("info");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
      setMessage("");
    } catch {
      setMessageType("error");
      setMessage("Network error loading mining data");
    } finally {
      setFetching(false);
    }
  }, []);

  // Countdown timer
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (remainingMs <= 0 || data?.canMine) return;
    timerRef.current = setInterval(() => {
      setRemainingMs((prev) => {
        const next = prev - 1000;
        if (next <= 0) {
          if (timerRef.current) clearInterval(timerRef.current);
          // refresh to update canMine
          if (nickname.trim()) fetchMining(nickname.trim());
          return 0;
        }
        return next;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [remainingMs, data?.canMine, nickname, fetchMining]);

  // Initial fetch if nickname provided
  useEffect(() => {
    if (initialNickname.trim()) fetchMining(initialNickname.trim());
  }, [initialNickname, fetchMining]);

  async function handleMine() {
    if (!nickname.trim()) {
      setMessageType("error");
      setMessage("Enter your nickname first");
      return;
    }
    setLoading(true);
    setMessage("");
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
        } else {
          setMessageType("error");
          setMessage(json.error || "Mining failed");
        }
        return;
      }
      setMessageType("success");
      setMessage(`Mined +${Number(json.earned).toFixed(2)} PHYSI! New balance: ${Number(json.balance).toFixed(2)}`);
      // Update local state
      setData((prev) =>
        prev
          ? {
              ...prev,
              balance: Number(json.balance),
              canMine: false,
              nextMineAt: json.nextMineAt,
              remainingMs: 24 * 60 * 60 * 1000,
              history: json.log ? [json.log, ...prev.history] : prev.history,
            }
          : {
              balance: Number(json.balance),
              authority_final: Number(json.authority_multiplier ?? 1),
              canMine: false,
              nextMineAt: json.nextMineAt,
              remainingMs: 24 * 60 * 60 * 1000,
              history: json.log ? [json.log] : [],
            }
      );
      setRemainingMs(24 * 60 * 60 * 1000);
    } catch {
      setMessageType("error");
      setMessage("Network error during mining");
    } finally {
      setLoading(false);
    }
  }

  const canMineNow = data ? data.canMine && remainingMs <= 0 : false;
  const displayBalance = data ? data.balance.toFixed(2) : "--";
  const authorityMultiplier = data ? Number(data.authority_final).toFixed(2) + "x" : "--";
  const expectedReward = data ? (10 * Number(data.authority_final)).toFixed(2) : "10.00";

  return (
    <section className="rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-amber-300">Mining Engine</p>
          <h3 className="mt-2 text-2xl font-black text-white">Daily Tap-to-Mine</h3>
          <p className="mt-1 text-sm text-slate-400">10 × authority multiplier · 24h cooldown · daily loop</p>
        </div>
        <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-300">
          {data?.canMine ? "Ready to mine" : remainingMs > 0 ? "Cooling down" : "Enter nickname"}
        </span>
      </div>

      {/* Nickname input */}
      <div className="mt-6 flex gap-3">
        <input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && fetchMining(nickname)}
          placeholder="Enter nickname"
          className="flex-1 rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-amber-400/50"
        />
        <button
          onClick={() => fetchMining(nickname)}
          disabled={fetching || !nickname.trim()}
          className="rounded-2xl bg-white px-5 py-3 text-sm font-black text-slate-950 disabled:opacity-40"
        >
          {fetching ? "..." : "Load"}
        </button>
      </div>

      {/* Stats row */}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Balance</p>
          <p className="mt-2 text-2xl font-black text-white">{displayBalance}</p>
          <p className="text-xs text-amber-300">PHYSI</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Authority</p>
          <p className="mt-2 text-2xl font-black text-white">{authorityMultiplier}</p>
          <p className="text-xs text-sky-300">multiplier</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Next Reward</p>
          <p className="mt-2 text-2xl font-black text-white">{expectedReward}</p>
          <p className="text-xs text-emerald-300">10 × authority</p>
        </div>
      </div>

      {/* Cooldown timer */}
      {remainingMs > 0 && !canMineNow && (
        <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300">Cooldown</p>
          <p className="mt-1 font-mono text-2xl font-black text-white">{formatCooldown(remainingMs)}</p>
          {data?.nextMineAt && (
            <p className="mt-1 text-xs text-slate-400">Next mine: {new Date(data.nextMineAt).toLocaleString()}</p>
          )}
        </div>
      )}

      {/* Tap to Mine */}
      <button
        onClick={handleMine}
        disabled={loading || !canMineNow}
        className={`mt-6 flex w-full items-center justify-center gap-3 rounded-2xl px-6 py-4 text-lg font-black shadow-lg transition ${
          canMineNow
            ? "bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-500 text-slate-900 shadow-amber-500/20 hover:brightness-110"
            : "border border-white/10 bg-white/5 text-slate-400 cursor-not-allowed"
        }`}
      >
        {loading ? (
          "Mining..."
        ) : canMineNow ? (
          <>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-amber-400">$</span>
            Tap to Mine
          </>
        ) : remainingMs > 0 ? (
          `Cooldown ${formatCooldown(remainingMs)}`
        ) : (
          "Load profile to mine"
        )}
      </button>

      {message && (
        <p
          className={`mt-3 rounded-xl px-4 py-2 text-sm font-semibold ${
            messageType === "success"
              ? "bg-emerald-400/10 text-emerald-300 border border-emerald-400/20"
              : messageType === "error"
                ? "bg-red-400/10 text-red-300 border border-red-400/20"
                : "bg-white/5 text-slate-300 border border-white/10"
          }`}
        >
          {message}
        </p>
      )}

      {/* History */}
      {data && data.history.length > 0 && (
        <div className="mt-6">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-slate-400">Mining History ({data.history.length})</p>
          <div className="mt-3 max-h-64 space-y-2 overflow-auto pr-1">
            {data.history.map((h) => (
              <div key={h.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-900/40 px-4 py-3">
                <div>
                  <p className="text-sm font-bold text-white">+{Number(h.earned_amount).toFixed(2)} PHYSI</p>
                  <p className="text-xs text-slate-400">
                    {new Date(h.created_at).toLocaleString()} · {Number(h.authority_multiplier).toFixed(2)}x
                  </p>
                </div>
                <span className="rounded-full bg-amber-400/15 px-3 py-1 text-xs font-bold text-amber-300">
                  {Number(h.base_reward).toFixed(0)} × {Number(h.authority_multiplier).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data && data.history.length === 0 && (
        <p className="mt-6 text-center text-sm text-slate-500">No mining history yet. Tap to start your daily loop!</p>
      )}
    </section>
  );
}
