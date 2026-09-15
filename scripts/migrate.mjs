import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import postgres from "postgres";

// NOTE: uses postgres.js (TCP), NOT @neondatabase/serverless.
// The installed neon client (0.10.4) has no .unsafe() raw-query method,
// so migrate crashed on Vercel with "sql.unsafe is not a function".
// postgres.js speaks normal Postgres protocol (Neon accepts TCP) and
// exposes .unsafe() for multi-statement DDL strings.

const __dirname = dirname(fileURLToPath(import.meta.url));
const url = process.env.DATABASE_URL || process.env.DATABASE_URLS?.split(",")[0]?.trim();

if (!url) {
  console.warn("[migrate] DATABASE_URL unset — skipping (ok for CI without DB)");
  process.exit(0);
}

const sql = postgres(url, { max: 1 });
const schemaPath = resolve(__dirname, "../database/schema.physi.sql");
const schema = readFileSync(schemaPath, "utf8");

// Split on semicolon + newline, filter empty, execute sequentially (DDL must be ordered)
const stmts = schema.split(/;\s*\n/).map(s => s.trim()).filter(Boolean);
console.log(`[migrate] running ${stmts.length} statements from database/schema.physi.sql`);

let code = 0;
try {
  for (const stmt of stmts) {
    try {
      await sql.unsafe(stmt);
    } catch (e) {
      if (!String(e.message).includes("already exists")) {
        console.error(`[migrate] FAILED: ${stmt.slice(0, 80)}...`);
        console.error(`[migrate] error: ${e.message}`);
        code = 1;
        break;
      }
    }
  }
  console.log(code === 0 ? "[migrate] done" : "[migrate] aborted with errors");
} finally {
  await sql.end();
}
process.exit(code);
