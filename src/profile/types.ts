export interface CachedProfile {
  pubkey: string;
  avatarUrl: string;
  displayName: string;
  contactAlias?: string;
  nip05: string;
  lud16: string;
  updatedAt: number;
}

export interface ScoreboardIdentity {
  pubkey: string;
  name: string;
  avatarUrl: string;
}
