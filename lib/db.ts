import { neon } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.warn('DATABASE_URL is not set. Neon queries will fail until you add it.');
}

export const sql = databaseUrl ? neon(databaseUrl) : null;
