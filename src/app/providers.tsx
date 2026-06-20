import type { ReactNode } from 'react';
import { ChallengeProvider } from '../challenge/store';
import { NostrSessionProvider } from '../nostr/session-store';
import { SyncStatusProvider } from '../online/sync-store';

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <SyncStatusProvider>
      <NostrSessionProvider>
        <ChallengeProvider>{children}</ChallengeProvider>
      </NostrSessionProvider>
    </SyncStatusProvider>
  );
}
