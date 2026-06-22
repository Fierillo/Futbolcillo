# Neon Backend Setup

This project is prepared to run a Vercel backend backed by Neon/Postgres.

## Environment

Expected variable:

```env
NEON_URL="postgresql://user:password@host/dbname?sslmode=require"
```

Use `.env.example` as the local template and configure that same variable in Vercel.

## Current Backend Files

- `api/_lib/env.ts`: required environment validation
- `api/_lib/neon.ts`: shared Neon SQL client and connection helpers
- `api/health.ts`: serverless health endpoint that verifies the database connection
- `api/auth/challenge.ts`: create a signed login challenge
- `api/auth/verify.ts`: verify a signed challenge and create a backend session
- `db/schema.sql`: initial schema for sessions, challenges, matches, shots, bets, and wallet records

## Local Usage

1. Create a local `.env` with `NEON_URL`
2. Apply `db/schema.sql` to your Neon database
3. Run the project in a Vercel-compatible dev setup when you want to exercise the API routes

## Next Backend Steps

1. Add auth nonce/session routes
2. Add challenge CRUD routes
3. Add match creation and authoritative shot logging routes
4. Add escrow and payout routes
