import { neon } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.warn('[db] DATABASE_URL is not set. All /api/* will return 503 until configured.');
}

export const sql = databaseUrl ? neon(databaseUrl) : null;

export function isDbConfigured(): boolean {
  return !!databaseUrl && !!sql;
}

export function dbUnavailableResponse() {
  // Use native Response to avoid importing next/server in non-route contexts
  return {
    ok: false,
    error: 'DATABASE_URL is not configured. Set it in .env.local / Vercel env and redeploy.',
    code: 'DB_NOT_CONFIGURED',
  };
}
