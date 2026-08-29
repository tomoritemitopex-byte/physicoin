/**
 * lib/adapters/features/roadmap.ts — Roadmap Feature (UI-only, no /api/* yet)
 * Still a plug-in via FeatureAdapter so nav/layout is adapter-driven, no hard codes.
 * Roadmap reuses /api/timetable + /api/stats via other adapters — infinite forest road is theme-driven.
 */
import { registerFeature } from "../features";

export const roadmapFeature = {
  id: "roadmap",
  label: "Roadmap",
  nav: { href: "/app/roadmap", label: "Roadmap", short: "Map" },
  apiRoute: "/api/timetable",
  description: "Infinite forest road — chronological WAT-sorted events + personal bubbles",
};

registerFeature(roadmapFeature);
