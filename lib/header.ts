/**
 * lib/header.ts — HMAC-anchored daily header (SPV)
 * header_n = { date, prevHash, merkleRoot, ghostTipRoot, count, hmac }
 * merkleRoot = merkle(sorted verified event_ids for date)
 * ghostTipRoot = merkle(sorted rep_ghost_sig)
 * prevHash = sha256(prev header JSON) or GHOST_GENESIS
 * hmac = HMAC_SHA256(serverSecret, header_without_hmac)
 */
import { createHash, createHmac } from "crypto";
import { getSql } from "./db";
import { GHOST_GENESIS } from "./ghostWitness";
import { merkleRoot } from "./merkle";

function sha256Hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}
function getSecret(): string {
  const s = (process.env.HMAC_SECRET || process.env.GHOST_HMAC_SECRET || "").trim();
  if (s) return s;
  console.warn("[header] HMAC_SECRET unset — using dev fallback");
  return "dev-fallback-hmac-secret-do-not-use-in-prod";
}

export type DailyHeader = {
  date: string; // YYYY-MM-DD
  prevHash: string;
  merkleRoot: string;
  ghostTipRoot: string;
  count: number;
  hmac: string;
};

export async function buildHeader(date: string): Promise<DailyHeader> {
  const sql = getSql();
  const d = String(date).slice(0, 10);
  let merkle = sha256Hex("");
  let ghostRoot = sha256Hex("");
  let count = 0;
  if (sql) {
    try {
      const rows: any[] = await sql`SELECT id::text as id FROM physi_events WHERE status='verified' AND event_date=${d}::date ORDER BY id` as any;
      const ids = (rows || []).map((r: any) => String(r.id));
      count = ids.length;
      merkle = merkleRoot(ids);
    } catch { merkle = sha256Hex(""); }
    try {
      const gRows: any[] = await sql`SELECT rep_ghost_sig as sig FROM physi_users WHERE rep_ghost_sig IS NOT NULL ORDER BY rep_ghost_sig` as any;
      const sigs = (gRows || []).map((r: any) => String(r.sig)).filter(Boolean);
      ghostRoot = merkleRoot(sigs.length ? sigs : [""]);
      if (!sigs.length) ghostRoot = sha256Hex("");
    } catch { ghostRoot = sha256Hex(""); }
  }
  // prevHash
  let prevHash = GHOST_GENESIS;
  if (sql) {
    try {
      const prev: any[] = await sql`SELECT hmac, merkle_root, ghost_tip_root, prev_hash, date FROM physi_headers WHERE date < ${d}::date ORDER BY date DESC LIMIT 1` as any;
      if (prev.length) {
        const p = prev[0];
        // hash of previous header's canonical JSON
        const prevJson = JSON.stringify({ date: String(p.date).slice(0,10), prevHash: p.prev_hash, merkleRoot: p.merkle_root, ghostTipRoot: p.ghost_tip_root, count: p.count });
        prevHash = sha256Hex(prevJson);
      }
    } catch {}
  }
  const payload = JSON.stringify({ date: d, prevHash, merkleRoot: merkle, ghostTipRoot: ghostRoot, count });
  const hmac = createHmac("sha256", getSecret()).update(payload).digest("hex");
  return { date: d, prevHash, merkleRoot: merkle, ghostTipRoot: ghostRoot, count, hmac };
}

export async function ensureAndGetHeader(date: string): Promise<DailyHeader> {
  const sql = getSql();
  const d = String(date).slice(0, 10);
  if (sql) {
    try {
      const existing: any[] = await sql`SELECT date::text as date, prev_hash as prevHash, merkle_root as merkleRoot, ghost_tip_root as ghostTipRoot, count, hmac FROM physi_headers WHERE date=${d}::date LIMIT 1` as any;
      if (existing.length) {
        return {
          date: String(existing[0].date).slice(0,10),
          prevHash: existing[0].prevHash,
          merkleRoot: existing[0].merkleRoot,
          ghostTipRoot: existing[0].ghostTipRoot,
          count: Number(existing[0].count),
          hmac: existing[0].hmac,
        };
      }
    } catch {}
  }
  const hdr = await buildHeader(d);
  if (sql) {
    try {
      await sql`INSERT INTO physi_headers (date, merkle_root, ghost_tip_root, prev_hash, hmac, count) VALUES (${d}::date, ${hdr.merkleRoot}, ${hdr.ghostTipRoot}, ${hdr.prevHash}, ${hdr.hmac}, ${hdr.count}) ON CONFLICT (date) DO NOTHING`;
    } catch {}
  }
  return hdr;
}

export function verifyHeaderHmac(header: DailyHeader): boolean {
  const payload = JSON.stringify({ date: header.date, prevHash: header.prevHash, merkleRoot: header.merkleRoot, ghostTipRoot: header.ghostTipRoot, count: header.count });
  const expected = createHmac("sha256", getSecret()).update(payload).digest("hex");
  if (expected.length !== header.hmac.length) return false;
  let ok = 0;
  for (let i=0;i<expected.length;i++) ok |= expected.charCodeAt(i) ^ header.hmac.charCodeAt(i);
  return ok===0;
}
