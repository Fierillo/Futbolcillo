# Futbolcillo

![React](https://img.shields.io/badge/React-19-61dafb?style=flat&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6?style=flat&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-7.3-646cff?style=flat&logo=vite&logoColor=white)
![Nostr](https://img.shields.io/badge/Nostr-NDK-8e44ad?style=flat)
![Neon](https://img.shields.io/badge/Database-Neon-00e599?style=flat)

Futbolcillo is a turn-based football game built with `React + TypeScript + Canvas`, with simple physics, Nostr challenges, and an initial backend foundation prepared for Neon.

## Roadmap

### Core Game

- [x] local training mode ready to play
- [x] football-style pitch with turn-based physics
- [x] arrow-based shot guide
- [x] first to `3` goals wins
- [x] foul system with bonus turns and disallowed goals
- [x] goal / foul / winner overlays and visual feedback
- [x] mobile portrait layout with rotated field
- [ ] sound effects and richer match presentation

### Nostr Identity

- [x] Nostr modal integrated into the game shell
- [x] login with `NIP-07`
- [x] login with bunker token
- [x] QR-based bunker / `nostrconnect` flow
- [x] automatic bunker QR connection after scan
- [x] profile fetch, cache and refresh logic
- [x] rival avatar fetch from Nostr profiles with local fallback
- [ ] extra resilience across flaky relays and signer reconnect edge cases

### Challenges

- [x] create and receive challenges through Nostr DMs
- [x] secure challenge links with token
- [x] challenge acceptance from direct link
- [x] challenge history with filters
- [x] challenge short id copy/share flow
- [x] challenge local persistence with `Dexie`
- [x] terminated matches reflected as terminated challenges in history
- [ ] richer challenge status UX and cleanup flows

### Online Matches

- [x] server-authoritative match creation on `Vercel + Neon`
- [x] match state persistence in Neon
- [x] shot submission and validation on the server
- [x] replay metadata for online shot animation
- [x] local + remote shot animation flow stabilized
- [x] rematch request / accept flow
- [x] rematch rejection flow
- [x] explicit match termination flow
- [ ] more hardening against replay / sync edge cases in long sessions
- [ ] better player-facing sync diagnostics when divergence happens

### Backend

- [x] Neon connection and schema bootstrap
- [x] auth / challenges / matches API structure
- [x] defensive state parsing and error handling in match state endpoint
- [x] rematch and terminate endpoints
- [ ] rate limiting / abuse controls
- [ ] richer server diagnostics and admin observability

### Future Scope

- [ ] real wager / escrow flow in sats
- [ ] server-controlled wallet payout flow
- [ ] recovery / continue panel for interrupted online sessions
- [ ] websocket-based realtime transport if polling becomes limiting

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
