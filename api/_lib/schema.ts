import { query } from './neon.js';

let schemaReadyPromise: Promise<void> | null = null;

export function ensureSchema() {
  if (schemaReadyPromise) return schemaReadyPromise;

  schemaReadyPromise = (async () => {
    await query`create table if not exists challenges (id text primary key, access_token text not null unique, owner_pubkey text not null, rival_pubkey text not null, mode text not null, state text not null, amount_sats integer not null default 0, expires_at timestamptz not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now())`;
    await query`create table if not exists matches (id text primary key, challenge_id text not null, mode text not null, status text not null, home_pubkey text not null, away_pubkey text not null, home_name text, away_name text, current_state jsonb not null default '{}'::jsonb, rematch_requested_by text, rematch_requested_at timestamptz, rematch_match_id text, created_at timestamptz not null default now(), updated_at timestamptz not null default now())`;
    await query`alter table matches add column if not exists rematch_requested_by text`;
    await query`alter table matches add column if not exists rematch_requested_at timestamptz`;
    await query`alter table matches add column if not exists rematch_match_id text`;
    await query`alter table matches add column if not exists rematch_rejected_by text`;
    await query`alter table matches add column if not exists terminated_by text`;
    await query`alter table matches add column if not exists home_name text`;
    await query`alter table matches add column if not exists away_name text`;
    await query`alter table challenges add column if not exists winner_pubkey text`;
    await query`alter table challenges add column if not exists score_home integer`;
    await query`alter table challenges add column if not exists score_away integer`;
    await query`create index if not exists challenges_owner_pubkey_idx on challenges(owner_pubkey)`;
    await query`create index if not exists challenges_rival_pubkey_idx on challenges(rival_pubkey)`;
    await query`create index if not exists matches_challenge_id_idx on matches(challenge_id)`;
  })();

  return schemaReadyPromise;
}
