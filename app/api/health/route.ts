import { NextResponse } from 'next/server';
import { isDbConfigured } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/health
 * Liveness + dependency check. Works without DATABASE_URL.
 * Response shape: { ok, buildId, db: isDbConfigured(), timestamp, status }
 */
export async function GET() {
  const db = isDbConfigured();
  const buildId =
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.BUILD_ID ??
    process.env.NEXT_BUILD_ID ??
    'dev';

  // Never touch `sql` here — must answer 200 even when DB is down.
  return NextResponse.json(
    {
      ok: true,
      buildId,
      db,
      status: db ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      hint: db
        ? undefined
        : 'DATABASE_URL not configured — set it in Vercel env and redeploy. See /tmp/vercel-env-steps.md',
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  );
}
