// Daily cleanup of old scope votes
// Removes votes older than 7 days

import { sql } from '../lib/db';

const CLEANUP_DAYS = 7;

async function cleanupScopeVotes() {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - CLEANUP_DAYS);
  
  if (!sql) {
    console.error('Database not configured');
    process.exit(1);
  }

  try {
    const result = await sql`
      DELETE FROM physi_scope_votes 
      WHERE created_at < ${cutoffDate}
    `;
    console.log(`Cleaned up ${result.rowCount || 0} old scope votes`);
    process.exit(0);
  } catch (error) {
    console.error('Cleanup failed:', error);
    process.exit(1);
  }
}

// Run cleanup
cleanupScopeVotes();