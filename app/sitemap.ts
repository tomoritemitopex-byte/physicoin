import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://physicoin.vercel.app";
  const now = new Date();
  const tabs: string[] = ["", "?tab=mining", "?tab=roadmap", "?tab=timetable", "?tab=verify"];
  return tabs.map((tab) => ({
    url: `${base}/${tab}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: tab === "" ? 1 : 0.7,
  }));
}
