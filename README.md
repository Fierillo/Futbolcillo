# Futbolcillo

![React](https://img.shields.io/badge/React-19-61dafb?style=flat&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6?style=flat&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-7.3-646cff?style=flat&logo=vite&logoColor=white)
![Nostr](https://img.shields.io/badge/Nostr-NDK-8e44ad?style=flat)
![Neon](https://img.shields.io/badge/Database-Neon-00e599?style=flat)

Futbolcillo is a turn-based football game built with `React + TypeScript + Canvas`, with simple physics, Nostr challenges, and an initial backend foundation prepared for Neon.

## Roadmap

- [x] Local training mode ready to play
- [x] Football pitch with turn-based physics
- [x] Arrow-based shot guide
- [x] First to 3 goals wins
- [x] Foul system with bonus turns and disallowed goals
- [x] Goal / foul / winner overlays
- [x] Mobile portrait layout with rotated field
- [x] Nostr login with NIP-07 and bunker
- [x] QR-based bunker / nostrconnect flow
- [x] Rival profile and avatar from Nostr
- [x] Challenges via DM with secure link
- [x] Challenge history with filters
- [x] Local persistence with Dexie
- [x] Online match server-authoritative on Vercel + Neon
- [x] Live multiplayer moved to PartyKit realtime transport
- [x] Shot submission and validation on server
- [x] Replay metadata for shot animation
- [x] Rematch request / accept / reject with improved lifecycle
- [x] Explicit match termination flow
- [x] Termination notice overlay with auto-dismiss
- [x] Schema bootstrap and consolidated endpoints (10 functions)
- [ ] Sound effects and richer match presentation
- [ ] Nostr resilience across flaky relays
- [x] Challenge status UX and cleanup flows
- [x] Session UX and bunker QR connection flow improvements
- [ ] Sync hardening for long online sessions
- [ ] Player-facing sync diagnostics
- [ ] Rate limiting and abuse controls
- [ ] Recovery panel for interrupted online sessions
- [ ] Wager / escrow in sats and server-controlled payout

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
