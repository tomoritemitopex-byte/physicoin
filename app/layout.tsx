import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://physicoin.vercel.app";
const title = "PHYSI — Research Preview · FUHSI Lab Pilot";
const description =
  "PHYSI Research Preview — lab pilot for FUHSI: verification + advisory timetable + daily check-in (TEST-PHYSI, no value). Testing with small cohort.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: title,
    template: "%s · PHYSI",
  },
  description,
  icons: { icon: "/favicon.ico" },
  openGraph: {
    type: "website",
    url: siteUrl,
    title,
    description,
    siteName: "PHYSI",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "PHYSI — Event truth, verified by the cohort" }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/opengraph-image"],
  },
  alternates: {
    canonical: siteUrl,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${jetbrains.variable}`}>
      <body className="min-h-screen bg-[#070a12] text-slate-50 antialiased selection:bg-amber-400/30">
        {/* single restrained mesh — layout owns it (deduplicated) */}
        <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 bg-[#070a12]">
          <div className="page-mesh absolute inset-0" />
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
        </div>
        {children}
      </body>
    </html>
  );
}
