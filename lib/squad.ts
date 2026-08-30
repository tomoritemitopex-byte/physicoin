/**
 * lib/squad.ts — Squad sup-quorum
 * Invite 3 friends forms squad, squad Yes counts 1.5x on own gists
 * localStorage key: phys_squad
 */
export const SQUAD_KEY = "phys_squad";
export const SQUAD_SIZE = 3;
export const SQUAD_MULTIPLIER = 1.5;

export type Squad = {
  members: string[]; // 3 handles
  owner: string | null; // youHandle lowercased
  formedAt: number;
};

export function getSquad(): Squad | null {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(SQUAD_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw);
    if (j && Array.isArray(j.members)) return j as Squad;
    // legacy: plain array
    if (Array.isArray(j)) return { members: j.slice(0,3).map((s:any)=> String(s).toLowerCase()), owner: null, formedAt: Date.now() };
    return null;
  } catch { return null; }
}

export function isSquadFormed(squad: Squad | null = getSquad()): boolean {
  if (!squad) return false;
  const ms = (squad.members || []).map(s=> String(s).trim().toLowerCase()).filter(Boolean);
  return ms.length >= SQUAD_SIZE;
}

export function setSquad(members: string[], owner?: string | null): Squad {
  const cleaned = members.map(s=> String(s).trim().toLowerCase().replace(/[^a-z0-9_]/g,"")).filter(Boolean).slice(0,3);
  const squad: Squad = { members: cleaned, owner: owner ? String(owner).toLowerCase() : null, formedAt: Date.now() };
  try { localStorage.setItem(SQUAD_KEY, JSON.stringify(squad)); } catch {}
  return squad;
}

export function clearSquad(){ try{ localStorage.removeItem(SQUAD_KEY);}catch{} }

export function getSquadMembers(): string[] {
  const s = getSquad();
  return s ? s.members : [];
}

/**
 * Should this YES vote get 1.5x? Applies when squad is formed and:
 * - vote is YES
 * - event was created by squad owner OR by a squad member (own gist = squad's gist)
 * For robustness, if createdBy handle/id not resolvable, we treat "own gists" as any gist where createdBy matches owner or is in members list.
 * Client sends created_by id/handle context; server re-checks if squad flag true.
 */
export function shouldApplySquadBoost(opts: { vote: string; squad: Squad | null; myHandle: string | null; myId: string | null; createdBy: string | null; createdByHandle?: string | null }): boolean {
  if (String(opts.vote).toUpperCase() !== "YES") return false;
  const squad = opts.squad ?? getSquad();
  if (!isSquadFormed(squad)) return false;
  const myH = opts.myHandle ? String(opts.myHandle).toLowerCase() : null;
  const createdBy = opts.createdBy ? String(opts.createdBy).toLowerCase() : null;
  const createdByHandle = opts.createdByHandle ? String(opts.createdByHandle).toLowerCase() : null;
  const members = (squad!.members || []).map(s=> s.toLowerCase());
  const owner = squad!.owner ? String(squad!.owner).toLowerCase() : null;
  // if myHandle not in squad (owner not tracked), allow boost for any own gist where createdBy is in squad-or-owner
  // Check: is the event's creator part of the squad?
  const creatorInSquad = (createdBy && members.includes(createdBy)) || (createdByHandle && members.includes(createdByHandle)) || (owner && createdBy === owner) || (owner && createdByHandle === owner);
  const creatorIsMe = (myH && (createdBy===myH || createdByHandle===myH)) || (opts.myId && createdBy===String(opts.myId).toLowerCase());
  // "own gists" = creator is squad member / owner / me ; boost YES on squad's own gists
  if (creatorInSquad || creatorIsMe) return true;
  // also allow: voter is squad member (myHandle in members or owner) -> boost on any YES to own squad gists? already covered via creator check.
  // For leniency in demo, if squad formed and voter is squad member, boost YES on any gist created by squad owner (already) — else no boost.
  return false;
}

export function squadWeight(base: number, opts: Parameters<typeof shouldApplySquadBoost>[0]): number {
  if (shouldApplySquadBoost(opts)) return Number((base * SQUAD_MULTIPLIER).toFixed(2));
  return base;
}

// invite link helper: encode squad owner handle
export function squadInviteLink(handle: string): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/app/roadmap?invite=${encodeURIComponent(handle)}&squad=1`;
}
