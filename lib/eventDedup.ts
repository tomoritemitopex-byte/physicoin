/**
 * lib/eventDedup.ts — Event cross-reference duplicate detection + auto-suggest
 * Satoshi cross: same (title, venue) within 7d = duplicate.
 * Auto-suggest title from scope_value pattern.
 */

export function suggestTitleFromScope(scopeValue: string | null | undefined): string | null {
  if (!scopeValue) return null;
  const v = String(scopeValue).trim().toLowerCase();
  // MBBS 200 → Anatomy, etc. Also handle "200L", "300 Level", "ana 201"
  const map: Array<{ re: RegExp; title: string }> = [
    { re: /\b100\s*l?\b/, title: "Intro to Physiology" },
    { re: /\b200\s*l?\b/, title: "Anatomy" },
    { re: /\b300\s*l?\b/, title: "Physiology" },
    { re: /\b400\s*l?\b/, title: "Pathology" },
    { re: /\b500\s*l?\b/, title: "Clinical Posting" },
    { re: /\b600\s*l?\b/, title: "Final Revision" },
    { re: /\bbio\s*101\b/, title: "BIO 101" },
    { re: /\bana\s*201\b/, title: "ANA 201" },
    { re: /\bchm\s*101\b/, title: "CHM 101" },
    { re: /\bphy\s*201\b/, title: "PHY 201" },
  ];
  for (const m of map) if (m.re.test(v)) return m.title;
  // generic: if scope looks like "ANA 201" style, use it as title
  const upper = String(scopeValue).trim().toUpperCase();
  if (/^[A-Z]{2,4}\s*\d{3}$/.test(upper)) return upper.replace(/\s+/, " ");
  return null;
}

export function canonicalVenue(venue: string): string {
  return String(venue || "").trim().toLowerCase();
}
export function canonicalTitle(title: string): string {
  return String(title || "").trim().toLowerCase();
}

/**
 * SQL helper: find duplicate events where title+venue match and date within 7 days.
 * Returns array of matching events (id, title, venue, event_date)
 */
export async function findDuplicateEvents(sql: any, title: string, venue: string, eventDate: string): Promise<any[]> {
  if (!sql || !title || !venue || !eventDate) return [];
  try {
    const t = canonicalTitle(title);
    const v = canonicalVenue(venue);
    // within 7 days either side: event_date BETWEEN date-7 AND date+7
    const rows = await sql`
      SELECT id, title, venue, event_date::text as event_date, event_time::text as event_time, scope_value, status
      FROM physi_events
      WHERE lower(title)=lower(${title}) AND lower(venue)=lower(${venue})
        AND event_date BETWEEN (${eventDate}::date - INTERVAL '7 days') AND (${eventDate}::date + INTERVAL '7 days')
      ORDER BY event_date DESC LIMIT 5
    `;
    return rows as any[];
  } catch {
    return [];
  }
}

/**
 * Resolve canonical venue via hall deduper: if venue is an alias, return canonical
 */
export async function resolveCanonicalVenue(sql: any, venue: string): Promise<string | null> {
  if (!sql || !venue) return null;
  try {
    const rows = await sql`SELECT canonical FROM physi_hall_aliases WHERE lower(alias)=lower(${venue}) AND status='resolved' LIMIT 1`;
    if (rows?.length) return String(rows[0].canonical);
  } catch {}
  return null;
}
