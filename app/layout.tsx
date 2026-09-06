import type { Metadata } from 'next';
import { Fredoka, Instrument_Serif } from 'next/font/google';
import './globals.css';

const fredoka = Fredoka({ subsets: ['latin'], weight: ['400','500','600','700'], display: 'swap', variable: '--font-fredoka' });
const instrumentSerif = Instrument_Serif({ subsets: ['latin'], weight: ['400'], display: 'swap', variable: '--font-instrument-serif' });

export const metadata: Metadata = {
  title: 'PHYSI — Live Timetable, Built by Students',
  description: 'Student-powered real-time timetable. Share what you hear, confirm what you see. Advisory, not official.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0d3b2a',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fredoka.variable} ${instrumentSerif.variable}`}>
      <body className="min-h-screen bg-[#0d3b2a] text-[#f0fdf4] selection:bg-[#34d399] selection:text-[#022c1e]" style={{ fontFamily: 'var(--font-fredoka), system-ui, sans-serif' }}>
        <noscript>
          <div style={{background:'#b91c1c',color:'#fff',padding:'12px',textAlign:'center',fontFamily:'monospace'}}>
            PHYSI needs JavaScript to verify events. The timetable HTML still loads — enable JS for full interactivity.
          </div>
        </noscript>
        {children}
      </body>
    </html>
  );
}
