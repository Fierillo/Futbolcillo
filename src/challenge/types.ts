export type ChallengeMode = 'friendly' | 'wager';

export type ChallengeState =
  | 'created'
  | 'sent'
  | 'received'
  | 'accepted'
  | 'rejected'
  | 'expired'
  | 'cancelled'
  | 'finalized';

export interface CachedChallenge {
  id: string;
  accessToken: string;
  ownerPubkey: string;
  mode: ChallengeMode;
  state: ChallengeState;
  rivalPubkey: string;
  rivalName: string;
  amountSats: number;
  expirationAt: number;
  createdAt: number;
  updatedAt: number;
}

export type ChallengeFilter = 'all' | 'friendly' | 'wager' | 'pending' | 'finished';
