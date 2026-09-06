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
  { id: "anat", code: "ANAT", label: "Anatomy", short: "Anat", color: "#d97706", accent: "#7c2d12", icon: "🦴", desc: "Department of Anatomy" },
  { id: "phys", code: "PHYSIOL", label: "Physiology", short: "Phys", color: "#2563eb", accent: "#1e3a8a", icon: "❤️", desc: "Department of Physiology" },
  { id: "biochem", code: "BIOCHEM", label: "Biochemistry", short: "Biochem", color: "#16a34a", accent: "#14532d", icon: "🧪", desc: "Department of Biochemistry" },
  { id: "mbbs", code: "MBBS", label: "Medicine & Surgery", short: "MBBS", color: "#b91c1c", accent: "#450a0a", icon: "🩺", desc: "College of Medicine — clock tower" },
  { id: "pharm", code: "PHARM", label: "Pharmacology", short: "Pharm", color: "#9333ea", accent: "#4c1d95", icon: "💊", desc: "Department of Pharmacology" },
  { id: "commed", code: "COMM MED", label: "Community Medicine", short: "ComMed", color: "#0891b2", accent: "#164e63", icon: "🏥", desc: "Department of Community Medicine" },
  { id: "nursing", code: "NURS", label: "Nursing Science", short: "Nursing", color: "#db2777", accent: "#831843", icon: "🩹", desc: "Nursing Science" },
  { id: "lab", code: "BMLS", label: "Medical Lab Science", short: "BMLS", color: "#ea580c", accent: "#7c2d12", icon: "🔬", desc: "Medical Laboratory Science" },
];

export const LEVELS = ["100L", "200L", "300L", "400L", "500L", "600L"] as const;
export type Level = typeof LEVELS[number];

export function buildingForProgramme(programme: string): Building | undefined {
  const p = String(programme||"").toLowerCase();
  if (p.includes("anat") || p.includes("anatomy")) return BUILDINGS.find(b=>b.id==="anat");
  if (p.includes("physiol")) return BUILDINGS.find(b=>b.id==="phys");
  if (p.includes("biochem")) return BUILDINGS.find(b=>b.id==="biochem");
  if (p.includes("medicine") || p.includes("surgery") || p.includes("mbbs")) return BUILDINGS.find(b=>b.id==="mbbs");
  if (p.includes("pharm")) return BUILDINGS.find(b=>b.id==="pharm");
  if (p.includes("community")) return BUILDINGS.find(b=>b.id==="commed");
  if (p.includes("nurs")) return BUILDINGS.find(b=>b.id==="nursing");
  if (p.includes("lab") || p.includes("bmls")) return BUILDINGS.find(b=>b.id==="lab");
  return BUILDINGS[0];
}