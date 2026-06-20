import Dexie, { type Table } from 'dexie';
import type { CachedChallenge } from '../challenge/types';
import type { CachedBet, CachedMatch, SyncMeta } from '../online/types';
import type { CachedProfile } from '../profile/types';

class FutbolcilloCache extends Dexie {
  profiles!: Table<CachedProfile, string>;
  challenges!: Table<CachedChallenge, string>;
  bets!: Table<CachedBet, string>;
  matches!: Table<CachedMatch, string>;
  syncMeta!: Table<SyncMeta, string>;

  constructor() {
    super('futbolcillo-cache');

    this.version(1).stores({
      profiles: '&pubkey, updatedAt, nip05, lud16',
      challenges: '&id, rivalPubkey, state, expirationAt, updatedAt',
      bets: '&id, challengeId, rivalPubkey, state, updatedAt',
      matches: '&id, challengeId, status, updatedAt',
      syncMeta: '&key, lastSyncedAt',
    });

    this.version(2).stores({
      profiles: '&pubkey, updatedAt, nip05, lud16',
      challenges: '&id, ownerPubkey, rivalPubkey, mode, state, expirationAt, updatedAt',
      bets: '&id, challengeId, rivalPubkey, state, updatedAt',
      matches: '&id, challengeId, status, updatedAt',
      syncMeta: '&key, lastSyncedAt',
    });
  }
}

export const cacheDb = new FutbolcilloCache();
