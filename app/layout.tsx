import type { Metadata } from 'next';
import { Fredoka } from 'next/font/google';
import './globals.css';

const fredoka = Fredoka({ subsets: ['latin'], weight: ['400','500','600','700'], display: 'swap', variable: '--font-fredoka' });

export const metadata: Metadata = {
  title: 'PHYSI — Live Timetable, Built by Students',
  description: 'Student-powered real-time timetable. Share what you hear, confirm what you see. Advisory, not official. TEST-PHYSI pilot.',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, title: 'PHYSI', statusBarStyle: 'black-translucent' },
  openGraph: {
    title: 'PHYSI — Live Timetable, Built by Students',
    description: 'Forest road #0d3b2a · purple #8b5cf6 · Fredoka · endless time road built by students.',
    type: 'website',
    locale: 'en_NG',
  },
  twitter: { card: 'summary_large_image', title: 'PHYSI — Live Timetable', description: 'Share what you hear, confirm what you see.' },
  keywords: ['PHYSI', 'timetable', 'university', 'Nigeria', 'WAT', 'advisory'],
  metadataBase: new URL('https://physicoin.vercel.app'),
};
export const viewport = { themeColor: '#0d3b2a' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fredoka.variable}>
      <body className="min-h-screen bg-[var(--physi-bg)] text-slate-100 antialiased selection:bg-[#3b82f6]/20" style={{ fontFamily: 'var(--font-fredoka), system-ui, sans-serif' }}>
        {children}
      </body>
    </html>
  );
}
