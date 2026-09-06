import Link from 'next/link';
import BottomNavClient from '@/components/nav/BottomNavClient';
import HeaderClient from '@/components/nav/HeaderClient';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const ALL_TABS = [
    { href: '/app/roadmap', label: 'Road', short: 'R' },
    { href: '/app/timetable', label: 'Feed', short: '≡' },
    { href: '/app/profile', label: 'Profile', short: 'P' },
  ];

  return (
    <div className="min-h-screen bg-[#0d3b2a] text-[#f0fdf4] selection:bg-[#34d399] selection:text-[#022c1e]">
      {/* Ambient depth glow */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[#0d3b2a]" />
        <div className="absolute -top-32 left-1/2 h-[400px] w-[800px] -translate-x-1/2 rounded-full opacity-[0.28] blur-[60px]"
          style={{ background: "radial-gradient(ellipse at center, #1a5f48, transparent 70%)" }} />
      </div>

      {/* Header (client for scroll state + wallet) */}
      <HeaderClient />

      {/* Advisory strip */}
      <div className="border-t border-[rgba(251,191,36,0.15)] bg-[rgba(251,191,36,0.06)]">
        <div className="mx-auto max-w-[1280px] px-4 py-1.5 text-center font-mono text-[11px] leading-none text-[#fbbf24]/70">
          <Link href="/terms" className="hover:text-[#fbbf24] transition">advisory feed — gold tick = confirmed · Terms →</Link>
        </div>
      </div>

      {children}

      {/* Bottom nav (client for active state + wallet dot) */}
      <BottomNavClient />

      <footer className="mx-auto max-w-[1280px] border-t border-[rgba(52,211,153,0.08)] px-4 py-6 text-center font-mono text-xs text-[rgba(240,253,244,0.45)] sm:px-6 lg:px-8">
        PHYSI · built by students · <Link href="/terms" className="underline decoration-[rgba(52,211,153,0.20)] hover:text-[rgba(240,253,244,0.70)]">Terms →</Link>
      </footer>
    </div>
  );
}
