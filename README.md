# PHYSI Web App

Web-first PHYSI landing page and roadmap scaffold for Vercel + Neon.

## Stack
- Next.js
- TypeScript
- Neon Postgres ready

## Run locally
```bash
npm install
npm run dev
```

## Environment
Create a `.env.local` file and add:

```bash
DATABASE_URL=your_neon_connection_string
```

## Deploy
1. Push this repo to GitHub
2. Import it into Vercel
3. Add `DATABASE_URL` in Vercel environment variables
4. Deploy

## Notes
- The current build is a polished front page / roadmap scaffold.
- The Neon client is ready for future database queries.
- `database/schema.sql` includes the starter tables for users, events, verifications, and mining logs.
- You can expand this into auth, onboarding, event creation, and mining screens next.
