import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import NDK, { NDKEvent, NDKKind } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';
import { cacheDb } from '../cache/db';
import { getNostrClient } from '../nostr/client';
import { useNostrSession } from '../nostr/session-store';
import type { CachedChallenge, ChallengeFilter, ChallengeMode, ChallengeState } from './types';
import type { CachedProfile } from '../profile/types';

type ChallengeDraft = {
  rivalInput: string;
  rivalPubkey: string;
  amountSats: number;
  mode: ChallengeMode;
};

interface ChallengeContextValue {
  challenges: CachedChallenge[];
  recentRivals: CachedProfile[];
  followingRivals: CachedProfile[];
  rivalMatches: CachedProfile[];
  rivalProfiles: Record<string, CachedProfile>;
  draft: ChallengeDraft;
  setDraft: (next: Partial<ChallengeDraft>) => void;
  selectRival: (profile: CachedProfile) => void;
  createChallenge: () => Promise<void>;
  refreshChallenges: () => Promise<void>;
  challengeError: string;
  clearChallengeError: () => void;
  selectedFilter: ChallengeFilter;
  setSelectedFilter: (filter: ChallengeFilter) => void;
}

const ChallengeContext = createContext<ChallengeContextValue | null>(null);

const defaultDraft: ChallengeDraft = {
  rivalInput: '',
  rivalPubkey: '',
  amountSats: 500,
  mode: 'friendly',
};

const challengeSeedWords = {
  first: ['gol', 'pase', 'gamba', 'potrero', 'barrio', 'cancha', 'bocha', 'arco', 'grito', 'zurda'],
  second: ['verde', 'firme', 'picante', 'sereno', 'bravo', 'lento', 'vivo', 'sutil', 'corto', 'claro'],
  third: ['mate', 'tribuna', 'pique', 'caño', 'sueño', 'toque', 'rebote', 'clásico', 'cábala', 'enganche'],
  fourth: ['sur', 'norte', 'delta', 'centro', 'playa', 'luna', 'sol', 'río', 'campo', 'banda'],
};

function generateChallengeId() {
  const bytes = crypto.getRandomValues(new Uint32Array(4));

  return [
    challengeSeedWords.first[bytes[0] % challengeSeedWords.first.length],
    challengeSeedWords.second[bytes[1] % challengeSeedWords.second.length],
    challengeSeedWords.third[bytes[2] % challengeSeedWords.third.length],
    challengeSeedWords.fourth[bytes[3] % challengeSeedWords.fourth.length],
  ].join('-');
}

function generateChallengeAccessToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function normalizePubkey(input: string, profiles: CachedProfile[]) {
  const value = input.trim();
  if (!value) return '';
  if (value.startsWith('npub')) {
    const decoded = nip19.decode(value);
    if (decoded.type !== 'npub') {
      throw new Error('Ese valor no es un npub valido.');
    }

    return decoded.data;
  }

  if (/^[a-f0-9]{64}$/i.test(value)) {
    return value.toLowerCase();
  }

  const normalizedValue = value.toLowerCase();
  const profileMatch = profiles.find((profile) => {
    return profile.displayName.toLowerCase() === normalizedValue || profile.nip05.toLowerCase() === normalizedValue;
  });

  if (profileMatch) {
    return profileMatch.pubkey;
  }

  throw new Error('Ingresá un alias conocido, un npub o una pubkey hexadecimal válida.');
}

function isFinishedState(state: ChallengeState) {
  return state === 'rejected' || state === 'expired' || state === 'cancelled' || state === 'finalized';
}

async function sendChallengeDirectMessage(
  ndk: NDK,
  ownerPubkey: string,
  challenge: CachedChallenge,
  rivalName: string
) {
  const recipient = ndk.getUser({ pubkey: challenge.rivalPubkey });
  const siteUrl = typeof window !== 'undefined' ? window.location.origin : 'https://futbolcillo.app';
  const challengeUrl = `${siteUrl}?challenge=${challenge.id}&token=${challenge.accessToken}`;
  const message =
    challenge.mode === 'wager'
      ? [
          '⚽ Te tiraron un desafío en Futbolcillo.',
          `💸 Hay ${challenge.amountSats} sats en juego.`,
          'Tenés 24 horas para aceptarlo.',
          `👉 Entrá acá: ${challengeUrl}`,
        ].join(' ')
      : [
          '⚽ Te desafiaron a un amistoso en Futbolcillo.',
          'Tenés 24 horas para aceptarlo.',
          `👉 Entrá acá: ${challengeUrl}`,
        ].join(' ');

  const payload = {
    type: 'futbolcillo_challenge',
    version: 1,
    challengeId: challenge.id,
    accessToken: challenge.accessToken,
    mode: challenge.mode,
    amountSats: challenge.amountSats,
    expirationAt: challenge.expirationAt,
    createdAt: challenge.createdAt,
    from: ownerPubkey,
    to: challenge.rivalPubkey,
    message,
    rivalName,
  };

  const event = new NDKEvent(ndk, {
    kind: NDKKind.EncryptedDirectMessage,
    content: payload.message,
    tags: [
      ['p', challenge.rivalPubkey],
      ['challenge', JSON.stringify(payload)],
      ['url', challengeUrl],
    ],
  });

  await event.encrypt(recipient, undefined, 'nip04');
  await event.publish();
}

export function ChallengeProvider({ children }: { children: ReactNode }) {
  const { session } = useNostrSession();
  const [challenges, setChallenges] = useState<CachedChallenge[]>([]);
  const [recentRivals, setRecentRivals] = useState<CachedProfile[]>([]);
  const [followingRivals, setFollowingRivals] = useState<CachedProfile[]>([]);
  const [draft, setDraftState] = useState<ChallengeDraft>(defaultDraft);
  const [challengeError, setChallengeError] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<ChallengeFilter>('all');

  const refreshFollowingRivals = useCallback(async () => {
    if (!session.pubkey) {
      setFollowingRivals([]);
      return;
    }

    try {
      const ndk = getNostrClient();
      await ndk.connect(1500);

      const currentUser = ndk.getUser({ pubkey: session.pubkey });
      const followedUsers = await currentUser.follows(undefined, false);

      const hydratedProfiles = await Promise.all(
        Array.from(followedUsers).slice(0, 20).map(async (user) => {
          const cachedProfile = await cacheDb.profiles.get(user.pubkey);
          const remoteProfile = await user.fetchProfile().catch(() => undefined);

          const profile: CachedProfile = {
            pubkey: user.pubkey,
            avatarUrl: remoteProfile?.image || remoteProfile?.picture || cachedProfile?.avatarUrl || `https://api.dicebear.com/9.x/shapes/svg?seed=${user.pubkey}`,
            displayName: remoteProfile?.displayName || remoteProfile?.name || cachedProfile?.displayName || `Rival ${user.pubkey.slice(0, 8)}`,
            nip05: remoteProfile?.nip05 || cachedProfile?.nip05 || '',
            lud16: remoteProfile?.lud16 || cachedProfile?.lud16 || '',
            updatedAt: Date.now(),
          };

          await cacheDb.profiles.put(profile);
          return profile;
        })
      );

      setFollowingRivals(hydratedProfiles);
    } catch {
      setFollowingRivals([]);
    }
  }, [session.pubkey]);

  const refreshChallenges = useCallback(async () => {
    if (!session.pubkey) {
      setChallenges([]);
      setRecentRivals([]);
      return;
    }

    const [records, profiles] = await Promise.all([
      cacheDb.challenges.where('ownerPubkey').equals(session.pubkey).reverse().sortBy('updatedAt'),
      cacheDb.profiles.toArray(),
    ]);

    const filteredProfiles = profiles.filter((profile) => profile.pubkey !== session.pubkey);

    filteredProfiles.sort((a, b) => {
      const lastA = records.find((record) => record.rivalPubkey === a.pubkey)?.updatedAt ?? 0;
      const lastB = records.find((record) => record.rivalPubkey === b.pubkey)?.updatedAt ?? 0;
      return lastB - lastA || b.updatedAt - a.updatedAt;
    });

    setChallenges(records);
    setRecentRivals(filteredProfiles.slice(0, 6));
  }, [session.pubkey]);

  useEffect(() => {
    void refreshChallenges();
  }, [refreshChallenges]);

  useEffect(() => {
    void refreshFollowingRivals();
  }, [refreshFollowingRivals]);

  const setDraft = useCallback((next: Partial<ChallengeDraft>) => {
    setDraftState((prev) => ({
      ...prev,
      ...next,
      rivalPubkey: Object.prototype.hasOwnProperty.call(next, 'rivalInput') ? '' : (next.rivalPubkey ?? prev.rivalPubkey),
    }));
  }, []);

  const selectRival = useCallback((profile: CachedProfile) => {
    setDraftState((prev) => ({
      ...prev,
      rivalInput: profile.displayName || profile.nip05 || profile.pubkey,
      rivalPubkey: profile.pubkey,
    }));
    setChallengeError('');
  }, []);

  const rivalMatches = useMemo(() => {
    const value = draft.rivalInput.trim().toLowerCase();
    if (value.length < 2) return [];

    const combinedProfiles = [...followingRivals, ...recentRivals];
    const dedupedProfiles = combinedProfiles.filter((profile, index, list) => {
      return list.findIndex((candidate) => candidate.pubkey === profile.pubkey) === index;
    });

    const scoredProfiles = dedupedProfiles
      .filter((profile) => {
        return (
          profile.displayName.toLowerCase().includes(value) ||
          profile.nip05.toLowerCase().includes(value) ||
          profile.pubkey.toLowerCase().includes(value)
        );
      })
      .map((profile) => ({
        profile,
        score: followingRivals.some((followed) => followed.pubkey === profile.pubkey) ? 2 : 1,
      }))
      .sort((a, b) => b.score - a.score || b.profile.updatedAt - a.profile.updatedAt)
      .slice(0, 6)
      .map((entry) => entry.profile);

    return scoredProfiles;
  }, [draft.rivalInput, followingRivals, recentRivals]);

  const createChallenge = useCallback(async () => {
    if (!session.pubkey) {
      setChallengeError('Conecta tu identidad antes de crear un desafio.');
      return;
    }

    try {
      const rivalPubkey = draft.rivalPubkey || normalizePubkey(draft.rivalInput, recentRivals);
      const now = Date.now();
      const selectedProfile = [...followingRivals, ...recentRivals].find((profile) => profile.pubkey === rivalPubkey);
      const challenge: CachedChallenge = {
        id: generateChallengeId(),
        accessToken: generateChallengeAccessToken(),
        ownerPubkey: session.pubkey,
        mode: draft.mode,
        state: 'sent',
        rivalPubkey,
        rivalName: selectedProfile?.displayName || selectedProfile?.nip05 || `Rival ${rivalPubkey.slice(0, 8)}`,
        amountSats: draft.mode === 'wager' ? draft.amountSats : 0,
        expirationAt: now + 24 * 60 * 60 * 1000,
        createdAt: now,
        updatedAt: now,
      };

      await sendChallengeDirectMessage(getNostrClient(), session.pubkey, challenge, challenge.rivalName);
      await cacheDb.challenges.put(challenge);

      const existingProfile = await cacheDb.profiles.get(rivalPubkey);
      if (!existingProfile) {
        await cacheDb.profiles.put({
          pubkey: rivalPubkey,
          avatarUrl: `https://api.dicebear.com/9.x/shapes/svg?seed=${rivalPubkey}`,
          displayName: challenge.rivalName,
          nip05: '',
          lud16: '',
          updatedAt: now,
        });
      }

      setDraftState((prev) => ({ ...prev, rivalInput: '', rivalPubkey: '', amountSats: prev.mode === 'wager' ? prev.amountSats : 500 }));
      setChallengeError('');
      await refreshChallenges();
    } catch (error) {
      setChallengeError(error instanceof Error ? error.message : 'No se pudo enviar el desafío.');
    }
  }, [draft, followingRivals, recentRivals, refreshChallenges, session.pubkey]);

  const clearChallengeError = useCallback(() => setChallengeError(''), []);

  const filteredChallenges = useMemo(() => {
    if (selectedFilter === 'all') return challenges;
    if (selectedFilter === 'friendly') return challenges.filter((challenge) => challenge.mode === 'friendly');
    if (selectedFilter === 'wager') return challenges.filter((challenge) => challenge.mode === 'wager');
    if (selectedFilter === 'pending') return challenges.filter((challenge) => !isFinishedState(challenge.state));
    return challenges.filter((challenge) => isFinishedState(challenge.state));
  }, [challenges, selectedFilter]);

  const rivalProfiles = useMemo(() => {
    const combinedProfiles = [...followingRivals, ...recentRivals];

    return combinedProfiles.reduce<Record<string, CachedProfile>>((acc, profile) => {
      acc[profile.pubkey] = profile;
      return acc;
    }, {});
  }, [followingRivals, recentRivals]);

  const value = useMemo(
    () => ({
      challenges: filteredChallenges,
      recentRivals,
      followingRivals,
      rivalMatches,
      rivalProfiles,
      draft,
      setDraft,
      selectRival,
      createChallenge,
      refreshChallenges,
      challengeError,
      clearChallengeError,
      selectedFilter,
      setSelectedFilter,
    }),
    [filteredChallenges, recentRivals, followingRivals, rivalMatches, rivalProfiles, draft, setDraft, selectRival, createChallenge, refreshChallenges, challengeError, clearChallengeError, selectedFilter]
  );

  return <ChallengeContext.Provider value={value}>{children}</ChallengeContext.Provider>;
}

export function useChallengeStore() {
  const context = useContext(ChallengeContext);
  if (!context) {
    throw new Error('useChallengeStore must be used within ChallengeProvider');
  }

  return context;
}
