"use client";
import { GhostForm } from "@/lib/ghostAvatar";

/**
 * GhostAvatar — ephemeral UI-only ghost, morphs via CSS, never persisted.
 * key change => CSS drift animation (no DB write).
 */
export default function GhostAvatar({ form, size = 36, label, animate = true }: { form: GhostForm; size?: number; label?: string; animate?: boolean }) {
  const r = size / 2;
  const shapePath: Record<string, string> = {
    round: `M ${r-12} ${r+8} Q ${r-12} ${r-10} ${r} ${r-12} Q ${r+12} ${r-10} ${r+12} ${r+8} Q ${r+8} ${r+11} ${r+4} ${r+8} Q ${r} ${r+12} ${r-4} ${r+8} Q ${r-8} ${r+11} ${r-12} ${r+8} Z`,
    wavy: `M ${r-13} ${r+7} Q ${r-13} ${r-12} ${r} ${r-13} Q ${r+13} ${r-12} ${r+13} ${r+7} Q ${r+10} ${r+11} ${r+6} ${r+7} Q ${r+2} ${r+11} ${r-2} ${r+7} Q ${r-6} ${r+11} ${r-10} ${r+7} Q ${r-13} ${r+11} ${r-13} ${r+7} Z`,
    pointy: `M ${r-12} ${r+8} L ${r-12} ${r-6} Q ${r-12} ${r-12} ${r} ${r-14} Q ${r+12} ${r-12} ${r+12} ${r-6} L ${r+12} ${r+8} L ${r+8} ${r+4} L ${r+4} ${r+9} L ${r} ${r+4} L ${r-4} ${r+9} L ${r-8} ${r+4} Z`,
    blob: `M ${r-11} ${r+6} Q ${r-14} ${r-2} ${r-8} ${r-10} Q ${r-2} ${r-15} ${r+6} ${r-11} Q ${r+13} ${r-6} ${r+11} ${r+6} Q ${r+9} ${r+11} ${r+4} ${r+9} Q ${r} ${r+13} ${r-5} ${r+9} Q ${r-11} ${r+11} ${r-11} ${r+6} Z`,
  };
  const d = shapePath[form.shape] || shapePath.round;

  return (
    <div
      className={animate ? "ghost-drift" : ""}
      style={
        {
          width: size,
          height: size,
          ["--ghost-wobble" as any]: `${form.wobbleMs}ms`,
          ["--ghost-drift" as any]: `${form.drift}px`,
          transform: `scale(${form.scale})`,
        } as any
      }
      aria-label={label || "anonymous ghost"}
      title={label || "someone verified"}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
        {/* soft glow */}
        <circle cx={r} cy={r} r={r - 2} fill={form.bg} opacity={0.95} />
        <path d={d} fill={form.fg} opacity={0.98} style={{ filter: `hue-rotate(${form.hue % 30 - 15}deg)` }} />
        {/* eyes */}
        {form.eye === "oo" && (
          <>
            <circle cx={r - 5} cy={r - 1} r={3.2} fill="white" opacity={0.98} />
            <circle cx={r + 5} cy={r - 1} r={3.2} fill="white" opacity={0.98} />
            <circle cx={r - 5} cy={r - 0.2} r={1.4} fill="black" opacity={0.9} />
            <circle cx={r + 5} cy={r - 0.2} r={1.4} fill="black" opacity={0.9} />
          </>
        )}
        {form.eye === "^-^" && (
          <>
            <path d={`M ${r - 8} ${r} Q ${r - 5} ${r - 3} ${r - 2} ${r}`} stroke="white" strokeWidth={1.6} fill="none" strokeLinecap="round" />
            <path d={`M ${r + 2} ${r} Q ${r + 5} ${r - 3} ${r + 8} ${r}`} stroke="white" strokeWidth={1.6} fill="none" strokeLinecap="round" />
          </>
        )}
        {form.eye === "◉◉" && (
          <>
            <circle cx={r - 5.5} cy={r - 0.5} r={4} fill="white" />
            <circle cx={r + 5.5} cy={r - 0.5} r={4} fill="white" />
            <circle cx={r - 5.5} cy={r - 0.5} r={1.8} fill="#0f172a" />
            <circle cx={r + 5.5} cy={r - 0.5} r={1.8} fill="#0f172a" />
            <circle cx={r - 4.5} cy={r - 1.2} r={0.7} fill="white" />
            <circle cx={r + 6.5} cy={r - 1.2} r={0.7} fill="white" />
          </>
        )}
        {form.eye === "··" && (
          <>
            <circle cx={r - 5} cy={r} r={1.6} fill="white" />
            <circle cx={r + 5} cy={r} r={1.6} fill="white" />
          </>
        )}
        {form.eye === "◐◑" && (
          <>
            <circle cx={r - 5} cy={r - 0.5} r={3} fill="white" />
            <circle cx={r + 5} cy={r - 0.5} r={3} fill="white" />
            <path d={`M ${r - 5} ${r - 3.5} A 3 3 0 0 1 ${r - 5} ${r + 2.5}`} fill="#0f172a" />
            <path d={`M ${r + 5} ${r - 3.5} A 3 3 0 0 0 ${r + 5} ${r + 2.5}`} fill="#0f172a" />
          </>
        )}
        {/* highlight */}
        <ellipse cx={r - 6} cy={r - 7} rx={3} ry={2} fill="white" opacity={0.22} />
      </svg>
    </div>
  );
}

export function GhostRow({ forms, size = 32, max = 6 }: { forms: GhostForm[]; size?: number; max?: number }) {
  const shown = forms.slice(0, max);
  const extra = forms.length - shown.length;
  return (
    <div className="flex items-center">
      <div className="flex -space-x-2">
        {shown.map((f) => (
          <div key={f.id} className="rounded-full ring-2 ring-[#022c1e] shadow-[0_2px_10px_rgba(0,0,0,0.35)] bg-[#0b1020] ghost-enter" style={{ animationDelay: `${Math.random() * 200}ms` }}>
            <GhostAvatar form={f} size={size} />
          </div>
        ))}
      </div>
      {extra > 0 && <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 font-mono text-[10px] font-bold text-white">+{extra}</span>}
      {forms.length > 0 && <span className="ml-2 font-mono text-[10px] text-slate-400">someone verified · {forms.length}</span>}
    </div>
  );
}
