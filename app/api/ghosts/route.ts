import { NextResponse } from "next/server";
import { getSql, isDbConfigured, dbNotConfigured } from "@/lib/db";
export const dynamic="force-dynamic";
function anonHash(s:string){ let h=2166136261; for(let i=0;i<s.length;i++){h^=s.charCodeAt(i); h=Math.imul(h,16777619);} return (h>>>0).toString(16).padStart(8,"0").slice(0,4).toUpperCase(); }
export async function GET(){
  const sql=getSql(); if(!isDbConfigured()||!sql) return NextResponse.json({ ok:true, dots:[] });
  try{
    // count peers from physi_canonical_log promoted within 7d, only if total anon count>7, no PII, 10% sample anon
    const rows=await sql`SELECT promoted_by, COUNT(*)::int as c FROM physi_canonical_log WHERE promoted_at >= NOW() - INTERVAL '7 days' AND promoted_by IS NOT NULL GROUP BY promoted_by HAVING COUNT(*) > 7`;
    if(!rows || (rows as any[]).length===0) return NextResponse.json({ ok:true, dots:[] });
    // 10% anon sample
    const sampled=(rows as any[]).filter(()=> Math.random()<0.10).slice(0,12);
    if(sampled.length===0 && (rows as any[]).length>0){
      // deterministic fallback: take 10% ceil at least 1 but keep 10% semantics — take first ceil(10%)
      const n=Math.max(1, Math.ceil((rows as any[]).length*0.10)); sampled.push(...(rows as any[]).slice(0,n));
      // dedupe
      const seen=new Set<string>(); const uniq:any[]=[]; for(const r of sampled){ const id=String((r as any).promoted_by); if(!seen.has(id)){seen.add(id); uniq.push(r);} } sampled.length=0; sampled.push(...uniq);
    }
    const dots= sampled.map((r:any, i:number)=> ({ id: anonHash(String(r.promoted_by)), hash: anonHash(String(r.promoted_by)), yPct: (i*0.13)%1, delay: (i*0.4)%2.2 }));
    return NextResponse.json({ ok:true, dots, count: (rows as any[]).length });
  }catch(e){ return NextResponse.json({ ok:true, dots:[] }); }
}
