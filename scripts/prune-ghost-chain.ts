// Ghost chain pruning — keep last 90 days per user, delete older rows
// Run via cron or manually; safe to re-run, idempotent

import { sql } from '../lib/db';

const RETENTION_DAYS = 90;

async function pruneGhostChain() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);

  if (!sql) {
    console.error('Database not configured');
    process.exit(1);
  }

  try {
    const result = await sql`
      DELETE FROM physi_ghost_chain
      WHERE created_at < ${cutoff}
    `;
    console.log(`Pruned ${result.rowCount || 0} ghost chain rows older than ${RETENTION_DAYS} days`);
    process.exit(0);
  } catch (error) {
    console.error('Prune failed:', error);
    process.exit(1);
  }
}

pruneGhostChain();
