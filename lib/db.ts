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
  // Structured error consumed by frontend banner — keep code stable for client detection
  return {
    ok: false as const,
    error: 'DATABASE_URL is not configured. Set it in .env.local / Vercel env and redeploy.',
    code: 'DB_NOT_CONFIGURED' as const,
    hint: 'Add DATABASE_URL in Vercel Dashboard → Settings → Environment Variables (Production, Preview, Development) and redeploy. See /tmp/vercel-env-steps.md',
    banner: 'API degraded — database not configured. App is running in preview/mock mode.',
  };
}
