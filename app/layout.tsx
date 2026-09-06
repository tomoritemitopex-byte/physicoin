import type { Metadata } from 'next';
import { Inter, Instrument_Serif } from 'next/font/google';
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

export const metadata: Metadata = {
  title: 'PHYSI — Live Timetable, Built by Students',
  description: 'Student-powered real-time timetable. Share what you hear, confirm what you see. Advisory, not official.',
  keywords: 'timetable, student, events, live, verify, campus, medical',
  openGraph: {
    title: 'PHYSI — Live Timetable',
    description: 'Student-powered real-time timetable. Share what you hear, confirm what you see.',
    images: [{ url: '/icon-512.png', width: 512, height: 512, alt: 'PHYSI' }],
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0369a1',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${instrumentSerif.variable}`}
      suppressHydrationWarning
    >
      <head>
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="icon" href="/icon-192.png" sizes="192x192" type="image/png" />
        <link rel="apple-touch-icon" href="/icon-512.png" sizes="512x512" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0369a1" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="PHYSI" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body
        className="min-h-screen bg-sky-3 text-ink font-inter antialiased"
        style={{ fontFamily: 'var(--font-inter), system-ui, sans-serif' }}
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
            PHYSI needs JavaScript to verify events. The timetable HTML still loads — enable JS for full
            interactivity.
          </div>
        </noscript>
        {children}
      </body>
    </html>
  );
}