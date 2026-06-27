import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { MatchState, ShotAnimation } from '../game/physics';
import type { CachedChallenge } from '../challenge/types';

type ActiveMatch = {
  id: string;
  status: string;
  homePubkey: string;
  awayPubkey: string;
  state: MatchState;
  rematchRequestedBy?: string | null;
  rematchMatchId?: string | null;
  rematchRejectedBy?: string | null;
  terminatedBy?: string | null;
};

interface MatchContextValue {
  activeMatchId: string | null;
  matchState: MatchState | null;
  activeMatchMeta: ActiveMatch | null;
  matchError: string;
  isCreatingMatch: boolean;
  isAnimatingShot: boolean;
  pendingShotAnimation: ShotAnimation | null;
  isSubmittingRematch: boolean;
  createMatch: (challenge: CachedChallenge) => Promise<void>;
  submitShot: (playerIndex: number, velX: number, velY: number) => Promise<void>;
  requestRematch: (requesterPubkey: string) => Promise<void>;
  acceptRematch: (accepterPubkey: string) => Promise<void>;
  rejectRematch: (rejecterPubkey: string) => Promise<void>;
  clearMatch: () => void;
  refreshMatchState: () => Promise<void>;
  finishShotAnimation: () => void;
}

const MatchContext = createContext<MatchContextValue | null>(null);

export function MatchProvider({ children }: { children: ReactNode }) {
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [activeMatchMeta, setActiveMatchMeta] = useState<ActiveMatch | null>(null);
  const [matchState, setMatchState] = useState<MatchState | null>(null);
  const [matchError, setMatchError] = useState('');
  const [isCreatingMatch, setIsCreatingMatch] = useState(false);
  const [isAnimatingShot, setIsAnimatingShot] = useState(false);
  const [pendingShotAnimation, setPendingShotAnimation] = useState<ShotAnimation | null>(null);
  const [isSubmittingRematch, setIsSubmittingRematch] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const creatingForChallengeRef = useRef<string | null>(null);
  const matchStateRef = useRef<MatchState | null>(null);
  const lastSeenShotIdRef = useRef<string | null>(null);

  useEffect(() => {
    matchStateRef.current = matchState;
  }, [matchState]);

  const clearMatch = useCallback(() => {
    setActiveMatchId(null);
    setActiveMatchMeta(null);
    setMatchState(null);
    matchStateRef.current = null;
    setMatchError('');
    setIsAnimatingShot(false);
    setPendingShotAnimation(null);
    setIsSubmittingRematch(false);
    lastSeenShotIdRef.current = null;
    creatingForChallengeRef.current = null;
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const fetchMatchState = useCallback(async (matchId: string) => {
    try {
      const res = await fetch(`/api/matches/state?matchId=${matchId}`);
      if (!res.ok) return null;
      const data = await res.json() as { ok: boolean; match?: ActiveMatch };
      if (data.ok && data.match) {
        return data.match;
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  const refreshMatchState = useCallback(async () => {
    if (!activeMatchId) return;
    const match = await fetchMatchState(activeMatchId);
    if (match) {
      setActiveMatchMeta(match);
      setMatchState((prev) => {
        if (prev && JSON.stringify(prev) === JSON.stringify(match.state)) return prev;
        return match.state;
      });
    }
  }, [activeMatchId, fetchMatchState]);

  const finishShotAnimation = useCallback(() => {
    setPendingShotAnimation(null);
    setIsAnimatingShot(false);
  }, []);

  useEffect(() => {
    if (!activeMatchId) return;

    const poll = async () => {
      const match = await fetchMatchState(activeMatchId);
      if (!match) return;

      if (match.status === 'terminated') {
        setActiveMatchMeta(match);
        setMatchState(match.state);
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        return;
      }

      if (match.status === 'finished' && !match.rematchMatchId) {
        setActiveMatchMeta(match);
        setMatchState(match.state);
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        return;
      }

      if (match.rematchMatchId && match.rematchMatchId !== activeMatchId) {
        setActiveMatchId(match.rematchMatchId);
        const rematch = await fetchMatchState(match.rematchMatchId);
        if (rematch) {
          setActiveMatchMeta(rematch);
          setMatchState(rematch.state);
          setIsAnimatingShot(false);
          setPendingShotAnimation(null);
          setIsSubmittingRematch(false);
          lastSeenShotIdRef.current = null;
        }
        return;
      }

      setActiveMatchMeta(match);

      const anim = match.state.lastShotAnimation;
      const shotId = anim?.id ?? null;

      if (anim && shotId && shotId !== lastSeenShotIdRef.current && !isAnimatingShot) {
        lastSeenShotIdRef.current = shotId;
        setPendingShotAnimation(anim);
        setIsAnimatingShot(true);
        // Also update matchState so sync effect has correct state after animation
        setMatchState(match.state);
      } else if (!isAnimatingShot) {
        setMatchState((prev) => {
          if (prev && JSON.stringify(prev) === JSON.stringify(match.state)) return prev;
          return match.state;
        });
      }
    };

    pollRef.current = setInterval(() => void poll(), 1500);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [activeMatchId, fetchMatchState, isAnimatingShot]);

  const createMatch = useCallback(async (challenge: CachedChallenge) => {
    if (creatingForChallengeRef.current === challenge.id) return;
    creatingForChallengeRef.current = challenge.id;

    setIsCreatingMatch(true);
    setMatchError('');

    try {
      const res = await fetch('/api/matches/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeId: challenge.id,
          accessToken: challenge.accessToken,
          homePubkey: challenge.direction === 'outgoing' ? challenge.ownerPubkey : challenge.rivalPubkey,
          awayPubkey: challenge.direction === 'outgoing' ? challenge.rivalPubkey : challenge.ownerPubkey,
          mode: challenge.mode,
          amountSats: challenge.amountSats,
        }),
      });

      const data = await res.json() as { ok: boolean; matchId?: string; error?: string };

      if (!res.ok || !data.ok || !data.matchId) {
        setMatchError(data.error || 'No se pudo crear la partida.');
        creatingForChallengeRef.current = null;
        return;
      }

      setActiveMatchId(data.matchId);
      const match = await fetchMatchState(data.matchId);
      if (match) {
        setActiveMatchMeta(match);
        setMatchState(match.state);
      }
    } catch {
      setMatchError('No se pudo conectar con el servidor.');
      creatingForChallengeRef.current = null;
    } finally {
      setIsCreatingMatch(false);
    }
  }, [fetchMatchState]);

  const submitShot = useCallback(async (playerIndex: number, velX: number, velY: number) => {
    const currentMatchState = matchStateRef.current;
    if (!activeMatchId || !currentMatchState || !activeMatchMeta) return;

    // Start animation immediately (game loop will run simulateStep on current state)
    setIsAnimatingShot(true);

    const actingPubkey = currentMatchState.turn === 'home' ? activeMatchMeta.homePubkey : activeMatchMeta.awayPubkey;

    try {
      const res = await fetch('/api/matches/shot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchId: activeMatchId,
          actingPubkey,
          playerIndex,
          velX,
          velY,
        }),
      });

      const data = await res.json() as { ok: boolean; state?: MatchState; error?: string };

      if (!res.ok || !data.ok) {
        if (res.status === 409) {
          await refreshMatchState();
          setMatchError(data.error || 'Turno desincronizado, estado actualizado.');
        } else {
          setMatchError(data.error || 'No se pudo enviar el tiro.');
        }
        setIsAnimatingShot(false);
        return;
      }

      if (data.state) {
        // Store server state for sync after animation
        setMatchState(data.state);
        // Mark this shot as seen so polling doesn't re-detect it
        const anim = data.state.lastShotAnimation;
        if (anim) {
          lastSeenShotIdRef.current = anim.id;
        }
        // Don't set pendingShotAnimation - animation already running locally
      }
    } catch {
      setMatchError('No se pudo conectar con el servidor.');
      setIsAnimatingShot(false);
    }
  }, [activeMatchId, activeMatchMeta, refreshMatchState]);

  const requestRematch = useCallback(async (requesterPubkey: string) => {
    if (!activeMatchId || !activeMatchMeta || !matchStateRef.current || !requesterPubkey) return;
    setIsSubmittingRematch(true);
    setMatchError('');
    try {
      const res = await fetch('/api/matches/rematch-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId: activeMatchId, requesterPubkey }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        if (res.status === 409) {
          await refreshMatchState();
          return;
        }
        setMatchError(data.error || 'No se pudo pedir revancha.');
        return;
      }
      await refreshMatchState();
    } catch {
      setMatchError('No se pudo conectar con el servidor.');
    } finally {
      setIsSubmittingRematch(false);
    }
  }, [activeMatchId, activeMatchMeta, refreshMatchState]);

  const acceptRematch = useCallback(async (accepterPubkey: string) => {
    if (!activeMatchId || !activeMatchMeta || !matchStateRef.current || !accepterPubkey) return;
    setIsSubmittingRematch(true);
    setMatchError('');
    try {
      const res = await fetch('/api/matches/rematch-accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId: activeMatchId, accepterPubkey }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setMatchError(data.error || 'No se pudo aceptar la revancha.');
        return;
      }
      await refreshMatchState();
    } catch {
      setMatchError('No se pudo conectar con el servidor.');
    } finally {
      setIsSubmittingRematch(false);
    }
  }, [activeMatchId, activeMatchMeta, refreshMatchState]);

  const rejectRematch = useCallback(async (rejecterPubkey: string) => {
    if (!activeMatchId || !activeMatchMeta || !matchStateRef.current || !rejecterPubkey) return;
    setIsSubmittingRematch(true);
    setMatchError('');
    try {
      const res = await fetch('/api/matches/rematch-reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId: activeMatchId, rejecterPubkey }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setMatchError(data.error || 'No se pudo rechazar la revancha.');
        return;
      }
      await refreshMatchState();
    } catch {
      setMatchError('No se pudo conectar con el servidor.');
    } finally {
      setIsSubmittingRematch(false);
    }
  }, [activeMatchId, activeMatchMeta, refreshMatchState]);

  const value = {
    activeMatchId,
    activeMatchMeta,
    matchState,
    matchError,
    isCreatingMatch,
    isAnimatingShot,
    pendingShotAnimation,
    isSubmittingRematch,
    createMatch,
    submitShot,
    requestRematch,
    acceptRematch,
    rejectRematch,
    clearMatch,
    refreshMatchState,
    finishShotAnimation,
  };

  return <MatchContext.Provider value={value}>{children}</MatchContext.Provider>;
}

export function useMatchStore() {
  const context = useContext(MatchContext);
  if (!context) {
    throw new Error('useMatchStore must be used within MatchProvider');
  }
  return context;
}
