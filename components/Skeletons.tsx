"use client";
export function RoadSkeleton() {
  return (
    <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
          <div className="h-4 w-3/4 rounded-full bg-white/10" />
          <div className="mt-3 h-3 w-1/2 rounded-full bg-white/5" />
          <div className="mt-4 h-1.5 w-full rounded-full bg-white/5" />
          <div className="mt-3 flex gap-2">
            <div className="h-7 w-16 rounded-full bg-white/10" />
            <div className="h-7 w-16 rounded-full bg-white/5" />
          </div>
        </div>
      ))}
    </div>
  );
}
export function MapSkeleton() {
  return (
    <div className="mt-6 animate-pulse overflow-hidden rounded-[20px] border border-white/[0.07] bg-white/[0.03] p-6">
      <div className="h-4 w-32 rounded-full bg-white/10" />
      <div className="mt-6 h-[140px] w-full rounded-2xl bg-white/[0.04]" />
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="h-20 rounded-2xl bg-white/[0.04]" />
        <div className="h-20 rounded-2xl bg-white/[0.04]" />
      </div>
    </div>
  );
}
export function CardSkeleton() {
  return <div className="h-16 animate-pulse rounded-xl bg-white/[0.04]" />;
}
export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-[14px] border border-white/10 bg-white/[0.03]" />
      ))}
    </div>
  );
}
export function EmptyState({ title, desc, action, onAction }: { title: string; desc: string; action?: string; onAction?: () => void }) {
  return (
    <div className="rounded-[20px] border border-dashed border-white/10 bg-white/[0.02] px-6 py-10 text-center">
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="mx-auto mt-1 max-w-[320px] text-sm leading-5 text-slate-500">{desc}</p>
      {action && onAction && (
        <button onClick={onAction} className="mt-4 rounded-full bg-white px-5 py-2 text-sm font-semibold text-[#022c1e]">
          {action}
        </button>
      )}
    </div>
  );
}
