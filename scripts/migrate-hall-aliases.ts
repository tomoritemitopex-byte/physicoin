/**
 * scripts/migrate-hall-aliases.ts — Migration script: scans physi_events
 * Groups by (scope_value=programme_level, event_date day_of_week, event_time, title=subject)
 * Finds groups with >1 distinct venue → creates pending alias proposals.
 * No algorithm picking — students vote. Pick canonical as most frequent venue, alias as others.
 * Run: npx tsx scripts/migrate-hall-aliases.ts  (or via ts-node)
 */
import { neon } from "@neondatabase/serverless";

function dayOfWeek(dateStr:string):string{
  try{ const d=new Date(dateStr+"T00:00:00Z"); return String(d.getUTCDay()); } catch{ return "x"; }
}
function groupKey(ev:any):string{
  const progLevel=String(ev.scope_value||"").trim().toLowerCase();
  const day=dayOfWeek(String(ev.event_date).slice(0,10));
  const time=String(ev.event_time).slice(0,5);
  const subj=String(ev.title||"").trim().toLowerCase();
  return `${progLevel}::${day}::${time}::${subj}`;
}

async function main(){
  const url=process.env.DATABASE_URL || process.env.DATABASE_URLS?.split(",")[0];
  if(!url){ console.error("DATABASE_URL missing"); process.exit(1); }
  const sql=neon(url);

  // ensure tables
  await sql`
    CREATE TABLE IF NOT EXISTS physi_hall_aliases (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      alias TEXT NOT NULL,
      canonical TEXT NOT NULL,
      programme TEXT,
      level TEXT,
      subject TEXT,
      hall_group_key TEXT,
      vote_count INT NOT NULL DEFAULT 0,
      votes_yes INT NOT NULL DEFAULT 0,
      votes_no INT NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','resolved','rejected')),
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  await sql`CREATE TABLE IF NOT EXISTS physi_hall_alias_votes (
      alias_id UUID NOT NULL REFERENCES physi_hall_aliases(id) ON DELETE CASCADE,
      voter_id UUID NOT NULL REFERENCES physi_users(id) ON DELETE CASCADE,
      vote_value SMALLINT NOT NULL CHECK (vote_value IN (-1, 1)),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (alias_id, voter_id)
    )`;

  const events=await sql`SELECT id, title, venue, event_date, event_time, scope_value FROM physi_events` as any[];
  console.log(`Scanning ${events.length} events...`);

  // group
  const groups=new Map<string, any[]>();
  for(const ev of events){
    const k=groupKey(ev);
    if(!groups.has(k)) groups.set(k,[]);
    groups.get(k)!.push(ev);
  }

  let proposals=0, skipped=0;
  for(const entry of Array.from(groups.entries())){
    const key=entry[0]; const list=entry[1] as any[];
    const venues=Array.from(new Set(list.map((e:any)=>String(e.venue).trim()).filter(Boolean))) as string[];
    if(venues.length<=1){ skipped++; continue; }
    // count frequency of each venue
    const freq=new Map<string,number>();
    for(const e of list) freq.set(String(e.venue).trim(), (freq.get(String(e.venue).trim())||0)+1);
    const sorted=Array.from(freq.entries()).sort((a,b)=>b[1]-a[1]);
    const canonical=sorted[0][0];
    const programmeLevel=list[0].scope_value || null;
    // derive programme/level naive split by last char? Keep as programme
    const subject=list[0].title;
    const day=dayOfWeek(String(list[0].event_date).slice(0,10));
    const time=String(list[0].event_time).slice(0,5);

    for(let i=1;i<sorted.length;i++){
      const alias=sorted[i][0];
      try{
        await sql`INSERT INTO physi_hall_aliases (alias, canonical, programme, level, subject, hall_group_key)
          VALUES (${alias}, ${canonical}, ${programmeLevel}, ${programmeLevel}, ${subject}, ${key})
          ON CONFLICT (lower(alias), lower(canonical), COALESCE(hall_group_key,'')) DO NOTHING`;
        proposals++;
        console.log(` proposal: alias='${alias}' → canonical='${canonical}' group=${key} (${freq.get(alias)} vs ${freq.get(canonical)} occurrences)`);
      }catch(e:any){
        // fallback without unique constraint
        try{
          const exists=await sql`SELECT 1 FROM physi_hall_aliases WHERE lower(alias)=lower(${alias}) AND lower(canonical)=lower(${canonical}) AND hall_group_key=${key} LIMIT 1`;
          if(exists.length===0){
            await sql`INSERT INTO physi_hall_aliases (alias, canonical, programme, level, subject, hall_group_key) VALUES (${alias}, ${canonical}, ${programmeLevel}, ${programmeLevel}, ${subject}, ${key})`;
            proposals++;
            console.log(` proposal (fallback): alias='${alias}' → canonical='${canonical}'`);
          }
        }catch{}
      }
    }
  }
  console.log(`Done. Groups: ${groups.size}, proposals created: ${proposals}, skipped homogeneous: ${skipped}`);
}

main().catch(e=>{ console.error(e); process.exit(1); });
