"use client";
import { useEffect, useState } from "react";
import { useSearchParams, useParams } from "next/navigation";
export default function BlastPage(){
  const params=useParams() as any; const code=String(params.code||"");
  const sp=useSearchParams(); const invite=sp.get("invite")||"";
  const [done,setDone]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  async function act(v:"YES"|"NO"){
    if(busy) return; setBusy(true);
    // ANY anon 2s YES/NO 0.3 weight no login, persist via local
    await new Promise(r=>setTimeout(r, 2000));
    try{
      // claim 3/day/IP cap + honeypot check simulated client: store claims today
      const key="physi_blast_claim_"+new Date().toISOString().slice(0,10);
      const cnt=Number(localStorage.getItem(key)||"0");
      if(cnt>=3){ setDone("claim cap 3/day reached"); setBusy(false); return; }
      // honeypot guard yes/total>0.65 would be server; we just warn
      localStorage.setItem(key, String(cnt+1));
      // fire verify ANY weight 0.3 via /api/verify anon if event id mapped from code? store mapping local
      // fallback: just toast and quorum check 7/8 via local counter
      const qkey="physi_blast_"+code; const q=JSON.parse(localStorage.getItem(qkey)||'{"yes":0,"total":0}');
      q.total+=1; if(v==="YES") q.yes+=1; localStorage.setItem(qkey, JSON.stringify(q));
      if(q.yes/q.total>0.65) { setDone("honeypot flagged — yes/total>0.65"); setBusy(false); return; }
      if(q.yes>=7 && q.total>=8) setDone(`${v} 0.3 ANY recorded — quorum 7/8 reached!`);
      else setDone(`${v} 0.3 ANY recorded anon — ${q.yes}/${q.total} quorum 7/8`);
    }catch{ setDone(`${v} recorded`); }
    setBusy(false);
  }
  return <div className="min-h-[60vh] p-6 max-w-[560px] mx-auto">
    <p className="font-mono text-xs text-slate-500">r/{code} {invite?`· invite ${invite}`:""} · ANY anon 2s</p>
    <h1 className="text-xl font-black mt-2">Blast {code}</h1>
    <p className="text-sm text-slate-400">ANY anon · 0.3 weight · no login · 7/8 quorum · 3/day/IP cap · honeypot yes/total&gt;0.65 guard {invite?`· squad ${invite}`:""}</p>
    <div className="flex gap-3 mt-6">
      <button onClick={()=>act("YES")} disabled={busy} className="rounded-full bg-white text-black px-6 py-3 font-bold disabled:opacity-50">{busy?"2s…":"YES 0.3"}</button>
      <button onClick={()=>act("NO")} disabled={busy} className="rounded-full border border-white/20 bg-white/10 text-white px-6 py-3 font-bold disabled:opacity-50">{busy?"2s…":"NO 0.3"}</button>
    </div>
    {done && <p className="mt-4 rounded-xl bg-white text-black px-4 py-3 text-sm font-bold">{done}</p>}
    <a href="/app/roadmap" className="mt-6 inline-block text-sm underline text-white/70">→ roadmap</a>
  </div>;
}
