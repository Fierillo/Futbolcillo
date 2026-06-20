# Nostr V1 Notes

This document captures the current product and architecture decisions for adding Nostr to Futbolcillo.

## Product Scope

- Goal: login, profile, challenges, result sharing hooks, and zaps/bets
- First visible version: minimal but real user-facing feature set
- Unauthenticated users: can play only against the machine in training mode
- Authenticated users: can play online friendlies or wagered matches
- No automatic result posting at the end of a match

## Login And UX

- Game opens directly on the pitch in training mode
- A prominent `QUIERO MAS` button opens the Nostr modal
- The first level of that modal should show functions first rather than login first
- Nostr connection methods must support NIP-07 and bunker at the same level
- Rival selection supports both manual `npub/pubkey` input and contacts list
- Rival picker should prioritize recent rivals plus manual search/input
- Online flow should feel unified rather than split into separate entry screens

## Scoreboard Identity

- Replace `Local` and `Visitante` with real player identity when authenticated
- Display:
  - avatar
  - display name
  - abbreviated pubkey

## Nostr Data Strategy

- Relays are not trusted as durable storage
- App needs a local cache layer for fast reads and resilience
- Read strategy:
  - show cached data first
  - then sync against relays in background
- Sync state UI:
  - use a global status dot
  - show subtle error when relay refresh fails
  - show red state plus retry button on failure
- Conflict resolution: latest valid timestamp wins
- No expiration policy in V1
- Cache must be separated by authenticated pubkey

## Local Persistence

- Runtime cache: memory
- Durable cache: IndexedDB
- Persist the full lifecycle of challenges
- Persist full payment/bet state and amounts
- Persist profiles, payment history, and challenge history
- Challenge cache record should include at least:
  - state
  - rival
  - amount
  - expiration
- Bet/payment cache should be modeled primarily as one record per bet
- Profile cache should focus on scoreboard-relevant fields:
  - avatar
  - nip05
  - lud16
  - pubkey

## Challenges

- Match identity should be anchored to the Nostr event id
- Challenge delivery: private message with a clear CTA to send it to a rival
- Challenge payload includes:
  - mode
  - amount in sats when applicable
  - expiration
- Challenge expiration: automatic if the rival does not respond in time
- Friendly matches and wagered matches both exist
- Private messaging target:
  - prefer NIP-17 when viable
  - fallback to NIP-04 / NIP-44 pragmatically

## Wagers And Escrow

- Bets are real, not simulated
- Game wallet acts as escrow
- Escrow funding uses Nostr Wallet Connect
- Winner payout also uses Nostr Wallet Connect
- NWC is for the game server wallet path, not necessarily a required client-side wallet connection for every user
- Development path should start with a single server-controlled NWC wallet
- Accepting a wagered challenge must be atomic with accepting the payment obligation
- A wagered match should not start until escrow funding is confirmed
- If payout fails, mark it pending and support controlled retries

## Match Authority

- Final architecture includes a central backend in Node/TypeScript running on Vercel
- Backend session should be established through a signed challenge/nonce flow
- The server always hosts the authoritative match
- The server receives move logs and determines the winner from event evidence
- There is no manual dispute flow in V1
- Server is the source of truth for outcome resolution
- Server validates each shot against prior state, identity/signature, and game rules
- If local client state diverges from the server result, the match should warn and pause
- Invalid or out-of-turn shots must be rejected and answered with the authoritative snapshot

## Match Logging

- Store each shot as the unit of authoritative gameplay logging
- Persist authoritative matches as current state plus shot log
- Each shot record should include at least:
  - selected player
  - vector / force
  - timestamp
  - outcome of the turn

## Relay Strategy

- Use a mixed relay strategy:
  - server-provided initial relay list for the game
  - user relay set where helpful
- users should be able to add personal relays derived from their own profile/preferences
- If a relay returns older profile data than cache, ignore it based on timestamp

## Recovery UX

- Recent rivals should be ordered by latest interaction
- Returning users should see a clear continue panel for pending matches and challenges recovered from cache
- If connection drops during an online match, pause and retry from the server snapshot
- If the browser closes during a wagered match, recover the flow on return

## History UX

- Challenges and wagers should live in one unified panel with filters

## Backend API Direction

- First backend scope should cover:
  - auth bridge / identity support
  - challenges
  - matches
  - escrow
- Backend API style should stay close to simple route handlers

## Backend Storage And Ops

- Primary backend database target: Neon / Postgres
- Operational logs should include:
  - auth
  - relays
  - wallet
  - matches
- Private challenges should have basic rate limiting against abuse
- If a challenge cannot be delivered through relays, surface an immediate error

## Implementation Choices

- IndexedDB layer: Dexie
- Frontend Nostr client: NDK
- Online match realtime transport: WebSocket
- Delivery approach: build in phases

## Pending Decisions

- Exact DM/event format for game-specific private messages
- Exact schema for IndexedDB tables/stores
- Exact escrow wallet/provider implementation
- Server protocol for authoritative shot submission and verification
- Matchmaking/contact discovery UI details inside the modal

## Delivery Priority

- First implementation target: a complete vertical slice with core systems in place even if the initial UI is still rough
