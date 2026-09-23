import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import postgres from "postgres";

// NOTE: uses postgres.js (TCP), NOT @neondatabase/serverless.
// The installed neon client (0.10.4) has no .unsafe() raw-query method,
// so migrate crashed on Vercel with "sql.unsafe is not a function".
// postgres.js speaks normal Postgres protocol (Neon accepts TCP) and
// exposes .unsafe() for multi-statement DDL strings.

// Inverted-audit P0 (K-A2/K-A5): trigger/function-safe statement splitter +
// migrate EVERY shard in DATABASE_URLS, not just shard 0. Quorum/votes are
// primary-scoped by design (see lib/db/framework.ts); stats aggregates via
// fanOutShards. Every shard must still carry the full schema so a future
// shard promotion never lands on a half-migrated database.

const __dirname = dirname(fileURLToPath(import.meta.url));

function shardUrls() {
  const urls = [];
  const multi = (process.env.DATABASE_URLS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  for (const u of multi) if (!urls.includes(u)) urls.push(u);
  const single = (process.env.DATABASE_URL ?? "").trim();
  if (single && !urls.includes(single)) urls.push(single);
  return urls;
}

// Split schema into statements without breaking on semicolons inside
// dollar-quoted bodies (DO $$ ... $$, CREATE FUNCTION ... $func$ ... $func$),
// line comments (-- ...) and block comments (/* ... */).
function splitStatements(schema) {
  const stmts = [];
  let buf = "";
  let i = 0;
  const n = schema.length;
  let lineComment = false;
  let blockComment = false;
  let quote = null; // ' or "
  let dollarTag = null; // $tag$ when inside dollar-quoting

  while (i < n) {
    // inside line comment
    if (lineComment) {
      buf += schema[i];
      if (schema[i] === "\n") lineComment = false;
      i++;
      continue;
    }
    // inside block comment
    if (blockComment) {
      if (schema[i] === "*" && schema[i + 1] === "/") {
        buf += "*/";
        i += 2;
        blockComment = false;
      } else {
        buf += schema[i];
        i++;
      }
      continue;
    }
    // inside single/double-quoted string ('' escape)
    if (quote) {
      buf += schema[i];
      if (schema[i] === quote) {
        if (schema[i + 1] === quote) {
          buf += schema[i + 1];
          i += 2;
          continue;
        }
        quote = null;
      }
      i++;
      continue;
    }
    // inside dollar-quoted body
    if (dollarTag !== null) {
      if (schema.startsWith(dollarTag, i)) {
        buf += dollarTag;
        i += dollarTag.length;
        dollarTag = null;
      } else {
        buf += schema[i];
        i++;
      }
      continue;
    }
    // comment openers
    if (schema[i] === "-" && schema[i + 1] === "-") {
      lineComment = true;
      buf += "--";
      i += 2;
      continue;
    }
    if (schema[i] === "/" && schema[i + 1] === "*") {
      blockComment = true;
      buf += "/*";
      i += 2;
      continue;
    }
    // string openers
    if (schema[i] === "'" || schema[i] === '"') {
      quote = schema[i];
      buf += schema[i];
      i++;
      continue;
    }
    // dollar-quote opener: $tag$ where tag is [A-Za-z_][A-Za-z0-9_]*
    const dm = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(schema.slice(i));
    if (dm) {
      dollarTag = dm[0];
      buf += dollarTag;
      i += dollarTag.length;
      continue;
    }
    // statement terminator (only at top level)
    if (schema[i] === ";") {
      buf += ";";
      const stmt = buf.trim();
      if (stmt.replace(/;$/, "").trim()) stmts.push(stmt);
      buf = "";
      i++;
      continue;
    }
    buf += schema[i];
    i++;
  }
  const tail = buf.trim();
  if (tail.replace(/;$/, "").trim()) stmts.push(tail);
  return stmts;
}

// Idempotent-noise matchers: re-running migrate on an existing DB must skip,
// not abort. ADD CONSTRAINT ... CHECK has no IF NOT EXISTS in Postgres, so
// schema expresses those as DO blocks; these matchers are the backstop.
function isAlreadyApplied(message) {
  const m = String(message);
  return (
    m.includes("already exists") ||
    m.includes("duplicate key") ||
    m.includes("constraint") && m.includes("already exists")
  );
}

const urls = shardUrls();
if (!urls.length) {
  console.warn("[migrate] DATABASE_URL unset — skipping (ok for CI without DB)");
  process.exit(0);
}

const schemaPath = resolve(__dirname, "../database/schema.physi.sql");
const schema = readFileSync(schemaPath, "utf8");
const stmts = splitStatements(schema);

let failedShards = 0;
for (let s = 0; s < urls.length; s++) {
  const label = urls.length > 1 ? `shard ${s} (${urls[s].slice(0, 28)}…)` : "primary";
  console.log(`[migrate] ${label}: running ${stmts.length} statements from database/schema.physi.sql`);
  const sql = postgres(urls[s], { max: 1 });
  const errors = [];
  try {
    for (const stmt of stmts) {
      try {
        await sql.unsafe(stmt);
      } catch (e) {
        if (isAlreadyApplied(e.message)) continue;
        errors.push({ stmt: stmt.slice(0, 120), error: e.message });
      }
    }
  } finally {
    await sql.end();
  }
  if (errors.length) {
    failedShards++;
    console.error(`[migrate] ${label}: ${errors.length} statement(s) FAILED (continuing to next shard):`);
    for (const f of errors.slice(0, 10)) {
      console.error(`[migrate] FAILED: ${f.stmt}...`);
      console.error(`[migrate] error: ${f.error}`);
    }
  } else {
    console.log(`[migrate] ${label}: done`);
  }
}

if (failedShards) {
  console.error(`[migrate] aborted with errors on ${failedShards}/${urls.length} shard(s)`);
  process.exit(1);
}
console.log("[migrate] done");
