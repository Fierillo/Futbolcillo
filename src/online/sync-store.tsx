import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { SyncStatusState } from './types';

interface SyncStatusContextValue {
  syncState: SyncStatusState;
  setSyncState: (next: SyncStatusState) => void;
}

const defaultSyncState: SyncStatusState = {
  status: 'booting',
  label: 'Preparando',
  detail: 'Inicializando caché local y base Nostr.',
};

const SyncStatusContext = createContext<SyncStatusContextValue | null>(null);

export function SyncStatusProvider({ children }: { children: ReactNode }) {
  const [syncState, setSyncState] = useState<SyncStatusState>(defaultSyncState);

  const value = useMemo(() => ({ syncState, setSyncState }), [syncState]);

  return <SyncStatusContext.Provider value={value}>{children}</SyncStatusContext.Provider>;
}

export function useSyncStatus() {
  const context = useContext(SyncStatusContext);
  if (!context) {
    throw new Error('useSyncStatus must be used within SyncStatusProvider');
  }

  return context;
}
