"use client";
// Decay Streak Rescue — daily streak decays half-life if miss; friend one-tap rescue entangles
// streak N(t)=N0*0.5^(days/half) with half=7d, miss decays, rescue restores via BroadcastChannel + localStorage
// Auto-streak: bumpStreak() is auto-called on any verified action (verify, scope vote, bunk report).
// Manual mining is bonus +0.5 Rep on top.
import { decayByHalfLife } from "@/lib/rep";
export const STREAK_HALF_DAYS=7;
export const STREAK_AUTO_BUMP_SOURCES = ["verify","scope_vote","bunk_report","prof_sighting","event_post"] as const;
export const MANUAL_MINING_BONUS_REP = 0.5;
const K_LAST="physi_streak_last"; const K_VAL="physi_streak_val"; const K_RESCUE="physi_streak_rescue";
function todayWAT():string{ try{ return new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Lagos",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()); }catch{ return new Date().toISOString().slice(0,10); } }
function daysBetween(a:string,b:string){ const da=Date.parse(a), db=Date.parse(b); if(isNaN(da)||isNaN(db)) return 0; return Math.floor((db-da)/86400000); }
export function getStreak():{ streak:number; last:string|null; decayed:number }{ try{ const last=localStorage.getItem(K_LAST); const raw=Number(localStorage.getItem(K_VAL)||"0"); const now=todayWAT(); if(!last) return {streak:raw, last:null, decayed:raw}; const gap=daysBetween(last, now); if(gap<=1) return {streak:raw, last, decayed:raw}; // 1 day grace
  const decayed=decayByHalfLife(raw, gap-1, STREAK_HALF_DAYS); return {streak:raw, last, decayed:Number(decayed.toFixed(1))}; }catch{ return {streak:0,last:null,decayed:0}; } }
export function bumpStreak(source?: string):number{ try{ const now=todayWAT(); const cur=getStreak(); const last=localStorage.getItem(K_LAST); if(last===now) return cur.decayed||cur.streak; // already bumped today
  const base = cur.decayed>0? cur.decayed : Number(localStorage.getItem(K_VAL)||"0"); const next = last? (daysBetween(last,now)===1? Math.min(99, Math.floor(base)+1):1) :1; // if gap>1 decays then reset to 1 but decay already
  localStorage.setItem(K_VAL,String(next)); localStorage.setItem(K_LAST,now); try{ if(source) localStorage.setItem("physi_streak_source", source); }catch{} try{ new BroadcastChannel("physicoin_streak").postMessage({type:"bump", streak:next, source}); }catch{} return next; }catch{ return 1; } }
/** Auto-bump on verified action — idempotent per day */
export function autoBumpStreak(source: typeof STREAK_AUTO_BUMP_SOURCES[number] | string): number {
  return bumpStreak(source);
}
export function rescueStreak(friendId?:string):number{ try{ const cur=getStreak(); // rescue restores decayed → floor +5 capped
  const restored = Math.min(99, Math.ceil((cur.decayed||0)+5)); localStorage.setItem(K_VAL,String(restored)); localStorage.setItem(K_LAST,todayWAT()); localStorage.setItem(K_RESCUE, String(Date.now())); try{ new BroadcastChannel("physicoin_streak").postMessage({type:"rescue", by:friendId||"friend", streak:restored}); }catch{} // entangle via shardsync
  try{ const { vaultPut } = require("@/lib/shardsync"); vaultPut({type:"streak_rescue", by:friendId, streak:restored, ts:Date.now()}); }catch{} return restored; }catch{ return 0; } }
export function onStreak(cb:(s:number)=>void){ try{ const ch=new BroadcastChannel("physicoin_streak"); ch.onmessage=(e)=>{ if(e.data?.type==="bump"||e.data?.type==="rescue") cb(Number(e.data.streak||0)); }; return ()=>ch.close(); }catch{ return ()=>{}; } }
