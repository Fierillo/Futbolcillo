import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import NDK, { NDKEvent, NDKKind } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';
import { cacheDb } from '../cache/db';
import { getNostrClient } from '../nostr/client';
import { useNostrSession } from '../nostr/session-store';
import type { CachedChallenge, ChallengeFilter, ChallengeMode, ChallengeState } from './types';
import type { CachedProfile } from '../profile/types';
import { buildChallengeUrl } from './url';

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
  linkedChallenge: CachedChallenge | null;
  activeChallenge: CachedChallenge | null;
  activeChallengeId: string | null;
  pendingIncomingCount: number;
  draft: ChallengeDraft;
  setDraft: (next: Partial<ChallengeDraft>) => void;
  selectRival: (profile: CachedProfile) => void;
  createChallenge: () => Promise<void>;
  refreshChallenges: () => Promise<void>;
  loadLinkedChallenge: (challengeId: string, token: string, ownerHint?: string) => Promise<void>;
  acceptLinkedChallenge: () => Promise<void>;
  rejectLinkedChallenge: () => Promise<void>;
  acceptIncomingChallenge: (challenge: CachedChallenge) => Promise<void>;
  enterAcceptedChallenge: (challenge: CachedChallenge) => void;
  clearActiveChallenge: () => void;
  finalizeChallenge: (challengeId: string) => Promise<void>;
  finalizeChallengeWithResult: (challengeId: string, winnerPubkey: string | null, scoreHome: number, scoreAway: number) => Promise<void>;
  updateChallengeState: (challengeId: string, state: ChallengeState) => Promise<void>;
  syncChallengeProgress: (challengeId: string, state: ChallengeState, scoreHome: number, scoreAway: number) => Promise<void>;
  setActiveChallengeById: (challengeId: string, accessToken?: string) => Promise<void>;
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
  return state === 'rejected' || state === 'expired' || state === 'cancelled' || state === 'finalized' || state === 'terminated';
}

function resolveRivalName(pubkey: string, profile?: CachedProfile | null, fallbackName?: string | null) {
  return profile?.displayName || profile?.nip05 || fallbackName || `Rival ${pubkey.slice(0, 8)}`;
}

async function sendChallengeDirectMessage(
  ndk: NDK,
  ownerPubkey: string,
  challenge: CachedChallenge,
  senderName: string
) {
  await ndk.connect(1500);

  const recipient = ndk.getUser({ pubkey: challenge.rivalPubkey });
  const challengeUrl = buildChallengeUrl(challenge.id, challenge.accessToken, ownerPubkey);
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
    senderName,
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

  // Use classic kind:4 + nip04 for maximum client compatibility.
  await event.encrypt(recipient, undefined, 'nip04');
  event.tags.push(['encryption', 'nip04']);

  await event.publish();
}

export function ChallengeProvider({ children }: { children: ReactNode }) {
  const { session } = useNostrSession();
  const [challenges, setChallenges] = useState<CachedChallenge[]>([]);
  const [recentRivals, setRecentRivals] = useState<CachedProfile[]>([]);
  const [followingRivals, setFollowingRivals] = useState<CachedProfile[]>([]);
  const [linkedChallenge, setLinkedChallenge] = useState<CachedChallenge | null>(null);
  const [activeChallenge, setActiveChallenge] = useState<CachedChallenge | null>(null);
  const [draft, setDraftState] = useState<ChallengeDraft>(defaultDraft);
  const [challengeError, setChallengeError] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<ChallengeFilter>('all');

  const patchLocalChallenge = useCallback((challengeId: string, patch: Partial<CachedChallenge>) => {
    setChallenges((prev) => prev.map((challenge) => (challenge.id === challengeId ? { ...challenge, ...patch } : challenge)));
    setActiveChallenge((prev) => (prev && prev.id === challengeId ? { ...prev, ...patch } : prev));
    setLinkedChallenge((prev) => (prev && prev.id === challengeId ? { ...prev, ...patch } : prev));
  }, []);

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
      setLinkedChallenge(null);
      setActiveChallenge(null);
      return;
    }

    try {
      const res = await fetch(`/api/challenges/list?pubkey=${session.pubkey}`);
      if (res.ok) {
        const data = await res.json() as {
          ok: boolean;
          owned: Array<{
            id: string;
            accessToken: string;
            ownerPubkey: string;
            rivalPubkey: string;
            mode: string;
            state: string;
            amountSats: number;
            winnerPubkey: string | null;
            scoreHome: number | null;
            scoreAway: number | null;
            expiresAt: string;
            createdAt: string;
            updatedAt: string;
          }>;
          incoming: Array<{
            id: string;
            accessToken: string;
            ownerPubkey: string;
            rivalPubkey: string;
            mode: string;
            state: string;
            amountSats: number;
            winnerPubkey: string | null;
            scoreHome: number | null;
            scoreAway: number | null;
            expiresAt: string;
            createdAt: string;
            updatedAt: string;
          }>;
        };

        if (data.ok) {
          const serverChallengeIds = new Set<string>();

          for (const c of data.owned) {
            serverChallengeIds.add(c.id);
            const existing = await cacheDb.challenges.get(c.id);
            const rivalProfile = await cacheDb.profiles.get(c.rivalPubkey);
            const updatedAt = new Date(c.updatedAt).getTime();
            const hasServerResult = c.winnerPubkey != null || c.scoreHome != null || c.scoreAway != null;
            if (!existing || updatedAt > existing.updatedAt || hasServerResult) {
              await cacheDb.challenges.put({
                id: c.id,
                accessToken: c.accessToken,
                ownerPubkey: c.ownerPubkey,
                sourceOwnerPubkey: c.ownerPubkey,
                direction: 'outgoing',
                mode: c.mode as ChallengeMode,
                state: c.state as ChallengeState,
                rivalPubkey: c.rivalPubkey,
                rivalName: resolveRivalName(c.rivalPubkey, rivalProfile, existing?.rivalName),
                amountSats: c.amountSats,
                expirationAt: new Date(c.expiresAt).getTime(),
                createdAt: new Date(c.createdAt).getTime(),
                updatedAt,
                winnerPubkey: c.winnerPubkey || existing?.winnerPubkey || undefined,
                scoreHome: c.scoreHome ?? existing?.scoreHome ?? undefined,
                scoreAway: c.scoreAway ?? existing?.scoreAway ?? undefined,
              });
            }
          }

          for (const c of data.incoming) {
            serverChallengeIds.add(c.id);
            const existing = await cacheDb.challenges.get(c.id);
            const updatedAt = new Date(c.updatedAt).getTime();
            const hasServerResult = c.winnerPubkey != null || c.scoreHome != null || c.scoreAway != null;
            if (!existing || updatedAt > existing.updatedAt || hasServerResult) {
              const senderProfile = await cacheDb.profiles.get(c.ownerPubkey);
              await cacheDb.challenges.put({
                id: c.id,
                accessToken: c.accessToken,
                ownerPubkey: session.pubkey,
                sourceOwnerPubkey: c.ownerPubkey,
                direction: 'incoming',
                mode: c.mode as ChallengeMode,
                state: c.state as ChallengeState,
                rivalPubkey: c.ownerPubkey,
                rivalName: resolveRivalName(c.ownerPubkey, senderProfile, existing?.rivalName),
                amountSats: c.amountSats,
                expirationAt: new Date(c.expiresAt).getTime(),
                createdAt: new Date(c.createdAt).getTime(),
                updatedAt,
                winnerPubkey: c.winnerPubkey || existing?.winnerPubkey || undefined,
                scoreHome: c.scoreHome ?? existing?.scoreHome ?? undefined,
                scoreAway: c.scoreAway ?? existing?.scoreAway ?? undefined,
              });
            }
          }

        }
      }
    } catch {
      // Backend unavailable, use local cache only
    }

    const [records, profiles] = await Promise.all([
      cacheDb.challenges.where('ownerPubkey').equals(session.pubkey).reverse().sortBy('updatedAt'),
      cacheDb.profiles.toArray(),
    ]);

    const now = Date.now();
    const removableExpiredIds = records
      .filter((record) => record.expirationAt <= now && (record.state === 'sent' || record.state === 'received' || record.state === 'accepted'))
      .map((record) => record.id);

    if (removableExpiredIds.length > 0) {
      await cacheDb.challenges.bulkDelete(removableExpiredIds);
    }

    const visibleRecords = records.filter((record) => !removableExpiredIds.includes(record.id));

    const filteredProfiles = profiles.filter((profile) => profile.pubkey !== session.pubkey);

    filteredProfiles.sort((a, b) => {
      const lastA = visibleRecords.find((record) => record.rivalPubkey === a.pubkey)?.updatedAt ?? 0;
      const lastB = visibleRecords.find((record) => record.rivalPubkey === b.pubkey)?.updatedAt ?? 0;
      return lastB - lastA || b.updatedAt - a.updatedAt;
    });

    const profilesByPubkey = profiles.reduce<Record<string, CachedProfile>>((acc, profile) => {
      acc[profile.pubkey] = profile;
      return acc;
    }, {});

    const normalizedRecords = visibleRecords.map((record) => {
      const profile = profilesByPubkey[record.rivalPubkey];
      const rivalName = resolveRivalName(record.rivalPubkey, profile, record.rivalName);
      return rivalName === record.rivalName ? record : { ...record, rivalName };
    });

    const dirtyRecords = normalizedRecords.filter((record, index) => record !== visibleRecords[index]);
    if (dirtyRecords.length > 0) {
      await cacheDb.challenges.bulkPut(dirtyRecords);
    }

    setChallenges(normalizedRecords);
    setRecentRivals(filteredProfiles.slice(0, 6));
  }, [session.pubkey]);

  useEffect(() => {
    void refreshChallenges();
  }, [refreshChallenges]);

  useEffect(() => {
    if (!session.pubkey) return;
    const interval = setInterval(() => {
      void refreshChallenges();
    }, 5000);
    return () => clearInterval(interval);
  }, [session.pubkey, refreshChallenges]);

  useEffect(() => {
    void refreshFollowingRivals();
  }, [refreshFollowingRivals]);

  useEffect(() => {
    if (!session.pubkey) return;

    const ndk = getNostrClient();
    let stopped = false;

    const handleIncomingEvent = async (event: NDKEvent) => {
      const rawChallengePayload = event.tags.find((tag) => tag[0] === 'challenge')?.[1];
      const rawNotificationPayload = event.tags.find((tag) => tag[0] === 'match_notification')?.[1];

      if (rawNotificationPayload) {
        try {
          const payload = JSON.parse(rawNotificationPayload) as {
            type: string;
            notificationType: string;
            matchId: string;
            message: string;
          };
          if (payload.type === 'futbolcillo_match_notification' && !stopped) {
            await refreshChallenges();
          }
        } catch {
          // Ignore malformed notifications.
        }
        return;
      }

      if (!rawChallengePayload) return;

      try {
        const payload = JSON.parse(rawChallengePayload) as {
          type: string;
          challengeId: string;
          accessToken: string;
          mode: ChallengeMode;
          amountSats: number;
          expirationAt: number;
          createdAt: number;
          from: string;
          senderName?: string;
        };

        if (payload.type === 'futbolcillo_challenge') {
          const senderPubkey = event.pubkey;
          const existingProfile = await cacheDb.profiles.get(senderPubkey);
          if (!existingProfile) {
            await cacheDb.profiles.put({
              pubkey: senderPubkey,
              avatarUrl: `https://api.dicebear.com/9.x/shapes/svg?seed=${senderPubkey}`,
              displayName: resolveRivalName(senderPubkey, null, payload.senderName),
              nip05: '',
              lud16: '',
              updatedAt: Date.now(),
            });
          }

          await cacheDb.challenges.put({
            id: payload.challengeId,
            accessToken: payload.accessToken,
            ownerPubkey: session.pubkey,
            sourceOwnerPubkey: senderPubkey,
            direction: 'incoming',
            mode: payload.mode,
            state: 'received',
            rivalPubkey: senderPubkey,
            rivalName: resolveRivalName(senderPubkey, existingProfile, payload.senderName),
            amountSats: payload.amountSats,
            expirationAt: payload.expirationAt,
            createdAt: payload.createdAt,
            updatedAt: Date.now(),
          });
        }

        if (!stopped) {
          await refreshChallenges();
        }
      } catch {
        // Ignore malformed DMs.
      }
    };

    void ndk.connect(1500).then(() => {
      if (stopped) return;

      ndk.subscribe(
        {
          kinds: [NDKKind.EncryptedDirectMessage],
          '#p': [session.pubkey],
          limit: 20,
        },
        {
          closeOnEose: false,
          onEvent: (event) => {
            void handleIncomingEvent(event);
          },
        }
      );
    });

    return () => {
      stopped = true;
    };
  }, [refreshChallenges, session.pubkey]);

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
        direction: 'outgoing',
        mode: draft.mode,
        state: 'sent',
        rivalPubkey,
        rivalName: selectedProfile?.displayName || selectedProfile?.nip05 || `Rival ${rivalPubkey.slice(0, 8)}`,
        amountSats: draft.mode === 'wager' ? draft.amountSats : 0,
        expirationAt: now + 24 * 60 * 60 * 1000,
        createdAt: now,
        updatedAt: now,
      };

      await sendChallengeDirectMessage(
        getNostrClient(),
        session.pubkey,
        challenge,
        session.profile?.name || session.profile?.pubkey?.slice(0, 8) || 'Jugador'
      );
      await cacheDb.challenges.put(challenge);

      try {
        const res = await fetch('/api/challenges/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: challenge.id,
            accessToken: challenge.accessToken,
            ownerPubkey: challenge.ownerPubkey,
            rivalPubkey: challenge.rivalPubkey,
            mode: challenge.mode,
            amountSats: challenge.amountSats,
            expiresAt: new Date(challenge.expirationAt).toISOString(),
          }),
        });

        if (!res.ok) {
          console.warn('[challenge] backend-create-failed', res.status);
        }
      } catch (error) {
        console.warn('[challenge] backend-create-unavailable', error);
      }

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

  const loadLinkedChallenge = useCallback(async (challengeId: string, token: string, ownerHint = '') => {
    if (!challengeId || !token || !session.pubkey) {
      setLinkedChallenge(null);
      return;
    }

    const cachedChallenge = await cacheDb.challenges.get(challengeId);
    if (cachedChallenge && cachedChallenge.accessToken === token) {
      const normalizedCached = ownerHint && !cachedChallenge.sourceOwnerPubkey
        ? { ...cachedChallenge, sourceOwnerPubkey: ownerHint }
        : cachedChallenge;
      if (normalizedCached !== cachedChallenge) {
        await cacheDb.challenges.put(normalizedCached);
      }
      setLinkedChallenge(normalizedCached);
      setChallengeError('');
      return;
    }

    try {
      const res = await fetch(`/api/challenges/status?id=${encodeURIComponent(challengeId)}&token=${encodeURIComponent(token)}`);
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.ok && data.challenge) {
        const challenge = data.challenge as {
          id: string;
          accessToken: string;
          ownerPubkey: string;
          rivalPubkey: string;
          mode: ChallengeMode;
          state: ChallengeState;
          amountSats: number;
          expiresAt: string;
          createdAt: string;
          updatedAt: string;
        };

        const isOwner = challenge.ownerPubkey === session.pubkey;
        const rivalPubkey = isOwner ? challenge.rivalPubkey : challenge.ownerPubkey;
        const senderProfile = await cacheDb.profiles.get(rivalPubkey);

        const normalizedChallenge: CachedChallenge = {
          id: challenge.id,
          accessToken: challenge.accessToken,
          ownerPubkey: session.pubkey,
          sourceOwnerPubkey: challenge.ownerPubkey,
          direction: isOwner ? 'outgoing' : 'incoming',
          mode: challenge.mode,
          state: challenge.state,
          rivalPubkey,
          rivalName: resolveRivalName(rivalPubkey, senderProfile, cachedChallenge?.rivalName),
          amountSats: challenge.amountSats,
          expirationAt: new Date(challenge.expiresAt).getTime(),
          createdAt: new Date(challenge.createdAt).getTime(),
          updatedAt: new Date(challenge.updatedAt).getTime(),
        };

        await cacheDb.challenges.put(normalizedChallenge);
        setLinkedChallenge(normalizedChallenge);
        setChallengeError('');
        return;
      }

      // If the backend still does not know this challenge, keep a local placeholder so the link remains actionable.
      const localChallenge: CachedChallenge = {
        id: challengeId,
        accessToken: token,
        ownerPubkey: session.pubkey,
        sourceOwnerPubkey: ownerHint || '',
        direction: 'incoming',
        mode: 'friendly',
        state: 'received',
        rivalPubkey: ownerHint || '',
        rivalName: ownerHint ? resolveRivalName(ownerHint) : 'Desconocido',
        amountSats: 0,
        expirationAt: Date.now() + 24 * 60 * 60 * 1000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await cacheDb.challenges.put(localChallenge);
      setLinkedChallenge(localChallenge);
      setChallengeError('');
    } catch {
      setLinkedChallenge(null);
      setChallengeError('No se pudo cargar el desafío desde el servidor. Probá abrir el link desde la misma URL donde está corriendo Futbolcillo.');
    }
  }, [session.pubkey]);

  const acceptLinkedChallenge = useCallback(async () => {
    if (!linkedChallenge) return;

    let alreadyInMatch = false;

    if (linkedChallenge.state === 'in_match' || linkedChallenge.state === 'accepted') {
      alreadyInMatch = true;
    } else {
      try {
        const res = await fetch('/api/challenges/accept', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            challengeId: linkedChallenge.id,
            accessToken: linkedChallenge.accessToken,
            rivalPubkey: session.pubkey,
            ownerPubkey: linkedChallenge.sourceOwnerPubkey || linkedChallenge.ownerPubkey,
            mode: linkedChallenge.mode,
            amountSats: linkedChallenge.amountSats,
            expiresAt: new Date(linkedChallenge.expirationAt).toISOString(),
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          const errorMessage = data.error || 'No se pudo aceptar el desafío.';

          if (res.status === 409) {
            alreadyInMatch = true;
          } else {
            setChallengeError(errorMessage);
            return;
          }
        }
      } catch {
        setChallengeError('No se pudo conectar con el servidor.');
        return;
      }
    }

    const nextChallenge: CachedChallenge = {
      ...linkedChallenge,
      state: alreadyInMatch ? 'in_match' : 'accepted',
      updatedAt: Date.now(),
    };

    await cacheDb.challenges.put(nextChallenge);
    setLinkedChallenge(nextChallenge);
    setActiveChallenge(nextChallenge);
    await refreshChallenges();
  }, [linkedChallenge, refreshChallenges, session.pubkey]);

  const rejectLinkedChallenge = useCallback(async () => {
    if (!linkedChallenge) return;

    const nextChallenge: CachedChallenge = {
      ...linkedChallenge,
      state: 'rejected',
      updatedAt: Date.now(),
    };

    await cacheDb.challenges.put(nextChallenge);
    setLinkedChallenge(nextChallenge);
    setActiveChallenge(null);

    try {
      await fetch('/api/challenges/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reject',
          challengeId: linkedChallenge.id,
          accessToken: linkedChallenge.accessToken,
          pubkey: session.pubkey,
        }),
      }).catch(() => {});
    } catch {
      // ignore - local state already updated
    }

    await refreshChallenges();
  }, [linkedChallenge, refreshChallenges, session.pubkey]);

  const acceptIncomingChallenge = useCallback(async (challenge: CachedChallenge) => {
    let alreadyInMatch = false;

    if (challenge.state === 'in_match' || challenge.state === 'accepted') {
      alreadyInMatch = true;
    } else {
      try {
        const res = await fetch('/api/challenges/accept', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            challengeId: challenge.id,
            accessToken: challenge.accessToken,
            rivalPubkey: session.pubkey,
            ownerPubkey: challenge.sourceOwnerPubkey || challenge.ownerPubkey,
            mode: challenge.mode,
            amountSats: challenge.amountSats,
            expiresAt: new Date(challenge.expirationAt).toISOString(),
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          const errorMessage = data.error || 'No se pudo aceptar el desafío.';

          if (res.status === 409) {
            alreadyInMatch = true;
          } else {
            setChallengeError(errorMessage);
            return;
          }
        }
      } catch {
        setChallengeError('No se pudo conectar con el servidor.');
        return;
      }
    }

    const nextChallenge: CachedChallenge = {
      ...challenge,
      state: alreadyInMatch ? 'in_match' : 'accepted',
      updatedAt: Date.now(),
    };

    await cacheDb.challenges.put(nextChallenge);
    setActiveChallenge(nextChallenge);
    await refreshChallenges();
  }, [refreshChallenges, session.pubkey]);

  const enterAcceptedChallenge = useCallback((challenge: CachedChallenge) => {
    setActiveChallenge(challenge);
  }, []);

  const finalizeChallenge = useCallback(async (challengeId: string) => {
    await cacheDb.challenges.update(challengeId, {
      state: 'finalized',
      updatedAt: Date.now(),
    });
    try {
      await fetch('/api/challenges/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'finalize', challengeId }),
      }).catch(() => {});
    } catch {
      // ignore
    }
    await refreshChallenges();
  }, [refreshChallenges]);

  const finalizeChallengeWithResult = useCallback(async (challengeId: string, winnerPubkey: string | null, scoreHome: number, scoreAway: number) => {
    // Update local cache immediately
    await cacheDb.challenges.update(challengeId, {
      state: 'finalized',
      winnerPubkey: winnerPubkey ?? undefined,
      scoreHome,
      scoreAway,
      updatedAt: Date.now(),
    });
    // Await server update before refreshing so data isn't overwritten with stale state
    try {
      const res = await fetch('/api/challenges/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'finalize', challengeId, winnerPubkey, scoreHome, scoreAway }),
      });
      if (!res.ok) {
        // If server rejects (e.g. already finalized), keep local cache as-is
      }
    } catch {
      // Server unreachable, local cache already updated
    }
    await refreshChallenges();
  }, [refreshChallenges]);

  const setActiveChallengeById = useCallback(async (challengeId: string, accessToken = '') => {
    const cached = await cacheDb.challenges.get(challengeId);
    if (cached) {
      setActiveChallenge(cached);
    }

    try {
      const searchParams = new URLSearchParams({ id: challengeId });
      if (accessToken) {
        searchParams.set('token', accessToken);
      }

      const res = await fetch(`/api/challenges/status?${searchParams.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok && data.challenge) {
        const ch = data.challenge as { id: string; accessToken: string; ownerPubkey: string; rivalPubkey: string; mode: string; state: string; amountSats: number; winnerPubkey?: string | null; scoreHome?: number | null; scoreAway?: number | null; expiresAt: string; createdAt: string; updatedAt: string };
        const isOwner = ch.ownerPubkey === session.pubkey;
        const rivalPubkey = isOwner ? ch.rivalPubkey : ch.ownerPubkey;
        const rivalProfile = await cacheDb.profiles.get(rivalPubkey);
        const newChallenge: CachedChallenge = {
          id: ch.id,
          accessToken: ch.accessToken,
          ownerPubkey: session.pubkey,
          sourceOwnerPubkey: ch.ownerPubkey,
          direction: isOwner ? 'outgoing' : 'incoming',
          mode: ch.mode as ChallengeMode,
          state: ch.state as ChallengeState,
          rivalPubkey,
          rivalName: resolveRivalName(rivalPubkey, rivalProfile, cached?.rivalName),
          amountSats: ch.amountSats,
          expirationAt: new Date(ch.expiresAt).getTime(),
          createdAt: new Date(ch.createdAt).getTime(),
          updatedAt: new Date(ch.updatedAt).getTime(),
          winnerPubkey: ch.winnerPubkey || undefined,
          scoreHome: ch.scoreHome ?? undefined,
          scoreAway: ch.scoreAway ?? undefined,
        };
        await cacheDb.challenges.put(newChallenge);
        setActiveChallenge(newChallenge);
        return;
      }
    } catch {
      // ignore
    }

    if (cached) {
      setActiveChallenge(cached);
    }
  }, [session.pubkey]);

  const updateChallengeState = useCallback(async (challengeId: string, state: ChallengeState) => {
    await cacheDb.challenges.update(challengeId, {
      state,
      updatedAt: Date.now(),
    });
    await refreshChallenges();
  }, [refreshChallenges]);

  const syncChallengeProgress = useCallback(async (challengeId: string, state: ChallengeState, scoreHome: number, scoreAway: number) => {
    const updatedAt = Date.now();
    try {
      const res = await fetch('/api/challenges/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_state',
          challengeId,
          state,
          scoreHome,
          scoreAway,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        return;
      }

      await cacheDb.challenges.update(challengeId, {
        state,
        scoreHome,
        scoreAway,
        updatedAt,
      });
      patchLocalChallenge(challengeId, {
        state,
        scoreHome,
        scoreAway,
        updatedAt,
      });
    } catch {
      // Keep local cache untouched when the server write fails.
    }
  }, [patchLocalChallenge]);

  const clearActiveChallenge = useCallback(() => {
    setActiveChallenge(null);
  }, []);

  const pendingIncomingCount = useMemo(() => {
    return challenges.filter(
      (challenge) => challenge.direction === 'incoming' && challenge.state === 'received'
    ).length;
  }, [challenges]);

  const activeChallengeId = activeChallenge?.id ?? null;

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
      linkedChallenge,
      activeChallenge,
      activeChallengeId,
      pendingIncomingCount,
      draft,
      setDraft,
      selectRival,
      createChallenge,
      refreshChallenges,
      loadLinkedChallenge,
      acceptLinkedChallenge,
      rejectLinkedChallenge,
      acceptIncomingChallenge,
      enterAcceptedChallenge,
      finalizeChallenge,
      finalizeChallengeWithResult,
      updateChallengeState,
      syncChallengeProgress,
      setActiveChallengeById,
      clearActiveChallenge,
      challengeError,
      clearChallengeError,
      selectedFilter,
      setSelectedFilter,
    }),
    [filteredChallenges, recentRivals, followingRivals, rivalMatches, rivalProfiles, linkedChallenge, activeChallenge, activeChallengeId, pendingIncomingCount, draft, setDraft, selectRival, createChallenge, refreshChallenges, loadLinkedChallenge, acceptLinkedChallenge, rejectLinkedChallenge, acceptIncomingChallenge, enterAcceptedChallenge, finalizeChallenge, finalizeChallengeWithResult, updateChallengeState, syncChallengeProgress, setActiveChallengeById, clearActiveChallenge, challengeError, clearChallengeError, selectedFilter]
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
