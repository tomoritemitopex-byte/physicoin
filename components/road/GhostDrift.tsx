"use client";
import { useEffect, useState } from "react";
import { ghostForSeed } from "@/lib/ghostAvatar";
import GhostAvatar from "@/components/road/GhostAvatar";

/**
 * GhostDrift — Client Component owning ALL ephemeral ghost animation.
 * Ghosts are UI-only (CSS `ghost-drift`, never persisted, no DB rows).
 * Re-seeds its form every 4.5s so the avatar morphs without any fetch.
 */
export default function GhostDrift({
  seedKey,
  size = 28,
  label,
  animate = true,
}: {
  seedKey: string;
  size?: number;
  label?: string;
  animate?: boolean;
}) {
  const [form, setForm] = useState(() => ghostForSeed(seedKey, Date.now()));

  useEffect(() => {
    if (!animate) return;
    const iv = setInterval(() => {
      setForm(ghostForSeed(seedKey, Date.now()));
    }, 4500);
    return () => clearInterval(iv);
  }, [seedKey, animate]);

  return <GhostAvatar form={form} size={size} label={label} animate={animate} />;
}

/**
 * GhostDots — animated row of up-to-N verifier dots for an event card.
 * Same 4.5s re-seed rhythm as GhostDrift, no network involved.
 */
export function GhostDots({
  baseKey,
  count,
  size = 16,
}: {
  baseKey: string;
  count: number;
  size?: number;
}) {
  const n = Math.max(0, Math.min(5, count));
  const [tick, setTick] = useState(() => Date.now());

  useEffect(() => {
    if (n === 0) return;
    const iv = setInterval(() => setTick(Date.now()), 4500);
    return () => clearInterval(iv);
  }, [n]);

  if (n === 0) return null;

  return (
    <div className="ghost-row">
      {Array.from({ length: n }).map((_, gi) => {
        const gf = ghostForSeed(`${baseKey}-${gi}`, tick + gi * 1013);
        return (
          <span
            key={gi}
            className="ghost-dot inline-block rounded-full"
            style={{ background: gf.fg, width: size, height: size, border: "2px solid rgba(12,30,58,0.5)" }}
            aria-hidden="true"
          />
        );
      })}
    </div>
  );
}
