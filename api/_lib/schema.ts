import { query } from './neon';

let schemaReadyPromise: Promise<void> | null = null;

export function ensureSchema() {
  if (schemaReadyPromise) return schemaReadyPromise;

  schemaReadyPromise = (async () => {
    await query`create table if not exists users (pubkey text primary key, created_at timestamptz not null default now(), updated_at timestamptz not null default now())`;
    await query`create table if not exists sessions (id text primary key, pubkey text not null, challenge text not null, created_at timestamptz not null default now(), expires_at timestamptz not null)`;
    await query`create table if not exists auth_nonces (id text primary key, pubkey text not null, challenge text not null, created_at timestamptz not null default now(), expires_at timestamptz not null, consumed_at timestamptz)`;
    await query`create table if not exists challenges (id text primary key, access_token text not null unique, owner_pubkey text not null, rival_pubkey text not null, mode text not null, state text not null, amount_sats integer not null default 0, expires_at timestamptz not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now())`;
    await query`create table if not exists matches (id text primary key, challenge_id text not null, mode text not null, status text not null, home_pubkey text not null, away_pubkey text not null, current_state jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now())`;
    await query`create table if not exists match_shots (id bigserial primary key, match_id text not null, acting_pubkey text not null, payload jsonb not null, created_at timestamptz not null default now())`;
    await query`create table if not exists bets (id text primary key, challenge_id text not null, amount_sats integer not null, state text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now())`;
    await query`create table if not exists wallet_transactions (id text primary key, bet_id text, direction text not null, state text not null, amount_sats integer not null, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now())`;
    await query`create index if not exists challenges_owner_pubkey_idx on challenges(owner_pubkey)`;
    await query`create index if not exists challenges_rival_pubkey_idx on challenges(rival_pubkey)`;
    await query`create index if not exists matches_challenge_id_idx on matches(challenge_id)`;
    await query`create index if not exists match_shots_match_id_idx on match_shots(match_id)`;
    await query`create index if not exists bets_challenge_id_idx on bets(challenge_id)`;
    await query`create index if not exists auth_nonces_pubkey_idx on auth_nonces(pubkey)`;
  })();

  return schemaReadyPromise;
}
