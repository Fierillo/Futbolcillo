import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import NDK, { NDKNip07Signer, NDKNip46Signer } from '@nostr-dev-kit/ndk';
import { cacheDb } from '../cache/db';
import { getNostrClient, getRelayList } from './client';
import type { CachedProfile, ScoreboardIdentity } from '../profile/types';
import type { NostrConnectionMethod, NostrSessionState } from './types';

interface NostrSessionContextValue {
  session: NostrSessionState;
  connectNip07: () => Promise<void>;
  connectBunker: (token: string) => Promise<void>;
  disconnect: () => void;
  refreshProfile: () => Promise<void>;
}

const STORAGE_KEY = 'futbolcillo.nostr-session';

const defaultSession: NostrSessionState = {
  status: 'disconnected',
  method: null,
  pubkey: '',
  profile: null,
  error: '',
};

const NostrSessionContext = createContext<NostrSessionContextValue | null>(null);

function shortPubkey(pubkey: string) {
  return `${pubkey.slice(0, 8)}...${pubkey.slice(-6)}`;
}

function fallbackAvatar(pubkey: string) {
  return `https://api.dicebear.com/9.x/shapes/svg?seed=${pubkey}`;
}

function toCachedProfile(pubkey: string, profile?: Partial<CachedProfile>): CachedProfile {
  const label = profile?.displayName || profile?.nip05 || shortPubkey(pubkey);

  return {
    pubkey,
    avatarUrl: profile?.avatarUrl || fallbackAvatar(pubkey),
    displayName: label,
    nip05: profile?.nip05 || '',
    lud16: profile?.lud16 || '',
    updatedAt: profile?.updatedAt || Date.now(),
  };
}

function toIdentity(profile: CachedProfile): ScoreboardIdentity {
  return {
    pubkey: profile.pubkey,
    name: profile.displayName,
    avatarUrl: profile.avatarUrl,
  };
}

async function fetchRemoteProfile(pubkey: string, ndk: NDK) {
  await ndk.connect(1500);
  const user = ndk.getUser({ pubkey });
  const remoteProfile = await user.fetchProfile();

  return toCachedProfile(pubkey, {
    avatarUrl: remoteProfile?.image || remoteProfile?.picture || '',
    displayName: remoteProfile?.displayName || remoteProfile?.name || '',
    nip05: remoteProfile?.nip05 || '',
    lud16: remoteProfile?.lud16 || '',
    updatedAt: Date.now(),
  });
}

async function resolveProfile(pubkey: string, ndk: NDK) {
  const cached = await cacheDb.profiles.get(pubkey);

  try {
    const remote = await fetchRemoteProfile(pubkey, ndk);
    await cacheDb.profiles.put(remote);
    return remote;
  } catch {
    if (cached) return cached;

    const fallback = toCachedProfile(pubkey);
    await cacheDb.profiles.put(fallback);
    return fallback;
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return await Promise.race<T>([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error('Timed out while connecting to signer')), timeoutMs);
    }),
  ]);
}

export function NostrSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<NostrSessionState>(defaultSession);

  const setConnectedSession = useCallback(async (pubkey: string, method: NostrConnectionMethod, ndk: NDK) => {
    const profile = await resolveProfile(pubkey, ndk);

    const nextSession: NostrSessionState = {
      status: 'connected',
      method,
      pubkey,
      profile: toIdentity(profile),
      error: '',
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify({ pubkey, method }));
    setSession(nextSession);
  }, []);

  useEffect(() => {
    const restore = async () => {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;

      try {
        const parsed = JSON.parse(raw) as { pubkey: string; method: NostrConnectionMethod };
        if (!parsed.pubkey || !parsed.method) return;

        const ndk = getNostrClient();
        const profile = await resolveProfile(parsed.pubkey, ndk);

        setSession({
          status: 'connected',
          method: parsed.method,
          pubkey: parsed.pubkey,
          profile: toIdentity(profile),
          error: '',
        });
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    };

    void restore();
  }, []);

  const connectNip07 = useCallback(async () => {
    setSession((prev) => ({ ...prev, status: 'connecting', method: 'nip07', error: '' }));

    try {
      const ndk = getNostrClient();
      const signer = new NDKNip07Signer();
      ndk.signer = signer;
      const user = await signer.user();
      await setConnectedSession(user.pubkey, 'nip07', ndk);
    } catch (error) {
      setSession({
        status: 'error',
        method: 'nip07',
        pubkey: '',
        profile: null,
        error: error instanceof Error ? error.message : 'No se pudo conectar con NIP-07.',
      });
    }
  }, [setConnectedSession]);

  const connectBunker = useCallback(async (token: string) => {
    setSession((prev) => ({ ...prev, status: 'connecting', method: 'bunker', error: '' }));

    try {
      const ndk = getNostrClient();
      const signer = NDKNip46Signer.bunker(ndk, token);
      ndk.signer = signer;
      const user = await withTimeout(signer.user(), 12000);
      await setConnectedSession(user.pubkey, 'bunker', ndk);
    } catch (error) {
      setSession({
        status: 'error',
        method: 'bunker',
        pubkey: '',
        profile: null,
        error: error instanceof Error ? error.message : 'No se pudo conectar con bunker.',
      });
    }
  }, [setConnectedSession]);

  const disconnect = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setSession(defaultSession);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!session.pubkey) return;

    try {
      const profile = await resolveProfile(session.pubkey, getNostrClient());
      setSession((prev) => ({ ...prev, profile: toIdentity(profile), error: '' }));
    } catch (error) {
      setSession((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : 'No se pudo refrescar el perfil.',
      }));
    }
  }, [session.pubkey]);

  const value = useMemo(
    () => ({ session, connectNip07, connectBunker, disconnect, refreshProfile }),
    [session, connectNip07, connectBunker, disconnect, refreshProfile]
  );

  return <NostrSessionContext.Provider value={value}>{children}</NostrSessionContext.Provider>;
}

export function useNostrSession() {
  const context = useContext(NostrSessionContext);
  if (!context) {
    throw new Error('useNostrSession must be used within NostrSessionProvider');
  }

  return context;
}
