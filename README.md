# Futbolcillo

![React](https://img.shields.io/badge/React-19-61dafb?style=flat&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6?style=flat&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-7.3-646cff?style=flat&logo=vite&logoColor=white)
![Nostr](https://img.shields.io/badge/Nostr-NDK-8e44ad?style=flat)
![Neon](https://img.shields.io/badge/Database-Neon-00e599?style=flat)

Futbolcillo is a turn-based football game built with `React + TypeScript + Canvas`, with simple physics, Nostr challenges, and an initial backend foundation prepared for Neon.

## Roadmap

- [x] Modo entrenamiento local jugable
- [x] Campo de fútbol con física por turnos
- [x] Guía de tiro con flecha
- [x] Primero a 3 goles
- [x] Sistema de faltas con turnos extra y goles anulados
- [x] Overlays de gol / falta / ganador
- [x] Layout mobile portrait con campo rotado
- [x] Login Nostr con NIP-07 y bunker
- [x] QR para conexión bunker / nostrconnect
- [x] Perfil y avatar de rival desde Nostr
- [x] Desafíos vía DM con link seguro
- [x] Historial de desafíos con filtros
- [x] Persistencia local con Dexie
- [x] Match online server-authoritative en Vercel + Neon
- [x] Shot submission y validación en servidor
- [x] Replay metadata para animación de tiros
- [x] Rematch request / accept / reject
- [x] Terminación explícita de match
- [x] Schema bootstrap y endpoints consolidados (10 functions)
- [ ] Sonidos y presentación visual mejorada
- [ ] Resiliencia Nostr ante relays inestables
- [ ] UX de estados de desafío y limpieza de flujos
- [ ] Hardening de sincronización online en sesiones largas
- [ ] Diagnósticos de sync visibles para el jugador
- [ ] Rate limiting y controles de abuso
- [ ] Panel de recuperación para sesiones online interrumpidas
- [ ] Wager/escrow en sats y payout server-controlled

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
