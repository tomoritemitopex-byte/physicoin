import type { Metadata } from 'next';
import { Inter, Instrument_Serif, Fredoka } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-inter',
});

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: ['400'],
  display: 'swap',
  variable: '--font-instrument-serif',
});

// Inverted-audit P1 (K-D3): --font-fredoka was referenced (EarthPulse,
// VoiceGossipFab) but never loaded — fell back to system-ui silently.
const fredoka = Fredoka({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-fredoka',
});

export const metadata: Metadata = {
  title: 'PhysiCoin — Live Timetable, Built by Students',
  description: 'Student-powered real-time timetable. Share what you hear, confirm what you see. Advisory, not official.',
  keywords: 'timetable, student, events, live, verify, campus',
  openGraph: {
    title: 'PhysiCoin — Live Timetable',
    description: 'Student-powered real-time timetable. Share what you hear, confirm what you see.',
    images: [{ url: '/icon-512.png', width: 512, height: 512, alt: 'PhysiCoin' }],
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // Inverted-audit P2 (K-D5): browser chrome matches runtime navy
  // (was Dawn coral residue #ff6b6b — see manifest.json).
  themeColor: '#07111f',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${instrumentSerif.variable} ${fredoka.variable}`}
      suppressHydrationWarning
    >
      <head>
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="icon" href="/icon-192.png" sizes="192x192" type="image/png" />
        <link rel="apple-touch-icon" href="/icon-512.png" sizes="512x512" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#07111f" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="PhysiCoin" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body
        className="min-h-screen bg-sky-3 text-ink font-inter antialiased"
        style={{
          backgroundColor: 'var(--physi-paper)',
          color: 'var(--physi-ink)',
          fontFamily: 'var(--font-inter), system-ui, sans-serif',
        }}
      >
        <noscript>
          <div
            style={{
              background: '#fee2e2',
              color: '#991b1b',
              padding: '12px',
              textAlign: 'center',
              fontFamily: 'monospace',
            }}
          >
            PhysiCoin needs JavaScript to verify events. The timetable HTML still loads — enable JS for full
            interactivity.
          </div>
        </noscript>
        {children}
      </body>
    </html>
  );
}
