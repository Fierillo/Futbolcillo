# Futbolcillo

![React](https://img.shields.io/badge/React-19-61dafb?style=flat&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6?style=flat&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-7.3-646cff?style=flat&logo=vite&logoColor=white)
![Nostr](https://img.shields.io/badge/Nostr-NDK-8e44ad?style=flat)
![Neon](https://img.shields.io/badge/Database-Neon-00e599?style=flat)

Futbolcillo is a turn-based football game built with `React + TypeScript + Canvas`, with simple physics, Nostr challenges, and an initial backend foundation prepared for Neon.

## Current Status

- local training mode ready to play
- football-style pitch with turn-based physics
- arrow-based shot guide
- foul system under active iteration
- Nostr login with `NIP-07` and bunker groundwork
- challenge delivery through Nostr DMs
- local cache with `Dexie`
- initial backend scaffold prepared for `Vercel + Neon`

## How to Play

1. Click one of your players.
2. Hold click and drag to aim.
3. Release to shoot.
4. Score by getting the ball into the opponent's goal.

## Current Rules

- first to `3` goals wins
- if a shot commits a foul, the opponent gets two turns
- if a foul happened during the play, any goal in that same sequence is disallowed

## Development

### Install Dependencies

```bash
npm install
```

o

```bash
pnpm install
```

### Run Frontend

```bash
npm run dev
```

o

```bash
pnpm dev
```

### Build

```bash
npm run build
```

## Nostr

The project already includes:

- Nostr session support with `NDK`
- locally cached profiles
- rival search by alias, `nip05`, `npub`, or `pubkey`
- suggestions prioritized from `following`
- challenges sent through DM with secure links

## Neon / Backend

The backend foundation is already prepared to run on `Vercel` with `Neon`.

Expected environment variable:

```env
NEON_URL="postgresql://user:password@host/dbname?sslmode=require"
```

Related documentation:

- `docs/neon-backend-setup.md`
- `docs/nostr-architecture.md`
- `docs/nostr-roadmap.md`

## Useful Structure

- `src/game/` game logic and canvas rendering
- `src/nostr/` session, modal, and Nostr client
- `src/challenge/` challenges, history, and rival search
- `src/cache/` IndexedDB / Dexie
- `api/` initial serverless backend
- `db/schema.sql` initial schema for Neon

## License

ISC
