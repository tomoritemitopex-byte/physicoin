# PHYSI v2 — Fresh Rebuild

Bespoke SRE.ai style. No code reused from v1.

- FRONT: `/` (RSC landing) — value before login
- INSIDE: `/app/*` (timetable, verify, mining, roadmap, profile)
- Stack: Next 14 · Tailwind · Neon serverless · handle auth
- DB: `physi_*` isolated, `lib/ensure.ts` parallel + pgcrypto guard + retry
- See `/tmp/new-arch.md` for full architecture.

## Quick start
```bash
export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 20
cp .env.local.example .env.local  # add DATABASE_URL
npm install
npm run build
npm run dev
```
