import { useEffect } from 'react';
import { cacheDb } from '../cache/db';
import { getNostrClient } from '../nostr/client';
import { useSyncStatus } from '../online/sync-store';
import type { SyncStatusState } from '../online/types';

export async function preparePhaseOneInfrastructure(): Promise<SyncStatusState> {
  await cacheDb.open();
  getNostrClient();

  return {
    status: 'ready',
    label: 'Entrenamiento',
    detail: 'Caché lista. Nostr listo para la siguiente fase.',
  };
}

export function usePhaseOneBoot() {
  const { setSyncState } = useSyncStatus();

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      setSyncState({
        status: 'syncing',
        label: 'Caché local',
        detail: 'Preparando almacenamiento y capa Nostr.',
      });

      try {
        const nextState = await preparePhaseOneInfrastructure();

        if (cancelled) return;

        setSyncState(nextState);
      } catch {
        if (cancelled) return;

        setSyncState({
          status: 'error',
          label: 'Caché local',
          detail: 'No se pudo preparar la infraestructura Nostr local.',
        });
      }
    };

    void boot();

    return () => {
      cancelled = true;
    };
  }, [setSyncState]);
}
