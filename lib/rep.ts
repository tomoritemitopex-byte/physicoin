/**
 * lib/rep.ts — Rep decay engine
 * Half-life model: rep(t) = rep0 * 0.5^(t / halfLife)
 * - Global rep half-life 14 days
 * - Inactive daily decay 2% (0.98^days) applied when no verify/mine in last 24h
 * - Profile curve half-life 9 days (authority decay on profile page)
 * Exposes decay helpers + curve for sparklines.
 */

export const REP_HALF_LIFE_DAYS = 14;
export const REP_DAILY_INACTIVE_RATE = 0.02; // 2%
export const PROFILE_HALF_LIFE_DAYS = 9;

/** Exponential half-life decay: rep0 * 0.5^(days/halfLife) */
export function decayByHalfLife(rep0: number, days: number, halfLife: number = REP_HALF_LIFE_DAYS): number {
  if (rep0 <= 0 || days <= 0) return Number(rep0) || 0;
  const factor = Math.pow(0.5, days / halfLife);
  return Number((rep0 * factor).toFixed(2));
}

/** 2% daily inactive decay: rep0 * 0.98^days */
export function decayInactive(rep0: number, inactiveDays: number): number {
  if (rep0 <= 0 || inactiveDays <= 0) return Number(rep0) || 0;
  const factor = Math.pow(1 - REP_DAILY_INACTIVE_RATE, inactiveDays);
  return Number((rep0 * factor).toFixed(2));
}

/** Combined: half-life + inactive (multiply factors) */
export function decayedRep(rep0: number, daysSinceActive: number, halfLife: number = REP_HALF_LIFE_DAYS): number {
  const a = decayByHalfLife(rep0, daysSinceActive, halfLife);
  const b = decayInactive(a, Math.max(0, daysSinceActive - 1)); // grace 1 day
  return b;
}

/** Profile half-life 9d */
export function decayedProfileRep(rep0: number, days: number): number {
  return decayByHalfLife(rep0, days, PROFILE_HALF_LIFE_DAYS);
}

/** Decay curve: 30 points for sparkline / chart, half-life 14d */
export function decayCurve(rep0: number, days: number = 30, halfLife: number = REP_HALF_LIFE_DAYS): number[] {
  const r = Number(rep0) || 0;
  if (r <= 0) return Array.from({ length: 30 }, () => 0);
  return Array.from({ length: days }, (_, i) => decayByHalfLife(r, i, halfLife));
}

/** Profile curve 14d with 9d half-life */
export function profileDecayCurve(rep0: number, days: number = 14): number[] {
  return decayCurve(rep0, days, PROFILE_HALF_LIFE_DAYS);
}

/** Days until rep halves at given half-life */
export function daysTilHalf(halfLife: number = REP_HALF_LIFE_DAYS): number { return halfLife; }

/** Human label: e.g. "14d half-life · 2%/day inactive" */
export function decayLabel(): string {
  return `${REP_HALF_LIFE_DAYS}d half-life · ${Math.round(REP_DAILY_INACTIVE_RATE*100)}%/day inactive`;
}

/** Inactive days from last active ISO */
export function inactiveDays(lastActiveIso: string | null | undefined): number {
  if (!lastActiveIso) return 0;
  const t = Date.parse(lastActiveIso);
  if (isNaN(t)) return 0;
  const diff = Date.now() - t;
  return Math.max(0, Math.floor(diff / (24*3600*1000)));
}

// ── Isotope Half-Life Engine verifiable deterministic ──
// N(t)=N0*0.5^(t/half) client deterministic; verifiable via snapshot ts
export function isotopeDecay(N0:number, tDays:number, half:number=REP_HALF_LIFE_DAYS):number{ return decayByHalfLife(N0,tDays,half); }
export function isotopeSnapshot(rep:number, atIso:string, half:number=REP_HALF_LIFE_DAYS):{ rep:number; decayed:number; days:number; half:number; verifiable:true }{
  const d=inactiveDays(atIso); return { rep, decayed:decayByHalfLife(rep,d,half), days:d, half, verifiable:true as const };
}
export function verifyDecay(snapshot:{rep:number; decayed:number; days:number; half:number}):boolean{
  const exp=decayByHalfLife(snapshot.rep, snapshot.days, snapshot.half); return Math.abs(exp-snapshot.decayed)<0.02;
}
