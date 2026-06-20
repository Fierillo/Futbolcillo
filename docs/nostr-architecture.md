# Nostr Technical Architecture

This document translates the current product decisions into a technical architecture for Futbolcillo.

## Goals

- Keep local training mode available without authentication
- Add authenticated online identity through Nostr
- Support friendlies and wagered matches
- Use local cache for fast UX and relay resilience
- Use a central authoritative backend for real matches and escrow resolution

## High-Level Architecture

### Frontend

- React application
- Existing local training game remains playable without login
- New Nostr layer adds:
  - login/connect modal opened from `QUIERO MAS`
  - profile-aware scoreboard
  - challenge flow
  - history panel
  - sync status indicator
  - continue panel for pending matches/challenges

### Local Data Layer

- Memory cache for active runtime state
- IndexedDB for durable local persistence
- Cache is isolated per authenticated pubkey
- Read model:
  - load cached data immediately
  - refresh in background from relays/backend
  - keep newest timestamped data

### Nostr Layer

- Identity/auth via NIP-07 and bunker
- Private challenge delivery prefers NIP-17 when possible
- Fallback DM path: NIP-04 / NIP-44 pragmatically
- Relay strategy:
  - server-provided initial relay list
  - user relays merged in where useful

### Backend Layer

- Node/TypeScript
- Hosted on Vercel
- Neon/Postgres for storage
- Backend acts as authoritative host for online matches
- Backend also coordinates:
  - auth challenge flow
  - challenge lifecycle
  - match state
  - escrow lifecycle
  - payout retry handling

### Wallet Layer

- One server-controlled NWC wallet in V1
- Receives wager escrow
- Pays winners through NWC
- Failed payouts remain pending and retryable

## User Modes

### Training Mode

- No login required
- Play against machine / local practice
- No Nostr or escrow dependency

### Online Friendly

- Requires Nostr login
- No wager
- Challenge sent privately to rival
- Match starts after acceptance

### Online Wager

- Requires Nostr login
- Challenge includes amount in sats and expiration
- Accepting challenge is atomic with accepting the wager
- Match starts only after escrow funding is confirmed

## Frontend Modules

### Game Shell

- Shows training mode by default
- Contains `QUIERO MAS` CTA
- Hosts global sync state indicator

### Nostr Modal

- First level shows functions first
- Login/connect entry is part of that flow
- Features exposed:
  - connect identity
  - choose friendly or wager flow
  - choose rival
  - review history

### Rival Picker

- Recent rivals ordered by latest interaction
- Manual `npub/pubkey` search/input
- Optional contact list integration

### Scoreboard Identity Module

- For authenticated/online matches show:
  - avatar
  - display name when available
  - abbreviated pubkey
- Prefer cached profile first, then relay refresh
- Ignore older relay responses by timestamp

### Challenge Panel

- Create challenge
- Send private challenge to rival
- Track states:
  - created
  - sent
  - received
  - accepted
  - rejected
  - expired
  - cancelled
  - finalized

### Unified History Panel

- One panel with filters for:
  - friendlies
  - wagers
  - sent
  - received
  - completed
  - pending

### Continue Panel

- Appears when cached/backend state shows pending challenges or resumable matches
- Especially important for wager recovery after reload/close

## Frontend Data Stores

### Runtime Memory Stores

- `sessionStore`
- `profileStore`
- `challengeStore`
- `betStore`
- `matchStore`
- `syncStore`

### IndexedDB Stores

- `profiles`
  - keyed by pubkey
  - fields: avatar, nip05, lud16, pubkey, updatedAt
- `challenges`
  - keyed by challenge event id / match identity anchor
  - fields: state, rival, amount, expiration, timestamps, mode
- `bets`
  - one record per bet
  - fields: amount, rival, state, escrow references, payout state, timestamps
- `matches`
  - resumable online match references and latest snapshots
- `sync_meta`
  - relay sync timestamps and status markers per pubkey

## Auth Flow

1. User opens `QUIERO MAS`
2. User chooses a feature requiring Nostr
3. Client connects with NIP-07 or bunker
4. Backend sends nonce/challenge
5. Client signs challenge with Nostr identity
6. Backend verifies signature and opens session

## Challenge Flow

1. User selects rival
2. User chooses mode
3. For wagered mode, user sets amount in sats and expiration
4. Client creates challenge payload
5. Client/backend sends private message to rival
6. If relay delivery fails, show immediate error
7. If rival does not answer in time, challenge expires automatically

## Wager Flow

1. Wager challenge is received
2. Rival accepts challenge and wager atomically
3. Escrow funding is requested through server NWC path
4. Backend confirms both sides are funded
5. Match may start only after escrow confirmation
6. Backend hosts authoritative match
7. Winner is determined from shot/event evidence
8. Server pays winner through NWC
9. If payout fails, mark pending and allow retry

## Authoritative Match Model

### Source Of Truth

- Backend is authoritative for online matches
- Clients may simulate locally for responsiveness, but server decides

### Shot Submission

Each shot should include at least:

- match id anchored to the Nostr event id
- acting player pubkey/session identity
- selected piece/player
- vector / force
- client timestamp
- signature / auth context

### Validation

Server validates against:

- authenticated identity
- current authoritative state
- turn ownership
- game rules
- payload integrity

If invalid:

- reject shot
- return authoritative snapshot
- log incident

If client diverges from server result:

- warn user
- pause match

## Match Persistence

For each online match persist:

- current authoritative state
- full shot log
- challenge linkage
- wager linkage if applicable
- player identities
- lifecycle status

## Backend Data Model Direction

### Core Entities

- `users`
- `sessions`
- `relay_preferences`
- `challenges`
- `matches`
- `match_shots`
- `bets`
- `wallet_transactions`
- `payout_attempts`
- `audit_logs`

## Sync UX

- One global status indicator for relay/cache sync
- Normal state when sync is healthy
- Red/error state when refresh fails
- Retry action available
- Cached data remains visible while retrying

## Rate Limiting And Abuse

- Basic rate limiting on private challenge sends
- Abuse controls should begin at backend challenge endpoints

## Operational Logging

Log at least:

- auth events
- relay sync events
- wallet / escrow events
- match lifecycle events
- invalid shot attempts
- payout failures and retries

## Open Areas

- Exact React state/store library choice
- Exact IndexedDB wrapper choice
- Exact Nostr client library stack
- Exact backend route structure
- Detailed Postgres schema
- AI/machine opponent implementation for training mode
