import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PHYSI — Live Timetable, Built by Students',
  description:
    'Student-powered real-time timetable. Share what you hear, confirm what you see. Advisory, not official. TEST-PHYSI pilot.',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, title: 'PHYSI', statusBarStyle: 'black-translucent' },
};
export const viewport = { themeColor: '#0d3b2a' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[var(--physi-bg)] text-slate-100 antialiased selection:bg-[#3b82f6]/20">
        {children}
      </body>
    </html>
  );
}
