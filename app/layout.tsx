import type { Metadata } from 'next';
import { Fredoka, Instrument_Serif } from 'next/font/google';
import './globals.css';

const fredoka = Fredoka({ subsets: ['latin'], weight: ['400','500','600','700'], display: 'swap', variable: '--font-fredoka' });
const instrumentSerif = Instrument_Serif({ subsets: ['latin'], weight: ['400'], display: 'swap', variable: '--font-display', style: ['normal'] });

export const metadata: Metadata = {
  title: 'PHYSI — Live Timetable, Built by Students',
  description: 'Student-powered real-time timetable. Share what you hear, confirm what you see. Advisory, not official.',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, title: 'PHYSI', statusBarStyle: 'black-translucent' },
  openGraph: { title: 'PHYSI — Live Timetable', description: 'Share what you hear, confirm what you see.', type: 'website', locale: 'en_NG' },
  twitter: { card: 'summary_large_image', title: 'PHYSI — Live Timetable', description: 'Share what you hear, confirm what you see.' },
  keywords: ['PHYSI', 'timetable', 'university', 'Nigeria'],
  metadataBase: new URL('https://physicoin.vercel.app'),
};
export const viewport = { themeColor: '#0d3b2a' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fredoka.variable} ${instrumentSerif.variable}`}>
      <head />
      <body className="min-h-screen bg-[#0d3b2a] text-[#f0fdf4] antialiased selection:bg-[#34d399] selection:text-[#022c1e]" style={{ fontFamily: 'var(--font-fredoka), system-ui, sans-serif' }}>
        {children}
      </body>
    </html>
  );
}
