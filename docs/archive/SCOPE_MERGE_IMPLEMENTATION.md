# Scope Merge Protocol Implementation

This document describes the scope merge protocol implementation for PhysiCoin.

## Overview

The scope merge protocol allows students to vote on whether two scope tags represent the same learning outcome. This follows Satoshi's principle of peer-to-peer resolution without administrative intervention.

## Components

### 1. Database Schema (`database/schema.physi.sql`)

Two new tables have been added:

#### physi_scope_votes
- **voter_id** (UUID): References physi_users.id
- **scope_a** (TEXT): First scope tag
- **scope_b** (TEXT): Second scope tag
- **vote_value** (SMALLINT): -1 for NO, 1 for YES
- **created_at** (TIMESTAMPTZ): Timestamp of vote

Primary key: (voter_id, scope_a, scope_b)

#### physi_scope_resolution
- **scope_a** (TEXT): First scope tag
- **scope_b** (TEXT): Second scope tag
- **merged_into** (TEXT): The merged tag name if merged, NULL if separate
- **resolved_at** (TIMESTAMPTZ): Timestamp of resolution
- **resolution** (TEXT): 'merged' or 'separate'

Primary key: (scope_a, scope_b)

### 2. Database Functions (`lib/db.ts`)

Added two functions:
- `ensureScopeVotes()`: Creates the physi_scope_votes table with indexes
- `ensureScopeResolution()`: Creates the physi_scope_resolution table

Both functions are called automatically by `ensureAllTables()` on application startup.

### 3. Frontend Hook (`hooks/useScopeMerge.ts`)

React hook with:
- `vote`: Mutation for submitting votes (yes/no)
- `resolution`: Query for fetching resolution status
- Loading and error state handling

### 4. API Route Handler (`app/api/scopes/route.ts`)

**POST /api/scopes**
- Accepts: { scope_a, scope_b, vote, voter_id }
- Validates voter_id and scope parameters
- Inserts or updates vote
- Checks quorum (8 votes, 70% agreement)
- Auto-resolves on quorum

**GET /api/scopes?a=scope_a&b=scope_b**
- Returns resolution status and vote counts
- Lists unresolved conflicts if no specific pair provided

### 5. Cleanup Script (`scripts/cleanup-scope-votes.ts`)

Daily cron job:
- Removes votes older than 7 days
- Run via: `npx tsx scripts/cleanup-scope-votes.ts`

## Usage

### Submitting a Vote

```typescript
import { useScopeMerge } from '@/hooks/useScopeMerge';

const { vote } = useScopeMerge('Cell Bio', 'Cellular Mechanisms');

// Submit a vote
vote({ vote: 'yes', voter_id: 'user-uuid-here' });
```

### Fetching Resolution

```typescript
const { resolution, votes } = useScopeMerge('Cell Bio', 'Cellular Mechanisms');
```

## Configuration

Ensure the following environment variables are set:
- `DATABASE_URL`: PostgreSQL connection string (Neon/Supabase)

## Security Notes

- Voter IDs must be valid UUID from physi_users table
- Scope pairs must be different
- 8-vote minimum with 70% agreement required for resolution

## Next Steps

1. Deploy to Vercel (tables auto-created on first request)
2. Add to cron schedule for daily cleanup
3. Integrate into roadmap UI with vote counters
4. Test with real users

## Maintenance

To manually check the database state:
```sql
SELECT * FROM physi_scope_votes ORDER BY created_at DESC LIMIT 10;
SELECT * FROM phys_scope_resolution;
```