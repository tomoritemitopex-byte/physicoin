"use client";
export function dotStyleForWeight(w: number): string {
  const n = Number(w) || 1;
  if (n >= 1.5) return "bg-amber-400 border-amber-300 ring-amber-400/30"; // 50+ → gold
  if (n >= 1.25) return "bg-emerald-400 border-emerald-300 ring-emerald-400/30"; // 20-49 → verified
  if (n >= 1.0) return "bg-sky-400 border-sky-300 ring-sky-400/20"; // 5-19 → active
  return "bg-slate-400 border-slate-300 ring-slate-400/20"; // 0-4 → new
}
export function tierLabel(w: number): string {
  if (w >= 1.5) return "1.5× trust";
  if (w >= 1.25) return "1.25× verified";
  if (w >= 1.0) return "1.0×";
  return "0.5× new";
}
export function VoterTrustPile({
  weights,
  max = 8,
  size = 20,
}: {
  weights: number[];
  max?: number;
  size?: number;
}) {
  if (!weights.length) return null;
  const shown = weights.slice(0, max);
  const extra = weights.length - shown.length;
  return (
    <span className="inline-flex items-center">
      <span className="flex -space-x-1.5">
        {shown.map((w, i) => (
          <span
            key={i}
            title={tierLabel(w)}
            className={`inline-flex items-center justify-center rounded-full border-2 ring-2 ${dotStyleForWeight(w)}`}
            style={{ width: size, height: size }}
          />
        ))}
        {extra > 0 && (
          <span
            className="inline-flex items-center justify-center rounded-full border-2 border-white/20 bg-white/10 font-mono text-[9px] font-bold text-white"
            style={{ width: size, height: size }}
          >
            +{extra}
          </span>
        )}
      </span>
    </span>
  );
}
export function TrustAvgBadge({ count, avg }: { count: number; avg: number | null }) {
  if (!count) return null;
  const a = avg != null ? Number(avg).toFixed(1) : "—";
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/20 bg-amber-500/10 px-2 py-0.5 font-mono text-[11px] font-bold text-amber-200">
      🚨 {count} reports · {a}× avg trust
    </span>
  );
}
