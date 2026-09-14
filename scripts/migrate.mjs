import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { neon } from "@neondatabase/serverless";

const __dirname = dirname(fileURLToPath(import.meta.url));
const url = process.env.DATABASE_URL || process.env.DATABASE_URLS?.split(",")[0]?.trim();

if (!url) {
  console.warn("[migrate] DATABASE_URL unset — skipping (ok for CI without DB)");
  process.exit(0);
}

const sql = neon(url);
const schemaPath = resolve(__dirname, "../database/schema.physi.sql");
const schema = readFileSync(schemaPath, "utf8");

// Split on semicolon + newline, filter empty, execute sequentially (DDL must be ordered)
const stmts = schema.split(/;\s*\n/).map(s => s.trim()).filter(Boolean);
console.log(`[migrate] running ${stmts.length} statements from database/schema.physi.sql`);

for (const stmt of stmts) {
  try {
    await sql.unsafe(stmt);
  } catch (e) {
    if (!String(e.message).includes("already exists")) {
      console.error(`[migrate] FAILED: ${stmt.slice(0, 80)}...`);
      throw e;
    }
  }
}

console.log("[migrate] done");
