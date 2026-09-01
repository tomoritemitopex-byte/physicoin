/**
 * lib/campus.ts — Campus map building + level model
 * Buildings represent faculties/programmes (tappable) → levels → events
 * Pure config, no DB.
 */

export type Building = {
  id: string;
  code: string;
  label: string;
  short: string;
  color: string;
  accent: string;
  icon: string;
  desc: string;
};

export const BUILDINGS: Building[] = [
  { id: "phys", code: "PHYS", label: "Physiology", short: "Phys", color: "#10b981", accent: "#065f46", icon: "🧬", desc: "Home of Physio" },
  { id: "mbbs", code: "MBBS", label: "Medicine & Surgery", short: "MBBS", color: "#0ea5e9", accent: "#0c4a6e", icon: "🩺", desc: "College of Medicine" },
  { id: "dpt", code: "DPT", label: "Physiotherapy", short: "DPT", color: "#8b5cf6", accent: "#4c1d95", icon: "🦴", desc: "Rehab Sciences" },
  { id: "bnsc", code: "BNSc", label: "Nursing Science", short: "Nursing", color: "#ec4899", accent: "#831843", icon: "🩹", desc: "Nursing" },
  { id: "bmls", code: "BMLS", label: "Medical Lab Science", short: "BMLS", color: "#f59e0b", accent: "#78350f", icon: "🔬", desc: "Lab Science" },
  { id: "pharm", code: "PHARM", label: "Pharmacy", short: "Pharm", color: "#06b6d4", accent: "#164e63", icon: "💊", desc: "Pharmaceutical Sci" },
  { id: "nutr", code: "NUTR", label: "Nutrition & Dietetics", short: "Nutrition", color: "#84cc16", accent: "#365314", icon: "🥗", desc: "Nutrition" },
  { id: "it", code: "IT", label: "Information Tech", short: "IT", color: "#f43f5e", accent: "#881337", icon: "💻", desc: "Health Informatics" },
];

export const LEVELS = ["100L", "200L", "300L", "400L", "500L", "600L"] as const;
export type Level = typeof LEVELS[number];

export function buildingForProgramme(programme: string): Building | undefined {
  const p = String(programme||"").toLowerCase();
  if (p.includes("physiol")) return BUILDINGS.find(b=>b.id==="phys");
  if (p.includes("medicine") || p.includes("surgery") || p.includes("mbbs")) return BUILDINGS.find(b=>b.id==="mbbs");
  if (p.includes("physio") || p.includes("dpt")) return BUILDINGS.find(b=>b.id==="dpt");
  if (p.includes("nurs")) return BUILDINGS.find(b=>b.id==="bnsc");
  if (p.includes("lab") || p.includes("bmls")) return BUILDINGS.find(b=>b.id==="bmls");
  if (p.includes("pharm")) return BUILDINGS.find(b=>b.id==="pharm");
  if (p.includes("nutr") || p.includes("diet")) return BUILDINGS.find(b=>b.id==="nutr");
  if (p.includes("inform") || p.includes("tech")) return BUILDINGS.find(b=>b.id==="it");
  return BUILDINGS[0];
}
