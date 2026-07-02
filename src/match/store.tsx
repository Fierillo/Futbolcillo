import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import PartySocket from 'partysocket';
import type { CachedChallenge } from '../challenge/types';
import { getPartyKitHost } from '../config/partykit-host';
import type { MatchState, ShotAnimation } from '../game/physics';
import type { ActiveMatchSnapshot, MatchClientEvent, MatchControlAction, MatchServerEvent } from '../../shared/match-realtime.ts';
import { sendMatchNotification } from '../nostr/client';
import { useNostrSession } from '../nostr/session-store';

type ActiveMatch = ActiveMatchSnapshot;

interface MatchContextValue {
  activeMatchId: string | null;
  matchState: MatchState | null;
  activeMatchMeta: ActiveMatch | null;
  matchError: string;
  isCreatingMatch: boolean;
  isSubmittingShot: boolean;
  isAnimatingShot: boolean;
  pendingShotAnimation: ShotAnimation | null;
  isSubmittingRematch: boolean;
  rematchChallengeId: string | null;
  interactionResetNonce: number;
  createMatch: (challenge: CachedChallenge) => Promise<void>;
  submitShot: (playerTeam: 'home' | 'away', playerNumber: number, velX: number, velY: number) => Promise<void>;
  requestRematch: (requesterPubkey: string) => Promise<void>;
  acceptRematch: (accepterPubkey: string) => Promise<void>;
  rejectRematch: (rejecterPubkey: string) => Promise<void>;
  terminateMatch: (terminatedBy: string) => Promise<void>;
  clearMatch: () => void;
  clearLocalInteraction: () => void;
  refreshMatchState: () => Promise<void>;
  finishShotAnimation: () => void;
  clearRematchChallengeId: () => void;
}

const MatchContext = createContext<MatchContextValue | null>(null);

export function MatchProvider({ children }: { children: ReactNode }) {
  const { session } = useNostrSession();
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [activeMatchMeta, setActiveMatchMeta] = useState<ActiveMatch | null>(null);
  const [matchState, setMatchState] = useState<MatchState | null>(null);
  const [matchError, setMatchError] = useState('');
  const [isCreatingMatch, setIsCreatingMatch] = useState(false);
  const [isSubmittingShot, setIsSubmittingShot] = useState(false);
  const [isAnimatingShot, setIsAnimatingShot] = useState(false);
  const [pendingShotAnimation, setPendingShotAnimation] = useState<ShotAnimation | null>(null);
  const [isSubmittingRematch, setIsSubmittingRematch] = useState(false);
  const [rematchChallengeId, setRematchChallengeId] = useState<string | null>(null);
  const [interactionResetNonce, setInteractionResetNonce] = useState(0);
  const socketRef = useRef<PartySocket | null>(null);
  const activeMatchIdRef = useRef<string | null>(null);
  const activeMatchMetaRef = useRef<ActiveMatch | null>(null);
  const matchStateRef = useRef<MatchState | null>(null);
  const isAnimatingShotRef = useRef(false);
  const lastSeenShotIdRef = useRef<string | null>(null);
  const creatingForChallengeRef = useRef<string | null>(null);
  const localPubkeyRef = useRef('');
  const sessionNameRef = useRef('Alguien');

  useEffect(() => {
    activeMatchIdRef.current = activeMatchId;
  }, [activeMatchId]);

  useEffect(() => {
    activeMatchMetaRef.current = activeMatchMeta;
  }, [activeMatchMeta]);

  useEffect(() => {
    matchStateRef.current = matchState;
  }, [matchState]);

  useEffect(() => {
    isAnimatingShotRef.current = isAnimatingShot;
  }, [isAnimatingShot]);

  useEffect(() => {
    localPubkeyRef.current = session.profile?.pubkey || '';
    sessionNameRef.current = session.profile?.name || 'Alguien';
  }, [session.profile?.name, session.profile?.pubkey]);

  const closeSocket = useCallback(() => {
    if (!socketRef.current) return;
    const socket = socketRef.current;
    socketRef.current = null;
    socket.close();
  }, []);

  const clearLocalInteraction = useCallback(() => {
    setInteractionResetNonce((value) => value + 1);
  }, []);

  const clearMatch = useCallback(() => {
    closeSocket();
    setActiveMatchId(null);
    setActiveMatchMeta(null);
    activeMatchMetaRef.current = null;
    setMatchState(null);
    matchStateRef.current = null;
    setMatchError('');
    setIsCreatingMatch(false);
    setIsSubmittingShot(false);
    setIsAnimatingShot(false);
    isAnimatingShotRef.current = false;
    setPendingShotAnimation(null);
    setIsSubmittingRematch(false);
    setRematchChallengeId(null);
    lastSeenShotIdRef.current = null;
    creatingForChallengeRef.current = null;
  }, [closeSocket]);

  useEffect(() => () => closeSocket(), [closeSocket]);

  const notifyOpponent = useCallback((action: MatchControlAction, actorPubkey: string, match: ActiveMatch) => {
    if (actorPubkey !== localPubkeyRef.current) return;

    const opponentPubkey = actorPubkey === match.homePubkey ? match.awayPubkey : match.homePubkey;
    if (!opponentPubkey) return;

    void sendMatchNotification(opponentPubkey, action, match.id, sessionNameRef.current);
  }, []);

  const applyMatchSnapshot = useCallback((nextMatch: ActiveMatch, animation: ShotAnimation | null = null) => {
    setActiveMatchMeta(nextMatch);
    activeMatchMetaRef.current = nextMatch;

    if (nextMatch.rematchMatchId && nextMatch.nextChallengeId) {
      setRematchChallengeId(nextMatch.nextChallengeId);
    }

    const anim = animation;
    const shotId = anim?.id ?? null;

    if (anim && shotId && shotId !== lastSeenShotIdRef.current && !isAnimatingShotRef.current) {
      lastSeenShotIdRef.current = shotId;
      setPendingShotAnimation(anim);
      setIsAnimatingShot(true);
      isAnimatingShotRef.current = true;
      setMatchState(nextMatch.state);
      matchStateRef.current = nextMatch.state;
      return;
    }

    if (!isAnimatingShotRef.current) {
      setMatchState((prev) => {
        if (prev && JSON.stringify(prev) === JSON.stringify(nextMatch.state)) return prev;
        return nextMatch.state;
      });
      matchStateRef.current = nextMatch.state;
    }
  }, []);

  const handleServerEvent = useCallback((event: MatchServerEvent) => {
    if (event.type === 'match.snapshot') {
      creatingForChallengeRef.current = null;
      setIsCreatingMatch(false);
      setMatchError('');
      applyMatchSnapshot(event.match);
      return;
    }

    if (event.type === 'shot.resolved') {
      creatingForChallengeRef.current = null;
      setIsCreatingMatch(false);
      setIsSubmittingShot(false);
      setMatchError('');
      applyMatchSnapshot(event.match, event.shotAnimation);
      return;
    }

    if (event.type === 'control.resolved') {
      creatingForChallengeRef.current = null;
      setIsCreatingMatch(false);
      setIsSubmittingRematch(false);
      setMatchError('');
      applyMatchSnapshot(event.match);
      notifyOpponent(event.action, event.actorPubkey, event.match);
      return;
    }

    creatingForChallengeRef.current = null;
    setIsCreatingMatch(false);
    setIsSubmittingShot(false);
    setIsSubmittingRematch(false);
    if (event.match) {
      applyMatchSnapshot(event.match);
    }
    clearLocalInteraction();
    setMatchError(event.message);
  }, [applyMatchSnapshot, clearLocalInteraction, notifyOpponent]);

  const connectMatchSocket = useCallback((matchId: string, accessToken: string, pubkey: string) => {
    const host = getPartyKitHost();
    if (!host) {
      setIsCreatingMatch(false);
      setMatchError('Falta configurar VITE_PARTYKIT_HOST para el multijugador.');
      return;
    }

    closeSocket();

    const socket = new PartySocket({
      host,
      room: matchId,
      party: 'main',
      query: {
        accessToken,
        pubkey,
      },
    });

    socket.addEventListener('open', () => {
      setMatchError('');
    });

    socket.addEventListener('message', (messageEvent) => {
      try {
        handleServerEvent(JSON.parse(String(messageEvent.data)) as MatchServerEvent);
      } catch {
        setMatchError('Llegó un mensaje inválido del servidor realtime.');
      }
    });

    socket.addEventListener('close', () => {
      if (socketRef.current !== socket) return;
      if (!activeMatchMetaRef.current || activeMatchMetaRef.current.status !== 'active') return;
      setMatchError('Se perdió la conexión realtime de la partida.');
    });

    socket.addEventListener('error', () => {
      if (socketRef.current !== socket) return;
      setMatchError('No se pudo conectar con el servidor realtime.');
    });

    socketRef.current = socket;
  }, [closeSocket, handleServerEvent]);

  const sendSocketEvent = useCallback((event: MatchClientEvent) => {
    const socket = socketRef.current;
    if (!socket) {
      setMatchError('La partida no tiene una conexión realtime activa.');
      return false;
    }

    try {
      socket.send(JSON.stringify(event));
      return true;
    } catch {
      setMatchError('No se pudo enviar el mensaje realtime.');
      return false;
    }
  }, []);

  const refreshMatchState = useCallback(async () => {
    sendSocketEvent({ type: 'sync-request' });
  }, [sendSocketEvent]);

  const finishShotAnimation = useCallback(() => {
    setPendingShotAnimation(null);
    setIsAnimatingShot(false);
    isAnimatingShotRef.current = false;
  }, []);

  const clearRematchChallengeId = useCallback(() => {
    setRematchChallengeId(null);
  }, []);

  const createMatch = useCallback(async (challenge: CachedChallenge) => {
    if (creatingForChallengeRef.current === challenge.id) return;

    const localPubkey = localPubkeyRef.current;
    if (!localPubkey) {
      setMatchError('Conectá tu identidad antes de iniciar el multijugador.');
      return;
    }

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
          homeName: challenge.direction === 'outgoing' ? (session.profile?.name || 'Local') : challenge.rivalName,
          awayName: challenge.direction === 'outgoing' ? challenge.rivalName : (session.profile?.name || 'Local'),
          mode: challenge.mode,
          amountSats: challenge.amountSats,
        }),
      });

      const data = await res.json() as { ok: boolean; matchId?: string; error?: string };
      if (!res.ok || !data.ok || !data.matchId) {
        setIsCreatingMatch(false);
        setMatchError(data.error || 'No se pudo crear la partida.');
        creatingForChallengeRef.current = null;
        return;
      }

      setActiveMatchId(data.matchId);
      connectMatchSocket(data.matchId, challenge.accessToken, localPubkey);
    } catch {
      setIsCreatingMatch(false);
      setMatchError('No se pudo conectar con el servidor.');
      creatingForChallengeRef.current = null;
    }
  }, [connectMatchSocket, session.profile?.name]);

  const submitShot = useCallback(async (playerTeam: 'home' | 'away', playerNumber: number, velX: number, velY: number) => {
    const currentMatchState = matchStateRef.current;
    if (!activeMatchIdRef.current || !currentMatchState) return;
    if (isSubmittingShot) return;

    const playerIndex = currentMatchState.players.findIndex((player) => player.team === playerTeam && player.number === playerNumber);
    if (playerIndex === -1) {
      setMatchError('No se encontró el disco seleccionado en el estado actual.');
      return;
    }

    setIsSubmittingShot(true);
    setMatchError('');
    if (!sendSocketEvent({ type: 'shot', playerIndex, velX, velY })) {
      setIsSubmittingShot(false);
    }
  }, [isSubmittingShot, sendSocketEvent]);

  const requestRematch = useCallback(async (requesterPubkey: string) => {
    if (!activeMatchMetaRef.current || !matchStateRef.current || !requesterPubkey) return;

    setIsSubmittingRematch(true);
    setMatchError('');
    if (!sendSocketEvent({ type: 'rematch-request', requesterPubkey })) {
      setIsSubmittingRematch(false);
    }
  }, [sendSocketEvent]);

  const acceptRematch = useCallback(async (accepterPubkey: string) => {
    if (!activeMatchMetaRef.current || !matchStateRef.current || !accepterPubkey) return;

    setIsSubmittingRematch(true);
    setMatchError('');
    if (!sendSocketEvent({ type: 'rematch-accept', accepterPubkey })) {
      setIsSubmittingRematch(false);
    }
  }, [sendSocketEvent]);

  const rejectRematch = useCallback(async (rejecterPubkey: string) => {
    if (!activeMatchMetaRef.current || !matchStateRef.current || !rejecterPubkey) return;

    setIsSubmittingRematch(true);
    setMatchError('');
    if (!sendSocketEvent({ type: 'rematch-reject', rejecterPubkey })) {
      setIsSubmittingRematch(false);
    }
  }, [sendSocketEvent]);

  const terminateMatch = useCallback(async (terminatedBy: string) => {
    if (!activeMatchMetaRef.current || !terminatedBy) return;

    setMatchError('');
    sendSocketEvent({ type: 'terminate', terminatedBy });
  }, [sendSocketEvent]);

  const value = {
    activeMatchId,
    activeMatchMeta,
    matchState,
    matchError,
    isCreatingMatch,
    isSubmittingShot,
    isAnimatingShot,
    pendingShotAnimation,
    isSubmittingRematch,
    rematchChallengeId,
    createMatch,
    submitShot,
    requestRematch,
    acceptRematch,
    rejectRematch,
    terminateMatch,
    clearMatch,
    clearLocalInteraction,
    refreshMatchState,
    finishShotAnimation,
    clearRematchChallengeId,
    interactionResetNonce,
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
