/**
 * app/api/halls/resolve/route.ts — returns canonical name if resolved
 * GET /api/halls/resolve?alias=LT2  → { resolved: true, canonical: "LT 2", alias: "LT2" }
 */
import { NextRequest, NextResponse } from "next/server";
import { getSql, isDbConfigured, dbNotConfigured, ensureAllTables } from "@/lib/db";
import { logError, getErrorMessage } from "@/lib/adapters/error";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest){
  try{
    const sql=getSql();
    if(!isDbConfigured()||!sql) return NextResponse.json(dbNotConfigured(),{status:503});
    try{ await ensureAllTables(); }catch{}
    const { searchParams }=new URL(req.url);
    const alias=String(searchParams.get("alias")||"").trim();
    const canonical=String(searchParams.get("canonical")||"").trim();
    if(!alias && !canonical) return NextResponse.json({ok:false,code:"BAD_INPUT",message:getErrorMessage("BAD_INPUT")},{status:400});

    // lookup: if alias query param given, find resolved row where lower(alias)=alias
    // prefer resolved; otherwise check both directions
    let row:any=null;
    if(alias){
      const r=await sql`SELECT * FROM physi_hall_aliases WHERE lower(alias)=lower(${alias}) AND status='resolved' LIMIT 1`;
      if(r.length) row=r[0];
      // fallback: if alias matches canonical of a resolved row, it's already canonical
      if(!row){
        const r2=await sql`SELECT * FROM physi_hall_aliases WHERE lower(canonical)=lower(${alias}) AND status='resolved' LIMIT 1`;
        if(r2.length) return NextResponse.json({ok:true, resolved:true, alias, canonical: r2[0].canonical, already_canonical:true, proposal: r2[0]});
      }
    } else if(canonical){
      const r=await sql`SELECT * FROM physi_hall_aliases WHERE lower(canonical)=lower(${canonical}) AND status='resolved' LIMIT 1`;
      if(r.length) row=r[0];
    }

    if(!row) return NextResponse.json({ok:true, resolved:false, alias: alias||null, canonical:null});

    return NextResponse.json({ok:true, resolved:true, alias: row.alias, canonical: row.canonical, proposal: row});
  }catch(e){
    logError("HALL_RESOLVE_FAILED", e, {});
    return NextResponse.json({ok:false,code:"INTERNAL",message:getErrorMessage("INTERNAL")},{status:500});
  }
}
