import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { MatchState } from '../game/physics';
import type { CachedChallenge } from '../challenge/types';

type ActiveMatch = {
  id: string;
  status: string;
  homePubkey: string;
  awayPubkey: string;
  state: MatchState;
};

interface MatchContextValue {
  activeMatchId: string | null;
  matchState: MatchState | null;
  matchError: string;
  isCreatingMatch: boolean;
  createMatch: (challenge: CachedChallenge) => Promise<void>;
  submitShot: (playerIndex: number, velX: number, velY: number) => Promise<void>;
  clearMatch: () => void;
  refreshMatchState: () => Promise<void>;
}

const MatchContext = createContext<MatchContextValue | null>(null);

export function MatchProvider({ children }: { children: ReactNode }) {
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [activeMatchMeta, setActiveMatchMeta] = useState<ActiveMatch | null>(null);
  const [matchState, setMatchState] = useState<MatchState | null>(null);
  const [matchError, setMatchError] = useState('');
  const [isCreatingMatch, setIsCreatingMatch] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearMatch = useCallback(() => {
    setActiveMatchId(null);
    setActiveMatchMeta(null);
    setMatchState(null);
    setMatchError('');
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
      setMatchState(match.state);
      if (match.status === 'finished') {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }
    }
  }, [activeMatchId, fetchMatchState]);

  useEffect(() => {
    if (!activeMatchId) return;

    const poll = async () => {
      const match = await fetchMatchState(activeMatchId);
      if (match) {
        setActiveMatchMeta(match);
        setMatchState(match.state);
        if (match.status === 'finished' && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }
    };

    pollRef.current = setInterval(() => void poll(), 1500);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [activeMatchId, fetchMatchState]);

  const createMatch = useCallback(async (challenge: CachedChallenge) => {
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
        }),
      });

      const data = await res.json() as { ok: boolean; matchId?: string; error?: string };

      if (!res.ok || !data.ok || !data.matchId) {
        setMatchError(data.error || 'No se pudo crear la partida.');
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
    } finally {
      setIsCreatingMatch(false);
    }
  }, [fetchMatchState]);

  const submitShot = useCallback(async (playerIndex: number, velX: number, velY: number) => {
    if (!activeMatchId || !matchState || !activeMatchMeta) return;

    const actingPubkey = matchState.turn === 'home' ? activeMatchMeta.homePubkey : activeMatchMeta.awayPubkey;

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
        setMatchError(data.error || 'No se pudo enviar el tiro.');
        return;
      }

      if (data.state) {
        setMatchState(data.state);
      }
    } catch {
      setMatchError('No se pudo conectar con el servidor.');
    }
  }, [activeMatchId, matchState, activeMatchMeta]);

  const value = {
    activeMatchId,
    matchState,
    matchError,
    isCreatingMatch,
    createMatch,
    submitShot,
    clearMatch,
    refreshMatchState,
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
