import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PHYSI — Research Preview · FUHSI Lab Pilot",
  description: "PHYSI Research Preview — lab pilot for FUHSI: verification + advisory timetable + daily check-in (TEST-PHYSI, no value). Testing with small cohort.",
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
