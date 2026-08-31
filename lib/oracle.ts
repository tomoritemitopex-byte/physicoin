"use client";
// Oracle Bazaar Blast — 24h flash Bazaar, squads bet candies on oracle (BTC/football), losers pot → blast winner, 5 to unlock
// Deterministic oracle: BTC uses coarse hash of day; football uses seeded pick. Bets stored localStorage, blast checks pot.
export type OracleKind="btc"|"football";
export type BlastBet={ id:string; squad:string[]; kind:OracleKind; pick:string; amt:number; ts:number; pot:number };
const BAZAAR_KEY="physicoin_bazaar_blast"; const BLAST_THRESHOLD=5;
function daySeed():number{ const d=new Date().toISOString().slice(0,10); let h=0; for(let i=0;i<d.length;i++) h=(h*31+d.charCodeAt(i))>>>0; return h; }
export function oracleResult(kind:OracleKind):string{ const s=daySeed(); if(kind==="btc") return (s%2===0)? "BTC_UP":"BTC_DOWN"; // deterministic 50/50 per day
  const picks=["ARS","MCI","LIV","CHE"]; return picks[s%picks.length]; }
export function getBazaar():{ bets:BlastBet[]; pot:number; blastReady:boolean; winner:string|null }{ try{ const raw=localStorage.getItem(BAZAAR_KEY); const bets:BlastBet[]= raw? JSON.parse(raw):[]; const pot=bets.reduce((a,b)=>a+b.amt,0); const blastReady=pot>=BLAST_THRESHOLD; // winner is squad whose pick matches oracle
    let winner:string|null=null; if(blastReady){ for(const b of bets){ if(b.pick===oracleResult(b.kind)) { winner=b.squad.join(","); break; } } } return {bets, pot, blastReady, winner}; }catch{ return {bets:[], pot:0, blastReady:false, winner:null}; } }
export function placeBet(squad:string[], kind:OracleKind, pick:string, amt:number):BlastBet{ const bet:BlastBet={ id:`bet_${Date.now()}_${Math.random().toString(36).slice(2,5)}`, squad, kind, pick, amt:Math.max(1,Math.min(10,Math.floor(amt))), ts:Date.now(), pot:0 }; try{ const cur=getBazaar(); const next=[...cur.bets.filter(b=> Date.now()-b.ts < 24*3600*1000), bet]; localStorage.setItem(BAZAAR_KEY, JSON.stringify(next)); try{ new BroadcastChannel("physicoin_bazaar").postMessage({type:"bet", bet}); }catch{} }catch{} return bet; }
export function claimBlast():number{ const {pot, blastReady}=getBazaar(); if(!blastReady) return 0; try{ localStorage.removeItem(BAZAAR_KEY); try{ new BroadcastChannel("physicoin_bazaar").postMessage({type:"blast", pot}); }catch{} return pot; }catch{ return pot; } }
export function bazaarTimeLeftMs():number{ try{ const raw=localStorage.getItem(BAZAAR_KEY); if(!raw) return 24*3600*1000; const bets:BlastBet[]=JSON.parse(raw); if(!bets.length) return 24*3600*1000; const oldest=Math.min(...bets.map(b=>b.ts)); const elapsed=Date.now()-oldest; return Math.max(0, 24*3600*1000 - elapsed); }catch{ return 0; } }
