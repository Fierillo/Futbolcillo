export type NostrConnectionMethod = 'nip07' | 'bunker';

export interface NostrFeatureCard {
  title: string;
  description: string;
}

export interface NostrSessionState {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  method: NostrConnectionMethod | null;
  pubkey: string;
  profile: {
    pubkey: string;
    name: string;
    avatarUrl: string;
  } | null;
  error: string;
}
