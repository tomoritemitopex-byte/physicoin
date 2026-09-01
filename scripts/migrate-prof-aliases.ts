/**
 * scripts/migrate-prof-aliases.ts — Migration: scans physi_events for variant prof names
 * Groups by (scope_value=programme+level, prof_name normalized via last-word group_key)
 * For each group with >1 distinct prof_name variant → creates pending alias proposals.
 * Canonical = displayProfName of most frequent variant; alias = other variants.
 * Peer voting decides, algorithm only proposes.
 * Run: npx tsx scripts/migrate-prof-aliases.ts
 */
import { neon } from "@neondatabase/serverless";

const TITLE_GLOBAL = /^(?:prof\.?|professor|dr\.?|mr\.?|mrs\.?|ms\.?)\s+/gi;
function normalizeProfName(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = String(raw).trim().toLowerCase();
  let prev = "";
  while (prev !== s) { prev = s; s = s.replace(TITLE_GLOBAL, "").trim(); }
  s = s.replace(/[.,;:'"`()\[\]]/g, " ").replace(/\s+/g, " ").trim();
  const parts = s.split(" ").filter(Boolean);
  if (parts.length >= 2) { while (parts.length > 1 && parts[0].length === 1) parts.shift(); }
  const last = parts[parts.length - 1] || "";
  return last.replace(/[^a-z0-9-]/g, "").trim();
}
function displayProfName(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = String(raw).trim().replace(/\s+/g, " ");
  let prev = "";
  while (prev !== s) { prev = s; s = s.replace(/^(?:prof\.?|professor|dr\.?|mr\.?|mrs\.?|ms\.?)\s+/i, "").trim(); }
  s = s.replace(/^[A-Za-z]\.\s+/, "").trim().replace(/[.,;]+$/g, "").trim();
  if (!s) return "";
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}
function profGroupKey(raw: string | null | undefined): string { return normalizeProfName(raw); }

async function main() {
  const url = process.env.DATABASE_URL || process.env.DATABASE_URLS?.split(",")[0];
  if (!url) { console.error("DATABASE_URL missing"); process.exit(1); }
  const sql = neon(url);
  await sql`
    CREATE TABLE IF NOT EXISTS physi_prof_aliases (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      alias TEXT NOT NULL,
      canonical TEXT NOT NULL,
      prof_group_key TEXT NOT NULL DEFAULT '',
      programme TEXT,
      level TEXT,
      vote_count INT NOT NULL DEFAULT 0,
      votes_yes INT NOT NULL DEFAULT 0,
      votes_no INT NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','resolved','rejected')),
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS physi_prof_aliases_pair_uidx ON physi_prof_aliases (lower(alias), lower(canonical), COALESCE(prof_group_key,''))`;
  await sql`CREATE TABLE IF NOT EXISTS physi_prof_alias_votes (
      alias_id UUID NOT NULL REFERENCES physi_prof_aliases(id) ON DELETE CASCADE,
      voter_id UUID NOT NULL REFERENCES physi_users(id) ON DELETE CASCADE,
      vote_value SMALLINT NOT NULL CHECK (vote_value IN (-1, 1)),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (alias_id, voter_id)
    )`;
  const events = await sql`SELECT id, prof_name, scope_value FROM physi_events WHERE prof_name IS NOT NULL AND prof_name<>''` as any[];
  console.log(`Scanning ${events.length} events with prof_name...`);
  const groups = new Map<string, any[]>();
  for (const ev of events) {
    const gk = profGroupKey(ev.prof_name);
    if (!gk) continue;
    const scopeKey = String(ev.scope_value||"").trim().toLowerCase();
    const key = `${scopeKey}::${gk}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(ev);
  }
  let proposals = 0, skipped = 0;
  for (const [key, list] of Array.from(groups.entries())) {
    const variants = Array.from(new Set(list.map((e:any)=>String(e.prof_name).trim()).filter(Boolean))) as string[];
    if (variants.length <= 1) { skipped++; continue; }
    const freq = new Map<string, number>();
    for (const e of list) freq.set(String(e.prof_name).trim(), (freq.get(String(e.prof_name).trim())||0)+1);
    const sorted = Array.from(freq.entries()).sort((a,b)=>b[1]-a[1]);
    const canonicalRaw = sorted[0][0];
    const canonical = displayProfName(canonicalRaw);
    const gk = profGroupKey(canonicalRaw);
    const programme = list[0].scope_value || null;
    console.log(` group ${key}: variants=${JSON.stringify(variants)} canonical='${canonical}'`);
    for (let i=1;i<sorted.length;i++) {
      const alias = String(sorted[i][0]).trim();
      if (alias.toLowerCase() === canonical.toLowerCase()) continue;
      try {
        await sql`INSERT INTO physi_prof_aliases (alias, canonical, prof_group_key, programme, level)
          VALUES (${alias}, ${canonical}, ${gk}, ${programme}, ${programme})
          ON CONFLICT (lower(alias), lower(canonical), COALESCE(prof_group_key,'')) DO NOTHING`;
        proposals++;
        console.log(`  proposal: alias='${alias}' → canonical='${canonical}'`);
      } catch (e:any) {
        try {
          const exists = await sql`SELECT 1 FROM physi_prof_aliases WHERE lower(alias)=lower(${alias}) AND lower(canonical)=lower(${canonical}) LIMIT 1`;
          if (!exists.length) {
            await sql`INSERT INTO physi_prof_aliases (alias, canonical, prof_group_key) VALUES (${alias}, ${canonical}, ${gk})`;
            proposals++;
            console.log(`  proposal fallback: alias='${alias}' → canonical='${canonical}'`);
          }
        } catch {}
      }
    }
  }
  console.log(`Done. Groups: ${groups.size}, proposals: ${proposals}, homogeneous skipped: ${skipped}`);
}
main().catch(e=>{ console.error(e); process.exit(1); });
