import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PHYSI Enterprise — Campus Truth Infrastructure",
  description: "Production-style PHYSI dashboard for FUHSI pilot: mining, roadmap, timetable sync, and authority-weighted verification.",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#020610] text-slate-50 antialiased selection:bg-amber-400/30">
        {children}
      </body>
    </html>
  );
}
