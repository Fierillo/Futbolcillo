import type { ReactNode } from 'react';
import { ChallengeProvider } from '../challenge/store';
import { MatchProvider } from '../match/store';
import { NostrSessionProvider } from '../nostr/session-store';
import { SyncStatusProvider } from '../online/sync-store';

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <SyncStatusProvider>
      <NostrSessionProvider>
        <ChallengeProvider>
          <MatchProvider>{children}</MatchProvider>
        </ChallengeProvider>
      </NostrSessionProvider>
    </SyncStatusProvider>
  );
}
