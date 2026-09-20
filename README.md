# PHYSI v2 — Fresh Rebuild

Bespoke SRE.ai style. No code reused from v1.

- FRONT: `/` (RSC landing) — value before login
- INSIDE: `/app/*` (timetable, verify, mining, roadmap, profile)
- Stack: Next 14 · Tailwind · Neon serverless · handle auth
- DB: `physi_*` isolated, build-time migrate `node scripts/migrate.mjs` primary; `ensureAllTables()` is a deprecated no-op
- Architecture overview: neon postgres `physi_*` tables, serverless functions, in-process adapter dispatch (`lib/data.ts`), no `fetch()` to localhost

## Quick start
```bash
export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 22
cp .env.example .env.local  # add DATABASE_URL
npm install
npm run build
npm run dev
```
