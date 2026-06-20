export type BetState =
  | 'draft'
  | 'pending_funding'
  | 'funded'
  | 'in_match'
  | 'won'
  | 'lost'
  | 'payout_pending'
  | 'paid'
  | 'cancelled';

export type SyncStatus = 'booting' | 'syncing' | 'ready' | 'error';

export interface CachedBet {
  id: string;
  challengeId: string;
  rivalPubkey: string;
  amountSats: number;
  state: BetState;
  payoutReference: string;
  createdAt: number;
  updatedAt: number;
}

export interface CachedMatch {
  id: string;
  challengeId: string;
  mode: 'training' | 'friendly' | 'wager';
  status: 'pending' | 'active' | 'paused' | 'finished';
  homePubkey: string;
  awayPubkey: string;
  lastSnapshot: string;
  updatedAt: number;
}

export interface SyncMeta {
  key: string;
  lastSyncedAt: number;
  relayHint: string;
}

export interface SyncStatusState {
  status: SyncStatus;
  label: string;
  detail: string;
}
