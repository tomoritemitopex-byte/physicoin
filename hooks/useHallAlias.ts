"use client";
import { useCallback, useEffect, useState } from "react";

export type HallAliasProposal = {
  id: string;
  alias: string;
  canonical: string;
  programme: string | null;
  level: string | null;
  subject: string | null;
  hall_group_key: string | null;
  vote_count: number;
  votes_yes: number;
  votes_no: number;
  status: string;
  resolved_at: string | null;
  created_at: string;
};

export function useHallAlias(programme?: string, level?: string) {
  const [proposals, setProposals] = useState<HallAliasProposal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const fetchProposals = useCallback(async () => {
    setLoading(true);
    try {
      const qs=new URLSearchParams();
      if(programme) qs.set("programme", programme);
      if(level) qs.set("level", level);
      qs.set("status","pending");
      const r=await fetch(`/api/halls/alias?${qs.toString()}`,{cache:"no-store"});
      const j=await r.json();
      setProposals(j.proposals||[]);
    } catch(e){ setError(e); } finally{ setLoading(false); }
  },[programme, level]);

  useEffect(()=>{ fetchProposals(); },[fetchProposals]);

  const vote = useCallback(async (args:{alias_name:string; canonical_name:string; voter_id:string; vote:"yes"|"no"})=>{
    setLoading(true);
    try{
      const r=await fetch("/api/halls/alias",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(args)});
      const j=await r.json();
      await fetchProposals();
      return j;
    } finally{ setLoading(false); }
  },[fetchProposals]);

  const resolve = useCallback(async (alias:string)=>{
    const r=await fetch(`/api/halls/resolve?alias=${encodeURIComponent(alias)}`,{cache:"no-store"});
    return r.json();
  },[]);

  return { proposals, loading, error, vote, resolve, refetch: fetchProposals };
}

export function useHallResolve(alias:string){
  const [canonical,setCanonical]=useState<string|null>(null);
  const [resolved,setResolved]=useState(false);
  const [aliasWas,setAliasWas]=useState<string|null>(null);
  useEffect(()=>{
    if(!alias) return;
    fetch(`/api/halls/resolve?alias=${encodeURIComponent(alias)}`,{cache:"no-store"})
      .then(r=>r.json()).then(j=>{
        if(j.resolved){ setResolved(true); setCanonical(j.canonical); setAliasWas(j.alias); }
        else { setResolved(false); setCanonical(null); }
      }).catch(()=>{});
  },[alias]);
  return { resolved, canonical, aliasWas };
}
