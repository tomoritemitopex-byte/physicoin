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

// ── Heat Hall: pending slip heat per building ──
export type HallHeat = {
  heat: Record<string, number>;
  counts: Record<string, number>;
  maxCount: number;
  hottest: string | null;
  totalPending: number;
};

export function emptyHallHeat(): HallHeat {
  const heat: Record<string, number> = {};
  for (const b of BUILDINGS) heat[b.id] = 0;
  return { heat, counts: { ...heat }, maxCount: 0, hottest: null, totalPending: 0 };
}

export function heatFromEvents(events: Array<{ venue?: string; title?: string; status?: string }>): HallHeat {
  const heat: Record<string, number> = {};
  for (const b of BUILDINGS) heat[b.id] = 0;
  let totalPending = 0;
  for (const ev of events) {
    if (ev.status && ev.status !== "pending") continue;
    totalPending++;
    const hay = `${ev.venue || ""} ${ev.title || ""}`.toLowerCase();
    for (const b of BUILDINGS) {
      if (hay.includes(b.code.toLowerCase())) {
        heat[b.id]++;
        break;
      }
    }
  }
  let maxCount = 0;
  let hottest: string | null = null;
  for (const b of BUILDINGS) {
    if (heat[b.id] > maxCount) {
      maxCount = heat[b.id];
      hottest = b.id;
    }
  }
  if (maxCount === 0) hottest = null;
  return { heat, counts: { ...heat }, maxCount, hottest, totalPending };
}

export async function getHallHeat(): Promise<HallHeat> {
  try {
    const { getSql, isDbConfigured } = await import("@/lib/db");
    if (!isDbConfigured()) return emptyHallHeat();
    const sql: any = getSql();
    if (!sql) return emptyHallHeat();
    const rows: Array<{ venue: string; title: string }> = await sql`SELECT venue, title FROM physi_events WHERE status='pending' LIMIT 500`;
    return heatFromEvents(rows as any);
  } catch {
    return emptyHallHeat();
  }
}