/**
 * app/api/halls/alias/route.ts — Hall Deduper alias voting
 * Peer voting: students vote yes/no on canonical hall name.
 * Reuses scope merge quorum pattern: 8-vote quorum + 70% consensus.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSql, isDbConfigured, dbNotConfigured, ensureAllTables } from "@/lib/db";
import { logError, getErrorMessage } from "@/lib/adapters/error";
import { weightFromTotal, weightedQuorumStatus } from "@/lib/voteWeight";

export const dynamic = "force-dynamic";

const QUORUM_MIN = 8;
const QUORUM_RATIO = 0.70;

function quorumStatus(yes:number,no:number): "pending"|"resolved"|"rejected" {
  const total=yes+no;
  if(total < QUORUM_MIN) return "pending";
  if(yes/total >= QUORUM_RATIO) return "resolved";
  if(no/total >= QUORUM_RATIO) return "rejected";
  return "pending";
}

export async function POST(req: NextRequest) {
  try {
    const sql=getSql();
    if(!isDbConfigured()||!sql) return NextResponse.json(dbNotConfigured(),{status:503});
    try{ await ensureAllTables(); }catch{}
    const b=await req.json().catch(()=>null);
    const alias_name=String(b?.alias_name||b?.alias||"").trim();
    const canonical_name=String(b?.canonical_name||b?.canonical||"").trim();
    const voter_id=String(b?.voter_id||"").trim();
    const voteRaw=String(b?.vote||"").toLowerCase();
    if(!alias_name||!canonical_name||!voter_id||!["yes","no"].includes(voteRaw))
      return NextResponse.json({ok:false,code:"BAD_INPUT",message:getErrorMessage("BAD_INPUT")},{status:400});
    if(alias_name.toLowerCase()===canonical_name.toLowerCase())
      return NextResponse.json({ok:false,code:"BAD_INPUT",message:"alias and canonical must differ"},{status:400});
    const voteValue=voteRaw==="yes"?1:-1;

    // verify voter
    const voter=await sql`SELECT id FROM physi_users WHERE id=${voter_id} LIMIT 1`;
    if(!voter.length) return NextResponse.json({ok:false,code:"VOTER_NOT_FOUND",message:getErrorMessage("VOTER_NOT_FOUND")},{status:404});

    // find or create alias row (normalize pair: keep as submitted; treat alias/canonical ordered pair)
    // Prefer lower(alias) vs lower(canonical) exact pair; hall_group_key ignored for vote lookup (first match)
    let aliasRow:any=null;
    try{
      const rows=await sql`SELECT * FROM physi_hall_aliases WHERE lower(alias)=lower(${alias_name}) AND lower(canonical)=lower(${canonical_name}) LIMIT 1`;
      aliasRow=rows[0]||null;
      if(!aliasRow){
        const ins=await sql`INSERT INTO physi_hall_aliases (alias, canonical) VALUES (${alias_name}, ${canonical_name}) ON CONFLICT (lower(alias), lower(canonical), COALESCE(hall_group_key,'')) DO NOTHING RETURNING *`;
        if(ins.length) aliasRow=ins[0];
        else {
          const again=await sql`SELECT * FROM physi_hall_aliases WHERE lower(alias)=lower(${alias_name}) AND lower(canonical)=lower(${canonical_name}) LIMIT 1`;
          aliasRow=again[0]||null;
        }
      }
      // also try reverse pair if user flipped alias/canonical? We keep as-is; vote semantics: yes = canonical is correct
      if(!aliasRow) return NextResponse.json({ok:false,code:"INTERNAL",message:getErrorMessage("INTERNAL")},{status:500});
    }catch(e:any){
      // fallback without unique index (if migration not yet run)
      try{
        const rows2=await sql`SELECT * FROM physi_hall_aliases WHERE lower(alias)=lower(${alias_name}) AND lower(canonical)=lower(${canonical_name}) LIMIT 1`;
        if(rows2.length) aliasRow=rows2[0];
        else {
          const ins2=await sql`INSERT INTO physi_hall_aliases (alias, canonical) VALUES (${alias_name}, ${canonical_name}) RETURNING *`;
          aliasRow=ins2[0];
        }
      }catch(ee){ throw e; }
    }
    const aliasId=aliasRow.id;

    // upsert vote
    await sql`INSERT INTO physi_hall_alias_votes (alias_id, voter_id, vote_value) VALUES (${aliasId}, ${voter_id}, ${voteValue}) ON CONFLICT (alias_id, voter_id) DO UPDATE SET vote_value=${voteValue}`;

    // recompute counts (weighted)
    const agg=await sql`SELECT COUNT(*) FILTER (WHERE vote_value=1) AS yes, COUNT(*) FILTER (WHERE vote_value=-1) AS no FROM physi_hall_alias_votes WHERE alias_id=${aliasId}` as any[];
    const yes=Number((agg[0] as any)?.yes||0);
    const no=Number((agg[0] as any)?.no||0);
    const total=yes+no;
    // weighted quorum
    let weightedYes = yes, weightedNo = no;
    let weightedStatus: "pending"|"resolved"|"rejected" = quorumStatus(yes,no);
    try {
      const voters: any[] = await sql`SELECT voter_id::text as voter_id, vote_value FROM physi_hall_alias_votes WHERE alias_id=${aliasId}` as any[];
      const uniq = Array.from(new Set(voters.map((v:any)=>String(v.voter_id))));
      const wmap = new Map<string, number>();
      await Promise.all(uniq.map(async (uid) => {
        try {
          const [c1,c2,c3,c4] = await Promise.all([
            sql`SELECT COUNT(*)::int AS c FROM physi_verifications WHERE verifier_id=${uid}`.then((r:any)=>Number(r[0]?.c||0)).catch(()=>0),
            sql`SELECT COUNT(*)::int AS c FROM physi_scope_votes WHERE voter_id=${uid}`.then((r:any)=>Number(r[0]?.c||0)).catch(()=>0),
            sql`SELECT COUNT(*)::int AS c FROM physi_hall_alias_votes WHERE voter_id=${uid}`.then((r:any)=>Number(r[0]?.c||0)).catch(()=>0),
            sql`SELECT COUNT(*)::int AS c FROM physi_prof_alias_votes WHERE voter_id=${uid}`.then((r:any)=>Number(r[0]?.c||0)).catch(()=>0),
          ]);
          wmap.set(uid, weightFromTotal(c1+c2+c3+c4));
        } catch { wmap.set(uid, 1); }
      }));
      let wYes=0, wNo=0;
      for (const v of voters) {
        const w = wmap.get(String((v as any).voter_id)) ?? 1;
        if (Number((v as any).vote_value)===1) wYes+=w; else wNo+=w;
      }
      weightedYes = Number(wYes.toFixed(2));
      weightedNo = Number(wNo.toFixed(2));
      weightedStatus = weightedQuorumStatus(wYes, wNo);
    } catch {}
    const status = weightedStatus;

    // update alias row counts + status
    if(status==="pending"){
      await sql`UPDATE physi_hall_aliases SET vote_count=${total}, votes_yes=${yes}, votes_no=${no}, status='pending', resolved_at=NULL WHERE id=${aliasId}`;
    } else if(status==="resolved"){
      await sql`UPDATE physi_hall_aliases SET vote_count=${total}, votes_yes=${yes}, votes_no=${no}, status='resolved', resolved_at=NOW() WHERE id=${aliasId}`;
    } else {
      await sql`UPDATE physi_hall_aliases SET vote_count=${total}, votes_yes=${yes}, votes_no=${no}, status='rejected', resolved_at=NOW() WHERE id=${aliasId}`;
    }

    const updated=await sql`SELECT * FROM physi_hall_aliases WHERE id=${aliasId} LIMIT 1`;
    return NextResponse.json({ok:true, alias: updated[0], votes:{yes,no,total}, weighted:{yes: weightedYes, no: weightedNo, total: Number((weightedYes+weightedNo).toFixed(2))}, status, quorum_needed: Math.max(0, QUORUM_MIN-(weightedYes+weightedNo)), quorum_needed_raw: Math.max(0, QUORUM_MIN-total)});
  }catch(e){
    logError("HALL_ALIAS_VOTE_FAILED", e, {});
    return NextResponse.json({ok:false,code:"INTERNAL",message:getErrorMessage("INTERNAL")},{status:500});
  }
}

export async function GET(req: NextRequest){
  try{
    const sql=getSql();
    if(!isDbConfigured()||!sql) return NextResponse.json(dbNotConfigured(),{status:503});
    try{ await ensureAllTables(); }catch{}
    const { searchParams }=new URL(req.url);
    const programme=searchParams.get("programme");
    const level=searchParams.get("level");
    const statusFilter=searchParams.get("status") || "pending";
    // Build where clause
    let rows:any[];
    if(programme && level){
      rows=await sql`SELECT * FROM physi_hall_aliases WHERE status=${statusFilter} AND (programme IS NULL OR lower(programme)=lower(${programme})) AND (level IS NULL OR lower(level)=lower(${level})) ORDER BY vote_count DESC, created_at DESC LIMIT 50`;
    } else if(programme){
      rows=await sql`SELECT * FROM physi_hall_aliases WHERE status=${statusFilter} AND (programme IS NULL OR lower(programme)=lower(${programme})) ORDER BY vote_count DESC, created_at DESC LIMIT 50`;
    } else {
      // generic list pending proposals
      // if no filter, return pending proposals
      rows=await sql`SELECT * FROM physi_hall_aliases WHERE status=${statusFilter} ORDER BY vote_count DESC, created_at DESC LIMIT 50`;
    }
    return NextResponse.json({ok:true, proposals: rows, count: rows.length});
  }catch(e){
    logError("HALL_ALIAS_FETCH_FAILED", e, {});
    return NextResponse.json({ok:false,code:"INTERNAL",message:getErrorMessage("INTERNAL")},{status:500});
  }
}
