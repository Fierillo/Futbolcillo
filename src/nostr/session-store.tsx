import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import NDK, { NDKNip07Signer, NDKNip46Signer, type NDKSigner } from '@nostr-dev-kit/ndk';
import { cacheDb } from '../cache/db';
import { getNostrClient } from './client';
import { Nip46NdkSigner } from './nip46-ndk-signer';
import type { PendingNostrConnectSession } from './nip46-client';
import type { CachedProfile, ScoreboardIdentity } from '../profile/types';
import type { NostrConnectionMethod, NostrSessionState } from './types';

interface NostrSessionContextValue {
  session: NostrSessionState;
  connectNip07: () => Promise<void>;
  connectBunker: (token: string) => Promise<void>;
  startBunkerQr: () => Promise<{ uri: string; relay: string }>;
  cancelBunkerQr: () => void;
  finishBunkerQr: () => Promise<void>;
  disconnect: () => void;
  refreshProfile: () => Promise<void>;
}

const STORAGE_KEY = 'futbolcillo.nostr-session';
const PENDING_BUNKER_QR_KEY = 'futbolcillo.pending-bunker-qr';
const NOSTR_CONNECT_RELAYS = [
  'wss://relay.nsec.app',
  'wss://relay.damus.io',
  'wss://relay.snort.social',
];
const BUNKER_CONNECT_TIMEOUT_MS = 120_000;

function logBunkerQr(step: string, details?: Record<string, unknown>) {
  console.info('[nostr-bunker-qr]', step, details ?? {});
}

type PersistedPendingBunkerQr = {
  uri: string;
  relay: string;
  clientSecret: number[];
  secret: string;
  relays: string[];
  createdAt: number;
};

function savePendingBunkerQr(pending: PendingNostrConnectSession) {
  const payload: PersistedPendingBunkerQr = {
    uri: pending.uri,
    relay: pending.relay,
    clientSecret: Array.from(pending.clientSecret),
    secret: pending.secret,
    relays: pending.relays,
    createdAt: Date.now(),
  };
  localStorage.setItem(PENDING_BUNKER_QR_KEY, JSON.stringify(payload));
}

function clearPendingBunkerQr() {
  localStorage.removeItem(PENDING_BUNKER_QR_KEY);
}

function loadPendingBunkerQr(): PendingNostrConnectSession | null {
  const raw = localStorage.getItem(PENDING_BUNKER_QR_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as PersistedPendingBunkerQr;
    if (!parsed.uri || !parsed.secret || !parsed.relays?.length || !parsed.clientSecret?.length) {
      clearPendingBunkerQr();
      return null;
    }
    if (Date.now() - parsed.createdAt > 5 * 60 * 1000) {
      clearPendingBunkerQr();
      return null;
    }

    return {
      uri: parsed.uri,
      relay: parsed.relay,
      clientSecret: Uint8Array.from(parsed.clientSecret),
      secret: parsed.secret,
      relays: parsed.relays,
    };
  } catch {
    clearPendingBunkerQr();
    return null;
  }
}

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
      window.setTimeout(() => reject(new Error(`Timed out while connecting to signer after ${timeoutMs}ms`)), timeoutMs);
    }),
  ]);
}

async function waitForNostrSigner(timeoutMs = 3000) {
  if (typeof window === 'undefined') return false;
  if (window.nostr && typeof window.nostr.signEvent === 'function') return true;

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (window.nostr && typeof window.nostr.signEvent === 'function') return true;
    await new Promise((resolve) => window.setTimeout(resolve, 100));
  }

  return false;
}

export function NostrSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<NostrSessionState>(defaultSession);
  const [pendingBunkerAbortController, setPendingBunkerAbortController] = useState<AbortController | null>(null);

  const setConnectedSession = useCallback(async (pubkey: string, method: NostrConnectionMethod, ndk: NDK, signerPayload?: string, signerKind?: string) => {
    const profile = await resolveProfile(pubkey, ndk);

    const nextSession: NostrSessionState = {
      status: 'connected',
      method,
      pubkey,
      profile: toIdentity(profile),
      error: '',
    };

    const persistedSession = signerPayload
      ? { pubkey, method, signerPayload, signerKind }
      : { pubkey, method };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(persistedSession));
    setSession(nextSession);
  }, []);

  const reattachSigner = useCallback(async (method: NostrConnectionMethod) => {
    const ndk = getNostrClient();

    if (method === 'nip07') {
      if (ndk.signer) return true;
      const ok = await waitForNostrSigner(3000);
      if (!ok || typeof window === 'undefined' || !window.nostr) return false;
      ndk.signer = new NDKNip07Signer();
      return true;
    }

    if (method === 'bunker') {
      if (ndk.signer) return true;
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      try {
        const parsed = JSON.parse(raw) as { pubkey: string; method: NostrConnectionMethod; signerPayload?: string; signerKind?: string; bunkerToken?: string };
        let signer: NDKSigner;

        if (parsed.signerKind === 'nostr-tools-nip46' && parsed.signerPayload) {
          signer = await Nip46NdkSigner.fromPayload(parsed.signerPayload, ndk);
        } else if (parsed.signerPayload) {
          signer = await NDKNip46Signer.fromPayload(parsed.signerPayload, ndk);
        } else if (parsed.bunkerToken) {
          signer = NDKNip46Signer.bunker(ndk, parsed.bunkerToken);
        } else {
          return false;
        }

        ndk.signer = signer;
        return true;
      } catch {
        return false;
      }
    }

    return false;
  }, []);

  useEffect(() => {
    const restore = async () => {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;

      try {
        const parsed = JSON.parse(raw) as { pubkey: string; method: NostrConnectionMethod; bunkerToken?: string; signerKind?: string; signerPayload?: string };
        if (!parsed.pubkey || !parsed.method) return;

        const ndk = getNostrClient();
        const signerReady = await reattachSigner(parsed.method);
        const profile = await resolveProfile(parsed.pubkey, ndk);

        setSession({
          status: signerReady ? 'connected' : 'error',
          method: parsed.method,
          pubkey: parsed.pubkey,
          profile: toIdentity(profile),
          error: signerReady ? '' : 'No se pudo reconectar el signer. Volvé a conectar.',
        });
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    };

    void restore();
  }, [reattachSigner]);

  useEffect(() => {
    const onVisibilityChange = async () => {
      if (document.visibilityState !== 'visible') return;
      if (session.status !== 'connected' || !session.method) return;

      const ndk = getNostrClient();
      if (ndk.signer) return;

      const ok = await reattachSigner(session.method);
      if (!ok) {
        setSession((prev) => ({
          ...prev,
          status: 'error',
          error: 'Se perdió la conexión con el signer. Volvé a conectar.',
        }));
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [session.status, session.method, reattachSigner]);

  const connectNip07 = useCallback(async () => {
    setSession((prev) => ({ ...prev, status: 'connecting', method: 'nip07', error: '' }));

    try {
      const ndk = getNostrClient();
      const ok = await waitForNostrSigner(3000);
      if (!ok) {
        throw new Error('No se detectó una extensión Nostr compatible.');
      }

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
      await ndk.connect(3000);
      const signer = NDKNip46Signer.bunker(ndk, token);
      ndk.signer = signer;
      const user = await withTimeout(signer.user(), BUNKER_CONNECT_TIMEOUT_MS);
      const signerPayload = signer.toPayload();
      await setConnectedSession(user.pubkey, 'bunker', ndk, signerPayload);
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

  const waitForPendingBunkerQr = useCallback(async (pending: PendingNostrConnectSession, abortController: AbortController) => {
    try {
      logBunkerQr('waiting-for-remote-signer');
      const ndk = getNostrClient();
      const signer = await Nip46NdkSigner.fromPending(ndk, pending, 300000, abortController.signal, logBunkerQr);
      ndk.signer = signer;
      const user = await withTimeout(signer.user(), 15000);
      logBunkerQr('remote-signer-ready', { pubkey: user.pubkey });
      await setConnectedSession(user.pubkey, 'bunker', ndk, signer.toPayload(), 'nostr-tools-nip46');
      clearPendingBunkerQr();
      setPendingBunkerAbortController(null);
      logBunkerQr('session-connected', { pubkey: user.pubkey });
    } catch (error) {
      if (abortController.signal.aborted) {
        logBunkerQr('connection-cancelled');
        return;
      }

      logBunkerQr('connection-failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      clearPendingBunkerQr();
      setSession((prev) => ({
        ...prev,
        status: 'error',
        method: 'bunker',
        error: error instanceof Error ? error.message : 'No se pudo conectar con QR.',
      }));
      setPendingBunkerAbortController(null);
    }
  }, [setConnectedSession]);

  useEffect(() => {
    if (session.status === 'connected') return;
    if (pendingBunkerAbortController) return;

    const pending = loadPendingBunkerQr();
    if (!pending) return;

    logBunkerQr('resuming-pending-qr', { relay: pending.relay, relays: pending.relays });
    setSession((prev) => ({ ...prev, status: 'connecting', method: 'bunker', error: '' }));
    const abortController = new AbortController();
    setPendingBunkerAbortController(abortController);
    void waitForPendingBunkerQr(pending, abortController);
  }, [pendingBunkerAbortController, session.status, waitForPendingBunkerQr]);

  const startBunkerQr = useCallback(async () => {
    logBunkerQr('start-requested', { hasPendingSigner: Boolean(pendingBunkerAbortController), relays: NOSTR_CONNECT_RELAYS });
    pendingBunkerAbortController?.abort();
    clearPendingBunkerQr();

    const abortController = new AbortController();
    setPendingBunkerAbortController(abortController);

    const pending = Nip46NdkSigner.createPending(NOSTR_CONNECT_RELAYS, 'Futbolcillo');
    savePendingBunkerQr(pending);
    logBunkerQr('qr-ready', {
      uri: pending.uri,
      uriLength: pending.uri.length,
      relays: pending.relays,
    });

    void waitForPendingBunkerQr(pending, abortController);

    return {
      uri: pending.uri,
      relay: pending.relay,
    };
  }, [pendingBunkerAbortController, waitForPendingBunkerQr]);

  const cancelBunkerQr = useCallback(() => {
    if (!pendingBunkerAbortController) return;
    logBunkerQr('cancel-pending-qr');
    pendingBunkerAbortController.abort();
    clearPendingBunkerQr();
    setPendingBunkerAbortController(null);
  }, [pendingBunkerAbortController]);

  const finishBunkerQr = useCallback(async () => {
    throw new Error('La conexión QR ahora se completa automáticamente.');
  }, []);

  const disconnect = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    logBunkerQr('disconnect', { hadPendingSigner: Boolean(pendingBunkerAbortController) });
    pendingBunkerAbortController?.abort();
    clearPendingBunkerQr();
    const ndk = getNostrClient();
    void (ndk.signer as { close?: () => Promise<void> | void } | undefined)?.close?.();
    ndk.signer = undefined;
    setPendingBunkerAbortController(null);
    setSession(defaultSession);
  }, [pendingBunkerAbortController]);

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
    () => ({ session, connectNip07, connectBunker, startBunkerQr, cancelBunkerQr, finishBunkerQr, disconnect, refreshProfile }),
    [session, connectNip07, connectBunker, startBunkerQr, cancelBunkerQr, finishBunkerQr, disconnect, refreshProfile]
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
