# Scope Merge Protocol - Setup Guide

## Prerequisites

Before using the scope merge protocol, you need to install the required dependency:

```bash
npm install @tanstack/react-query
```

## Installation

1. Install the dependency:
   ```bash
   npm install @tanstack/react-query
   ```

2. The scope merge tables will be automatically created on first request when the API is called.

3. For daily cleanup, add the following to your Vercel cron or server task:
   ```bash
   npx tsx scripts/cleanup-scope-votes.ts
   ```

## Usage

### Frontend Hook

```typescript
import { useScopeMerge } from '@/hooks/useScopeMerge';

function MyComponent() {
  const { vote, resolution, votes, isLoading, error } = useScopeMerge('scope_a', 'scope_b');
  
  // Submit a vote
  const handleVote = () => {
    vote({ vote: 'yes', voter_id: 'user-uuid' });
  };
}
```

### API Endpoints

**POST** `/api/scopes`
```json
{
  "scope_a": "Cell Biology",
  "scope_b": "Cellular Mechanisms",
  "vote": "yes",
  "voter_id": "user-uuid-here"
}
```

**GET** `/api/scopes?a=scope_a&b=scope_b`
```json
{
  "ok": true,
  "resolution": {
    "scope_a": "Cell Biology",
    "scope_b": "Cellular Mechanisms",
    "merged_into": "Cell Biology",
    "resolved_at": "2024-01-01T00:00:00Z",
    "resolution": "merged"
  },
  "votes": {
    "yes": 5,
    "no": 2
  }
}
```

## Configuration

No additional configuration is required. The system uses the existing DATABASE_URL environment variable.

## Deployment

1. Commit and push changes (done ✓)
2. Deploy to Vercel - tables auto-created
3. Test with real users

## Troubleshooting

If you get TypeScript errors about missing types:
```bash
npm install -D @types/lodash
```

For database connection issues, ensure DATABASE_URL is set in your Vercel environment.