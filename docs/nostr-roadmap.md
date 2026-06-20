# Nostr Roadmap

This roadmap breaks the agreed architecture into practical implementation phases.

## Phase 1: Frontend Foundations

Goal: prepare the current game client for Nostr-aware UI and local persistence without breaking training mode.

Deliverables:

- Keep current training mode working as default entry
- Add `QUIERO MAS` CTA in the game shell if needed/refined
- Introduce frontend domain folders for:
  - nostr
  - cache
  - online
  - profile
  - challenge
- Add Dexie and create IndexedDB scaffolding
- Add base NDK integration scaffolding
- Add global sync status store and UI placeholder
- Add types/interfaces for:
  - profiles
  - challenges
  - bets
  - resumable matches

Success criteria:

- App still builds and training mode still works
- Local stores exist and are ready for use
- Nostr/client abstractions exist behind clean interfaces

## Phase 2: Nostr Identity And Cache

Goal: connect users with Nostr and persist identity-related data locally.

Deliverables:

- `QUIERO MAS` modal
- Connect with NIP-07 and bunker paths
- Session boot flow
- Cache per pubkey
- Profile fetch + cache + refresh logic
- Global sync indicator with:
  - normal state
  - syncing state
  - error/red state
  - retry action
- Continue panel skeleton

Success criteria:

- User can connect identity
- Cached profile data appears instantly on revisit
- Relay refresh updates profile data without regressing timestamps

## Phase 3: Rival Discovery And Challenges

Goal: enable the social challenge flow without yet requiring full wager execution.

Deliverables:

- Rival picker:
  - recent rivals by latest interaction
  - manual npub/pubkey search
  - optional contacts list path
- Private challenge creation
- Challenge payload with:
  - mode
  - amount in sats
  - expiration
- Delivery through NIP-17 when possible, fallback private DM path otherwise
- Challenge persistence in Dexie
- Unified history panel with filters
- Immediate error UI when challenge delivery fails

Success criteria:

- User can send and receive friendly challenges
- Challenge history survives reloads
- Expiration is handled locally and by backend state where relevant

## Phase 4: Backend Skeleton

Goal: stand up the authoritative backend foundation on Vercel with Neon.

Deliverables:

- Route handlers by domain:
  - auth
  - challenges
  - matches
  - escrow
- Neon connection setup
- Basic schema creation plan / migrations
- Auth via signed nonce/challenge
- Basic rate limiting for challenge routes
- Operational logging for:
  - auth
  - relay sync
  - wallet
  - match lifecycle

Success criteria:

- Backend can authenticate a Nostr identity
- Backend can persist challenge records and match references

## Phase 5: Authoritative Online Match Core

Goal: make real online matches run through the server as source of truth.

Deliverables:

- WebSocket channel for online matches
- Match creation/join flow
- Authoritative match record with:
  - current state
  - shot log
- Shot submission payload and validation
- Invalid shot rejection with authoritative snapshot response
- Divergence handling:
  - warn user
  - pause match
- Resume/reconnect flow from server snapshot

Success criteria:

- Friendly online match can be played end-to-end with server authority
- Reconnect and resume are possible

## Phase 6: Escrow And Wager Flow

Goal: layer the real sats flow on top of the online match system.

Deliverables:

- Server-controlled NWC wallet integration
- Atomic wager acceptance path
- Escrow funding confirmation
- Match start gating until both sides are funded
- Bet records in backend + Dexie
- Winner payout through NWC
- Pending payout retry path

Success criteria:

- Wager can be created, funded, played, resolved, and paid out
- Failed payouts are persisted and recoverable

## Phase 7: Recovery, History, And Hardening

Goal: make the system resilient enough for repeated real use.

Deliverables:

- Continue panel for pending matches/challenges
- Recovery after browser close during wager
- Richer history filters
- Better error states for relays and wallet flows
- Abuse controls refinement
- Additional audit views/log review support

Success criteria:

- User can reliably recover ongoing flows after reload or reconnect
- History and status are understandable from the UI

## Suggested Immediate Start

Start with:

1. Phase 1 frontend foundations
2. the minimal pieces of Phase 2 needed to show the Nostr modal and global sync state

That gives the codebase the right structure before touching online gameplay or escrow.
