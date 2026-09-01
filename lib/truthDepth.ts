/**
 * lib/truthDepth.ts — Truth Depth (consensus progress visualization)
 * Maps (votes_yes, votes_no, total_weight) → { depth: 0-1, phase, color }
 * Depth = progress to quorum incorporating weighted total + consensus ratio.
 */

export type DepthPhase = "fresh" | "building" | "closing" | "locked";

export type DepthResult = {
  depth: number; // 0..1
  phase: DepthPhase;
  color: string; // hex or tailwind class
  bg: string;
  label: string;
};

const QUORUM_MIN = 8;

export function calculateDepth(votes_yes: number, votes_no: number, total_weight: number): DepthResult {
  const yes = Math.max(0, Number(votes_yes) || 0);
  const no = Math.max(0, Number(votes_no) || 0);
  const rawTotal = yes + no;
  // total_weight may be weighted sum (e.g. 9.5), fallback to rawTotal
  const w = Number.isFinite(total_weight) && total_weight > 0 ? Number(total_weight) : rawTotal;
  const t = Math.max(w, rawTotal);

  // Depth: quorum progress weighted 70% + consensus strength 30%
  const quorumProgress = Math.min(1, t / QUORUM_MIN);
  const consensusRatio = rawTotal > 0 ? Math.max(yes, no) / rawTotal : 0;
  // When near unanimous, boost depth slightly
  const consensusBoost = rawTotal >= 4 ? (consensusRatio - 0.5) * 0.15 : 0;

  let depth = Math.max(0, Math.min(1, quorumProgress * 0.85 + consensusBoost + (rawTotal > 0 ? 0.05 : 0)));
  // If raw quorum reached and strong consensus, snap to high depth
  if (rawTotal >= QUORUM_MIN && consensusRatio >= 0.7) depth = Math.max(depth, 0.88);
  if (rawTotal >= QUORUM_MIN && consensusRatio >= 0.85) depth = Math.max(depth, 0.96);

  depth = Number(depth.toFixed(3));

  let phase: DepthPhase;
  let color: string;
  let bg: string;
  let label: string;

  if (depth >= 0.95) {
    phase = "locked";
    color = "#059669"; // emerald-600 solid
    bg = "bg-emerald-600";
    label = "locked";
  } else if (depth >= 0.7) {
    phase = "closing";
    color = "#10b981"; // emerald-500
    bg = "bg-emerald-500";
    label = "closing in";
  } else if (depth >= 0.3) {
    phase = "building";
    color = "#34d399"; // emerald-400
    bg = "bg-emerald-400";
    label = "building";
  } else {
    phase = "fresh";
    color = "#a7f3d0"; // emerald-200 pale green
    bg = "bg-emerald-200";
    label = "fresh";
  }

  return { depth, phase, color, bg, label };
}

/**
 * Helper: votes needed to reach locked phase (depth >= 0.95).
 * Approx: quorum remaining incorporating weighted.
 */
export function votesToLock(votes_yes: number, votes_no: number, total_weight: number): number {
  const t = Number.isFinite(total_weight) && total_weight > 0 ? Number(total_weight) : votes_yes + votes_no;
  const need = Math.max(0, QUORUM_MIN - t);
  // If close but consensus weak, needs +1 for ratio
  const total = votes_yes + votes_no;
  if (total >= QUORUM_MIN) {
    const ratio = total > 0 ? Math.max(votes_yes, votes_no) / total : 0;
    if (ratio < 0.7) return 1;
  }
  return Math.ceil(need) || (t >= 7.5 ? 1 : 0);
}
