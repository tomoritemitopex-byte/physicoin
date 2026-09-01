/**
 * lib/squadLocator.ts — Find My People helpers
 * Anonymous presence pings by programme+level, heat dots, wave back (5min TTL)
 * Reuses presence/campus/ghost infra. Student-friendly labels only.
 */
export const PING_TTL_MIN = 12;
export const WAVE_TTL_MIN = 5;
export const HEAT_TTL_MIN = 12;

export function heatIntensity(count: number): "low" | "mid" | "hot" {
  if (count >= 5) return "hot";
  if (count >= 2) return "mid";
  return "low";
}

export function anonLabel(idx: number): string {
  const names = ["Someone nearby", "A coursemate", "Your people", "Squad member", "A friend"];
  return names[idx % names.length];
}

export const GHOST_WAVE_ACTIONS = {
  PING: "squad:ping",
  WAVE: "squad:wave",
} as const;
