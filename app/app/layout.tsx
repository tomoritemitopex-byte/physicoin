import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'PHYSI — Inside',
};

// INSIDE shell — tabs + auth gate. Full implementation in Phase 3.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#070a12]">
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#070a12]/80 backdrop-blur-[12px]">
        <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-4 px-6 py-3 lg:px-8">
          <a href="/" className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-white text-[10px] font-black tracking-[-0.04em] text-slate-900">
            PHYSI
          </a>
          <nav className="flex items-center gap-1 rounded-full border border-white/[0.06] bg-white/[0.03] p-1 text-[13px]">
            <a href="/app/timetable" className="rounded-full bg-white px-3 py-1 font-medium text-slate-900">Timetable</a>
            <a href="/app/verify" className="px-3 py-1 text-slate-400 hover:text-white">Verify</a>
            <a href="/app/mining" className="px-3 py-1 text-slate-400 hover:text-white">Check-in</a>
            <a href="/app/roadmap" className="px-3 py-1 text-slate-400 hover:text-white">Roadmap</a>
          </nav>
          <a href="/app/profile" className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[13px] font-medium text-slate-200">
            Profile
          </a>
        </div>
      </header>
      <div className="mx-auto max-w-[1240px] px-6 py-6 lg:px-8">{children}</div>
    </div>
  );
}
