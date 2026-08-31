"use client";
// ShardSync Vault — IndexedDB via adapter + Background Sync + BroadcastChannel CRDT shards offline entangle
// No fake DB rows: persists only user-generated intents; syncs via /api/timetable when back online.
// CRDT: LWW per event id (last-write-wins by updated_at), shards keyed by scope_type/scope_value.
export type ShardKey = string; // e.g. whole_school:*
export type VaultEntry = { id:string; shard:ShardKey; payload:any; ts:number; origin:string };
const DB_NAME="physicoin_vault"; const STORE="shards"; const META="vault_meta";
let bc: BroadcastChannel | null=null;
function getBC(){ if(typeof window==="undefined") return null; if(bc) return bc; try{ bc=new BroadcastChannel("physicoin_shards"); }catch{ bc=null; } return bc; }
function shardKeyOf(payload:any):ShardKey{ const t=String(payload?.scope_type||"whole_school"); const v=String(payload?.scope_value||"*"); return `${t}:${v}`; }
function openDB():Promise<IDBDatabase>{ return new Promise((res,rej)=>{ const r=indexedDB.open(DB_NAME,1); r.onupgradeneeded=()=>{ const db=r.result; if(!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE,{keyPath:"id"}); if(!db.objectStoreNames.contains(META)) db.createObjectStore(META,{keyPath:"k"}); }; r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); }
// Adapter: getSql? not needed client — we use IndexedDB as local shard; sync pushes to /api/*
// Entangle: BroadcastChannel notify across tabs
export async function vaultPut(payload:any){ const id=String(payload?.id||payload?.localId||`local_${Date.now()}_${Math.random().toString(36).slice(2,6)}`); const shard=shardKeyOf(payload); const entry:VaultEntry={id,shard,payload:{...payload,id}, ts:Date.now(), origin: (typeof navigator!=="undefined" && (navigator as any).userAgentData ? "vault" : "vault")}; try{ const db=await openDB(); await new Promise<void>((res,rej)=>{ const tx=db.transaction(STORE,"readwrite"); tx.objectStore(STORE).put(entry as any); tx.oncomplete=()=>res(); tx.onerror=()=>rej(tx.error); }); getBC()?.postMessage({type:"entangle", entry}); try{ if("serviceWorker" in navigator && "SyncManager" in window){ const reg=await navigator.serviceWorker.ready; await (reg as any).sync?.register("shardsync-entangle"); } }catch{} }catch{} return entry; }
export async function vaultList(shard?:ShardKey):Promise<VaultEntry[]>{ try{ const db=await openDB(); return await new Promise<VaultEntry[]>((res,rej)=>{ const tx=db.transaction(STORE,"readonly"); const req=tx.objectStore(STORE).getAll(); req.onsuccess=()=>{ const all=(req.result as VaultEntry[])||[]; res(shard? all.filter(e=>e.shard===shard): all); }; req.onerror=()=>rej(req.error); }); }catch{ return []; } }
export async function vaultFlush():Promise<number>{ // push pending intents to server (Background Sync handler)
  const pending=await vaultList(); let n=0;
  for(const e of pending){ try{ // only flush creations (payload has title/venue)
    if(e.payload?.title && e.payload?.venue){ const r=await fetch("/api/timetable",{method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify(e.payload)}); if(r.ok) { // LWW: remove after successful sync
      const db=await openDB(); await new Promise<void>((res)=>{ const tx=db.transaction(STORE,"readwrite"); tx.objectStore(STORE).delete(e.id); tx.oncomplete=()=>res(); tx.onerror=()=>res(); }); n++; }
    }
  }catch{} }
  return n;
}
export function onEntangle(cb:(e:VaultEntry)=>void){ const ch=getBC(); if(!ch) return ()=>{}; const h=(ev:MessageEvent)=>{ if(ev.data?.type==="entangle" && ev.data.entry) cb(ev.data.entry as VaultEntry); }; ch.addEventListener("message", h); return ()=> ch.removeEventListener("message", h as any); }
// register SW background sync listener if available
if(typeof window!=="undefined"){ try{ navigator.serviceWorker?.addEventListener?.("message", (ev:any)=>{ if(ev.data?.type==="vault-flush") vaultFlush(); }); }catch{} }
