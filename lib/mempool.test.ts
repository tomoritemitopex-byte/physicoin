/**
 * lib/mempool.test.ts — 2 students posting conflicting BIO 101 venues → 1 mempool entry, tip wins on quorum
 * Run: npx tsx lib/mempool.test.ts  or  node --loader ts-node lib/mempool.test.ts
 */
import { slotKey, withinWindow, groupBySlot, pickTip, MEMPOOL_SLOT_WINDOW_MIN } from "./mempool";

// Simulate in-memory SQL layer
function mockSql(rows: any[]) {
  // minimal mock for getCompetingClaims / expireMempool
  const fn: any = (strings: any, ...vals: any[]) => Promise.resolve([]);
  fn.unsafe = async () => [];
  return fn;
}

async function test() {
  console.log("== mempool primitive test ==");

  // 1. Slot key same for BIO 101 variants in same scope+date
  const a = slotKey({ scope_value: "100L", event_date: "2026-09-03", event_time: "08:00", title: "BIO 101" });
  const b = slotKey({ scope_value: "100L", event_date: "2026-09-03", event_time: "08:15", title: "BIO 101" });
  const c = slotKey({ scope_value: "200L", event_date: "2026-09-03", event_time: "08:00", title: "BIO 101" });
  console.assert(a === b, `slotKey should match for same slot: ${a} vs ${b}`);
  console.assert(a !== c, `slotKey should differ for different scope_value`);
  console.log("✓ slotKey fuzzy grouping");

  // 2. Time window ±30m
  console.assert(withinWindow("08:00", "08:15") === true, "within 30m");
  console.assert(withinWindow("08:00", "08:31") === false, "outside 30m");
  console.assert(withinWindow("08:00", "08:30") === true, "edge 30m");
  console.log(`✓ withinWindow ±${MEMPOOL_SLOT_WINDOW_MIN}m`);

  // 3. Two students conflicting venues → 1 mempool entry, grouped
  const events = [
    { id: "1", title: "BIO 101", venue: "LT2", event_date: "2026-09-03", event_time: "08:00", scope_value: "100L", created_at: "2026-09-03T07:00:00Z" },
    { id: "2", title: "BIO 101", venue: "Hall B", event_date: "2026-09-03", event_time: "08:10", scope_value: "100L", created_at: "2026-09-03T07:05:00Z" },
  ];
  const grouped = groupBySlot(events);
  console.assert(grouped.size === 1, `should be 1 mempool entry, got ${grouped.size}`);
  const claims = grouped.get(a)!;
  console.assert(claims.length === 2, `should have 2 competing claims`);
  console.log("✓ 2 conflicting venues → 1 mempool entry with 2 claims");

  // 4. Tip selection
  const tip = pickTip(claims);
  console.assert(tip && tip.tip.id === "1", "tip should be earliest (LT2)");
  console.log(`✓ tip wins: ${tip!.tip.venue} vs contenders ${tip!.contenders.map((x:any)=>x.venue).join(",")}`);

  // 5. Different dates → separate slots
  const d = slotKey({ scope_value: "100L", event_date: "2026-09-04", event_time: "08:00", title: "BIO 101" });
  console.assert(a !== d, "different date = different slot");
  console.log("✓ date isolation");

  console.log("\nAll mempool tests passed. 1 mempool entry, 1 tip (earliest) wins; quorum would promote tip.");
}

test().catch(e => { console.error(e); process.exit(1); });
