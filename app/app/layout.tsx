import Link from 'next/link';
import BottomNavClient from '@/components/nav/BottomNavClient';
import HeaderClient from '@/components/nav/HeaderClient';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-sky-3 text-ink selection:bg-sky selection:text-white">
      {/* Campus sky depth */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-sky-3" />
        <div className="absolute -top-32 left-1/2 h-[400px] w-[800px] -translate-x-1/2 rounded-full opacity-[0.35] blur-[60px]"
          style={{ background: "radial-gradient(ellipse at center, #7dd3fc, transparent 70%)" }} />
        <div className="absolute bottom-0 left-0 w-full h-32 bg-gradient-to-t from-green-50/80 to-transparent" />
      </div>

      {/* Header (client for scroll state + wallet) */}
      <HeaderClient />

      {/* Advisory strip */}
      <div className="border-t border-sky/20 bg-sky/10">
        <div className="mx-auto max-w-[1280px] px-4 py-1.5 text-center font-mono text-[11px] leading-none text-ink/70">
          <Link href="/terms" className="hover:text-ink transition">advisory feed — campus live · Terms →</Link>
        </div>
      </div>

      {children}

      {/* Bottom nav (client for active state + wallet dot) */}
      <BottomNavClient />

      <footer className="mx-auto max-w-[1280px] border-t border-sky/20 px-4 py-6 text-center font-mono text-xs text-ink/60 sm:px-6 lg:px-8">
        PHYSI · built by students · <Link href="/terms" className="underline decoration-sky/30 hover:text-ink/70">Terms →</Link>
      </footer>
    </div>
  );
}