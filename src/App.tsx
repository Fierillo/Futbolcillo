import { useState, useEffect, useRef, useCallback } from 'react';
import { Goal, LoaderCircle, Swords, Trophy, RotateCcw, Info, X, Volume2, VolumeX } from 'lucide-react';
import { useChallengeStore } from './challenge/store';
import TejoCanvas from './game/TejoCanvas';
import { preparePhaseOneInfrastructure, usePhaseOneBoot } from './app/use-phase-one-boot';
import {
  createInitialState,
  updateGame,
  handleMouseDown,
  handleMouseMove,
  handleMouseUp,
} from './game/engine';
import { simulateStep } from './game/physics';
import type { MatchState } from './game/physics';
import { GameState, FIELD_WIDTH, FIELD_HEIGHT } from './game/types';
import { NostrGatewayModal } from './nostr/NostrGatewayModal';
import { useNostrSession } from './nostr/session-store';
import { getNostrClient, sendMatchNotification } from './nostr/client';
import { GlobalSyncStatus } from './online/GlobalSyncStatus';
import { useSyncStatus } from './online/sync-store';
import { useMatchStore } from './match/store';
import { cacheDb } from './cache/db';

export default function App() {
  const [gameState, setGameState] = useState<GameState>(createInitialState);
  const [showHelp, setShowHelp] = useState(true);
  const [showNostrGateway, setShowNostrGateway] = useState(false);
  const [linkedChallengeId, setLinkedChallengeId] = useState('');
  const [linkedChallengeToken, setLinkedChallengeToken] = useState('');
  const [linkedChallengeOwner, setLinkedChallengeOwner] = useState('');
  const [muted, setMuted] = useState(false);
  const [scale, setScale] = useState(1);
  const [isMobilePortrait, setIsMobilePortrait] = useState(false);
  const [terminationNotice, setTerminationNotice] = useState('');
  const gameStateRef = useRef<GameState>(gameState);
  const previousPhaseRef = useRef<GameState['phase']>(gameState.phase);
  const animFrameRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastHandledTerminationRef = useRef<string | null>(null);
  const { setSyncState } = useSyncStatus();
  const { session, refreshProfile } = useNostrSession();
  const { activeChallenge, pendingIncomingCount, clearActiveChallenge, finalizeChallengeWithResult, setActiveChallengeById } = useChallengeStore();
  const { activeMatchId, activeMatchMeta, matchState, matchError, isCreatingMatch, isAnimatingShot, pendingShotAnimation, isSubmittingRematch, rematchChallengeId, createMatch, submitShot, requestRematch, acceptRematch, clearMatch, finishShotAnimation, clearRematchChallengeId } = useMatchStore();
  const localTeam = activeChallenge?.direction === 'incoming' ? 'away' : activeChallenge?.direction === 'outgoing' ? 'home' : null;
  const localPubkey = session.profile?.pubkey || '';

  const terminateMatch = useCallback(async () => {
    if (!activeMatchId || !localPubkey) return;

    const rivalPubkey = activeChallenge?.direction === 'outgoing'
      ? activeChallenge.rivalPubkey
      : activeChallenge?.direction === 'incoming'
        ? activeChallenge.sourceOwnerPubkey || activeChallenge.ownerPubkey
        : null;

    try {
      await fetch('/api/matches/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'terminate', matchId: activeMatchId, terminatedBy: localPubkey }),
      });
    } catch {
      // ignore
    }

    if (rivalPubkey) {
      const senderName = session.profile?.name || 'Alguien';
      void sendMatchNotification(rivalPubkey, 'terminate', activeMatchId, senderName);
    }

    if (activeChallenge?.id) {
      try {
        await cacheDb.challenges.update(activeChallenge.id, {
          state: 'terminated',
          updatedAt: Date.now(),
        });
      } catch {
        // ignore
      }
    }
    clearMatch();
    clearActiveChallenge();
    setGameState(createInitialState());
  }, [activeMatchId, localPubkey, activeChallenge, clearMatch, clearActiveChallenge, session.profile?.name]);

  usePhaseOneBoot();

  useEffect(() => {
    if (session.status === 'connected') {
      setSyncState({
        status: 'ready',
        label: 'Nostr activo',
        detail: `Perfil listo para ${session.profile?.name || 'tu usuario'}.`,
      });
    }
  }, [session.status, session.profile, setSyncState]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const challengeId = params.get('challenge') || '';
    const challengeToken = params.get('token') || '';
    const challengeOwner = params.get('owner') || '';
    if (!challengeId || !challengeToken) return;

    setLinkedChallengeId(challengeId);
    setLinkedChallengeToken(challengeToken);
    setLinkedChallengeOwner(challengeOwner);
    setShowNostrGateway(true);
  }, []);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  const lastProcessedChallengeRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activeChallenge) return;
    if (lastProcessedChallengeRef.current === activeChallenge.id) return;
    lastProcessedChallengeRef.current = activeChallenge.id;

    setGameState(createInitialState());
    setShowHelp(false);

    if (activeChallenge.state === 'accepted' || activeChallenge.state === 'in_match') {
      void createMatch(activeChallenge);
    }
  }, [activeChallenge, createMatch]);

  useEffect(() => {
    if (!activeMatchId) return;
    setShowNostrGateway(false);
  }, [activeMatchId]);

  useEffect(() => {
    if (activeMatchId) {
      lastHandledTerminationRef.current = null;
    }
  }, [activeMatchId]);

  useEffect(() => {
    if (!activeMatchId || !activeMatchMeta || activeMatchMeta.status !== 'terminated') return;
    if (lastHandledTerminationRef.current === activeMatchId) return;
    lastHandledTerminationRef.current = activeMatchId;

    const notice = activeMatchMeta.terminatedBy === localPubkey
      ? 'Terminaste la partida.'
      : 'El rival terminó la partida.';

    const terminateLocally = async () => {
      if (activeChallenge?.id) {
        try {
          await cacheDb.challenges.update(activeChallenge.id, {
            state: 'terminated',
            updatedAt: Date.now(),
          });
        } catch {
          // ignore
        }
      }

      clearMatch();
      clearActiveChallenge();
      setGameState(createInitialState());
      setTerminationNotice(notice);
      window.setTimeout(() => setTerminationNotice(''), 3000);
    };

    void terminateLocally();
  }, [activeMatchId, activeMatchMeta, activeChallenge, localPubkey, clearMatch, clearActiveChallenge]);

  // Finalize challenge when match finishes with a winner
  const lastFinalizedChallengeRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeMatchId || !activeMatchMeta || !activeChallenge?.id) return;
    if (activeMatchMeta.status !== 'finished') return;
    if (lastFinalizedChallengeRef.current === activeChallenge.id) return;

    // Use matchState (from server) instead of gameState to avoid race condition
    const serverScore = matchState?.score;
    const serverWinner = matchState?.winner;
    if (!serverScore || !serverWinner) return;

    lastFinalizedChallengeRef.current = activeChallenge.id;

    const winnerPubkey = serverWinner === 'home'
      ? (activeChallenge.direction === 'outgoing' ? localPubkey : activeChallenge.rivalPubkey)
      : serverWinner === 'away'
        ? (activeChallenge.direction === 'outgoing' ? activeChallenge.rivalPubkey : localPubkey)
        : null;

    void finalizeChallengeWithResult(
      activeChallenge.id,
      winnerPubkey,
      serverScore.home,
      serverScore.away,
    );
  }, [activeMatchId, activeMatchMeta, activeChallenge, matchState, localPubkey, finalizeChallengeWithResult]);

  // When rematch starts, load the new challenge
  const lastRematchChallengeRef = useRef<string | null>(null);
  useEffect(() => {
    if (!rematchChallengeId) return;
    if (lastRematchChallengeRef.current === rematchChallengeId) return;
    lastRematchChallengeRef.current = rematchChallengeId;
    void setActiveChallengeById(rematchChallengeId);
    clearRematchChallengeId();
  }, [rematchChallengeId, setActiveChallengeById, clearRematchChallengeId]);

  // Fetch rival Nostr profile for avatar when match starts
  const [rivalAvatarUrl, setRivalAvatarUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!activeChallenge || !activeMatchId) {
      setRivalAvatarUrl(null);
      return;
    }

    const rivalPubkey = activeChallenge.rivalPubkey;
    if (!rivalPubkey) return;

    let cancelled = false;

    const fetchRivalProfile = async () => {
      // Check Dexie cache first
      const cached = await cacheDb.profiles.get(rivalPubkey);
      if (cached?.avatarUrl && !cancelled) {
        setRivalAvatarUrl(cached.avatarUrl);
        return;
      }

      try {
        const ndk = getNostrClient();
        await ndk.connect(1500);
        const user = ndk.getUser({ pubkey: rivalPubkey });
        const profile = await user.fetchProfile();
        if (cancelled) return;

        const avatarUrl = profile?.image || profile?.picture || '';
        if (avatarUrl) {
          setRivalAvatarUrl(avatarUrl);
          // Cache for next time
          await cacheDb.profiles.put({
            pubkey: rivalPubkey,
            avatarUrl,
            displayName: profile?.displayName || profile?.name || '',
            nip05: profile?.nip05 || '',
            lud16: profile?.lud16 || '',
            updatedAt: Date.now(),
          });
        }
      } catch {
        // Relay fetch failed, keep DiceBear fallback
      }
    };

    void fetchRivalProfile();
    return () => { cancelled = true; };
  }, [activeChallenge, activeMatchId]);

  // Responsive scaling
  useEffect(() => {
    const updateScale = () => {
      if (!containerRef.current) return;
      const containerWidth = containerRef.current.clientWidth - 32;
      const containerTop = containerRef.current.getBoundingClientRect().top;
      const containerHeight = Math.max(window.innerHeight - containerTop - 24, 240);
      const isPortrait = window.innerWidth < 640 && window.innerHeight > window.innerWidth;
      setIsMobilePortrait(isPortrait);

      // Scale is always based on fitting FIELD_WIDTH x FIELD_HEIGHT into the container
      // The rotation is handled by CSS transform, so visual dimensions are always FIELD_WIDTH * scale x FIELD_HEIGHT * scale
      const scaleX = containerWidth / FIELD_WIDTH;
      const scaleY = containerHeight / FIELD_HEIGHT;
      setScale(Math.min(scaleX, scaleY, 1));
    };
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, []);

  // Sync server state to local game state when in online mode
  useEffect(() => {
    if (!matchState || !activeMatchId || isAnimatingShot) return;

    setGameState((prev) => {
      const next = { ...prev };
      next.players = matchState.players.map((p) => ({
        ...p,
        isSelected: false,
        cooldown: 0,
        color: p.team === 'away' ? '#b91c1c' : '#1e40af',
        strokeColor: p.team === 'away' ? '#f87171' : '#60a5fa',
      }));
      next.ball = {
        ...matchState.ball,
        color: '#fbbf24',
        strokeColor: '#f59e0b',
      };
      next.goals = matchState.goals;
      next.score = { ...matchState.score };
      next.turn = matchState.turn;
      next.phase = matchState.phase;
      next.winner = matchState.winner;
      next.activeShotPlayer = matchState.activeShotPlayer;
      next.activeShotTouchedBall = matchState.activeShotTouchedBall;
      next.activeShotCommittedFoul = matchState.activeShotCommittedFoul;
      next.bonusTurnTeam = matchState.bonusTurnTeam;
      next.pendingBonusTurns = matchState.pendingBonusTurns;
      next.lastShot = matchState.lastShot;
      next.lastShotAnimation = matchState.lastShotAnimation;
      return next;
    });
  }, [matchState, activeMatchId, isAnimatingShot]);

  // Detect when shot animation finishes only on a real transition shooting -> aiming.
  useEffect(() => {
    const previousPhase = previousPhaseRef.current;
    if (
      isAnimatingShot &&
      shotInitializedRef.current &&
      previousPhase === 'shooting' &&
      gameState.phase === 'aiming'
    ) {
      shotInitializedRef.current = false;
      finishShotAnimation();
    }
    previousPhaseRef.current = gameState.phase;
  }, [gameState.phase, isAnimatingShot, finishShotAnimation]);

  // Game loop (runs in training mode, during online shot animations, and while visual effects are active)
  const shotInitializedRef = useRef(false);

  useEffect(() => {
    if (activeMatchId && !isAnimatingShot && gameState.messageTimer <= 0 && gameState.cameraShake <= 0 && !gameState.winner) {
      shotInitializedRef.current = false;
      return;
    }

    let lastTime = performance.now();

    const loop = (time: number) => {
      const dt = Math.min((time - lastTime) / 16.67, 3);
      lastTime = time;

      setGameState((prev) => {
        const next = { ...prev };
        next.players = prev.players.map((p) => ({ ...p }));
        next.particles = prev.particles.map((p) => ({ ...p }));
        next.ball = { ...prev.ball, trail: [...prev.ball.trail] };
        next.goals = [...prev.goals];
        next.score = { ...prev.score };
        next.dragStart = prev.dragStart ? { ...prev.dragStart } : null;
        next.dragCurrent = prev.dragCurrent ? { ...prev.dragCurrent } : null;

        if (isAnimatingShot) {
          if (!shotInitializedRef.current && pendingShotAnimation) {
            shotInitializedRef.current = true;
            const anim = pendingShotAnimation;
            const init = anim.initialState;

            next.players = init.players.map((p) => ({
              ...p,
              isSelected: false,
              cooldown: 0,
              color: p.team === 'away' ? '#b91c1c' : '#1e40af',
              strokeColor: p.team === 'away' ? '#f87171' : '#60a5fa',
            }));
            next.ball = { ...init.ball, color: '#fbbf24', strokeColor: '#f59e0b' };
            next.goals = [...init.goals];
            next.score = { ...init.score };
            next.turn = init.turn;
            next.phase = 'shooting';
            next.winner = init.winner;
            next.activeShotPlayer = anim.playerIndex;
            next.activeShotTouchedBall = false;
            next.activeShotCommittedFoul = false;
            next.bonusTurnTeam = init.bonusTurnTeam;
            next.pendingBonusTurns = init.pendingBonusTurns;
            next.lastShot = init.lastShot;
            next.lastShotAnimation = init.lastShotAnimation;
            next.dragStart = null;
            next.dragCurrent = null;
            next.selectedPlayer = null;

            const player = next.players[anim.playerIndex];
            if (player) {
              next.players[anim.playerIndex] = {
                ...player,
                vel: { x: anim.velX, y: anim.velY },
              };
            }
          }

          // Run one physics step (same code as server)
          const scoreBefore = { ...next.score };
          const winnerBefore = next.winner;
          const foulBefore = next.activeShotCommittedFoul;
          simulateStep(next as unknown as MatchState);

          if (!foulBefore && next.activeShotCommittedFoul) {
            const foulTeam = next.activeShotPlayer !== null ? next.players[next.activeShotPlayer]?.team : null;
            const foulVictim = foulTeam === 'home' ? awayAlias : homeAlias;
            next.message = `¡Falta! ${foulVictim.toUpperCase()} gana dos jugadas.`;
            next.messageTimer = 120;
            next.cameraShake = 6;
          }

          if (next.score.home !== scoreBefore.home || next.score.away !== scoreBefore.away) {
            const goalScorer = next.score.home !== scoreBefore.home ? 'home' : 'away';
            const scorerName = goalScorer === 'home' ? homeAlias : awayAlias;
            next.message = `¡GOL DE ${scorerName.toUpperCase()}!`;
            next.messageTimer = 120;
            next.cameraShake = 12;
          }

          if (!winnerBefore && next.winner) {
            const winnerName = next.winner === 'home' ? homeAlias : awayAlias;
            next.message = `¡${winnerName.toUpperCase()} CAMPEÓN!`;
            next.messageTimer = 120;
            next.cameraShake = 12;
          }
        } else {
          updateGame(next, dt);
        }
        return next;
      });

      const shouldContinue = !activeMatchId || isAnimatingShot || gameStateRef.current.messageTimer > 0 || gameStateRef.current.cameraShake > 0;
      if (shouldContinue) {
        animFrameRef.current = requestAnimationFrame(loop);
      }
    };

    animFrameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [activeMatchId, isAnimatingShot]);

  const onMouseDown = useCallback((x: number, y: number) => {
    if (activeChallenge && gameStateRef.current.turn !== localTeam) return;

    setGameState((prev) => {
      const next = { ...prev };
      next.players = prev.players.map((p) => ({ ...p }));
      next.particles = prev.particles.map((p) => ({ ...p }));
      next.ball = { ...prev.ball, trail: [...prev.ball.trail] };
      next.goals = [...prev.goals];
      next.score = { ...prev.score };
      next.dragStart = prev.dragStart ? { ...prev.dragStart } : null;
      next.dragCurrent = prev.dragCurrent ? { ...prev.dragCurrent } : null;
      handleMouseDown(next, x, y);
      return next;
    });
  }, [activeChallenge, localTeam]);

  const onMouseMove = useCallback((x: number, y: number) => {
    if (activeChallenge && gameStateRef.current.turn !== localTeam) return;

    setGameState((prev) => {
      const next = { ...prev };
      next.players = prev.players.map((p) => ({ ...p }));
      next.particles = prev.particles.map((p) => ({ ...p }));
      next.ball = { ...prev.ball, trail: [...prev.ball.trail] };
      next.goals = [...prev.goals];
      next.score = { ...prev.score };
      next.dragStart = prev.dragStart ? { ...prev.dragStart } : null;
      next.dragCurrent = prev.dragCurrent ? { ...prev.dragCurrent } : null;
      handleMouseMove(next, x, y);
      return next;
    });
  }, [activeChallenge, localTeam]);

  const onMouseUp = useCallback(() => {
    if (activeChallenge && gameStateRef.current.turn !== localTeam) return;

    setGameState((prev) => {
      const selectedPlayer = prev.selectedPlayer !== null ? prev.players[prev.selectedPlayer] : null;
      const dragStart = prev.dragStart;
      const dragCurrent = prev.dragCurrent;
      const next = { ...prev };
      next.players = prev.players.map((p) => ({ ...p }));
      next.particles = prev.particles.map((p) => ({ ...p }));
      next.ball = { ...prev.ball, trail: [...prev.ball.trail] };
      next.goals = [...prev.goals];
      next.score = { ...prev.score };
      next.dragStart = prev.dragStart ? { ...prev.dragStart } : null;
      next.dragCurrent = prev.dragCurrent ? { ...prev.dragCurrent } : null;

      if (activeMatchId && selectedPlayer && dragStart && dragCurrent) {
        const dx = dragStart.x - dragCurrent.x;
        const dy = dragStart.y - dragCurrent.y;
        const power = Math.sqrt(dx * dx + dy * dy) * 0.15;
        const clampedPower = Math.max(0, Math.min(power, 18));

        if (clampedPower > 1) {
          const length = Math.sqrt(dx * dx + dy * dy) || 1;
          const velX = (dx / length) * clampedPower;
          const velY = (dy / length) * clampedPower;
          const playerIndex = next.players.findIndex((p) => p.team === selectedPlayer.team && p.number === selectedPlayer.number);
          if (playerIndex !== -1) {
            // Apply shot locally for immediate animation feedback
            // Uses same physics as server (simulateStep) so result should match
            shotInitializedRef.current = true;
            next.players[playerIndex] = { ...next.players[playerIndex], vel: { x: velX, y: velY } };
            next.phase = 'shooting';
            next.activeShotPlayer = playerIndex;
            next.activeShotTouchedBall = false;
            next.activeShotCommittedFoul = false;
            next.selectedPlayer = null;
            next.dragStart = null;
            next.dragCurrent = null;
            void submitShot(playerIndex, velX, velY);
          }
        } else {
          next.selectedPlayer = null;
          next.dragStart = null;
          next.dragCurrent = null;
        }
      } else {
        handleMouseUp(next);
      }

      return next;
    });
  }, [activeChallenge, activeMatchId, localTeam, submitShot]);

  const resetGame = () => {
    setGameState(createInitialState());
  };

  const retrySync = async () => {
      setSyncState({
        status: 'syncing',
        label: 'Reintentando',
        detail: 'Revisando caché local y capa Nostr.',
      });

    try {
      const nextState = await preparePhaseOneInfrastructure();
      setSyncState(nextState);
    } catch {
      setSyncState({
        status: 'error',
        label: 'Caché local',
        detail: 'No se pudo preparar la infraestructura Nostr local.',
      });
    }
  };

  const shortenPubkey = (value: string) => {
    if (!value) return '';
    if (value.length <= 16) return value;
    return `${value.slice(0, 8)}...${value.slice(-6)}`;
  };

  const homeAlias = activeChallenge?.direction === 'outgoing'
    ? session.profile?.name || 'Local'
    : activeChallenge?.direction === 'incoming'
      ? activeChallenge.rivalName || 'Rival'
      : 'Local';
  const awayAlias = activeChallenge?.direction === 'outgoing'
    ? activeChallenge.rivalName || 'Rival'
    : activeChallenge?.direction === 'incoming'
      ? session.profile?.name || 'Local'
      : 'Máquina';

  const turnText = activeChallenge
    ? gameState.turn === 'home'
      ? homeAlias.toUpperCase()
      : awayAlias.toUpperCase()
    : gameState.turn === 'home'
      ? 'LOCAL'
      : 'RIVAL';
  const turnColor = gameState.turn === 'home' ? 'text-blue-400' : 'text-red-400';
  const phaseText = gameState.phase === 'aiming' ? 'Apuntá y pateá' : 'En juego...';

  const rivalFallbackAvatar = `https://api.dicebear.com/9.x/bottts/svg?seed=${activeChallenge?.rivalPubkey || 'rival'}`;

  const homeIdentity = activeChallenge
    ? {
        name: homeAlias,
        pubkey: activeChallenge.direction === 'outgoing' ? session.profile?.pubkey || '' : activeChallenge.rivalPubkey,
        avatarUrl: activeChallenge.direction === 'outgoing'
          ? session.profile?.avatarUrl || `https://api.dicebear.com/9.x/shapes/svg?seed=${session.profile?.pubkey || 'local'}`
          : rivalAvatarUrl || rivalFallbackAvatar,
      }
    : session.profile;

  const awayIdentity = activeChallenge
    ? {
        name: awayAlias,
        pubkey: activeChallenge.direction === 'outgoing' ? activeChallenge.rivalPubkey : session.profile?.pubkey || '',
        avatarUrl: activeChallenge.direction === 'outgoing'
          ? rivalAvatarUrl || rivalFallbackAvatar
          : session.profile?.avatarUrl || `https://api.dicebear.com/9.x/shapes/svg?seed=${session.profile?.pubkey || 'away'}`,
      }
    : {
        name: 'Máquina',
        pubkey: 'training-bot',
        avatarUrl: 'https://api.dicebear.com/9.x/bottts/svg?seed=training-bot',
      };

  const winnerName = gameState.winner === 'home' ? homeAlias : awayAlias;
  const localWon = Boolean(activeChallenge && localTeam && gameState.winner && localTeam === gameState.winner);
  const rematchRequestedBy = activeMatchMeta?.rematchRequestedBy || null;
  const rematchMatchId = activeMatchMeta?.rematchMatchId || null;
  const rematchRejectedBy = activeMatchMeta?.rematchRejectedBy || null;
  const terminatedBy = activeMatchMeta?.terminatedBy || null;
  const terminatedBySelf = Boolean(localPubkey && terminatedBy === localPubkey);
  const terminatedByOther = Boolean(terminatedBy && localPubkey && terminatedBy !== localPubkey);
  const terminatorName = terminatedBy === homeIdentity?.pubkey ? homeAlias : terminatedBy === awayIdentity?.pubkey ? awayAlias : 'El rival';
  const rematchRequestedBySelf = Boolean(localPubkey && rematchRequestedBy === localPubkey);
  const rematchRequestedByOther = Boolean(rematchRequestedBy && localPubkey && rematchRequestedBy !== localPubkey);
  const rematchRequesterName = rematchRequestedBy === homeIdentity?.pubkey ? homeAlias : rematchRequestedBy === awayIdentity?.pubkey ? awayAlias : 'El rival';

  return (
    <div className="min-h-screen bg-stone-900 text-white flex flex-col items-center select-none">
      {/* Header */}
      <header className={`w-full max-w-5xl px-4 ${isMobilePortrait ? 'py-2 flex flex-col gap-2' : 'py-4 flex items-center justify-between'}`}>
        <div className={isMobilePortrait ? 'flex items-center justify-between' : ''}>
          <h1 className={`title-font text-amber-400 uppercase drop-shadow-[0_2px_0_rgba(0,0,0,0.35)] ${isMobilePortrait ? 'text-2xl leading-none tracking-[0.1em]' : 'text-4xl leading-none tracking-[0.14em] sm:text-5xl'}`}>
            Futbolcillo
          </h1>
          <p className={`${isMobilePortrait ? 'text-[10px] uppercase tracking-[0.15em] text-stone-500' : 'mt-1 text-xs uppercase tracking-[0.25em] text-stone-500'}`}>
            {isCreatingMatch
              ? 'Creando partida...'
              : activeMatchId
                ? `Turno de ${turnText.toLowerCase()}`
                : activeChallenge
                  ? activeChallenge.mode === 'wager'
                    ? `Partida en juego: ${activeChallenge.amountSats} sats`
                    : 'Partida amistosa activa'
                  : session.status === 'connected'
                    ? `Identidad lista: ${session.method === 'nip07' ? 'NIP-07' : 'Bunker'}`
                    : 'Modo entrenamiento activo'}
          </p>
        </div>

        <div className={`flex items-center gap-2 ${isMobilePortrait ? 'flex-wrap justify-center' : ''}`}>
          <GlobalSyncStatus onRetry={retrySync} />
          <button
            onClick={() => setShowNostrGateway(true)}
            className={`relative flex items-center gap-2 rounded-lg bg-emerald-700 text-sm font-bold uppercase tracking-wider text-white transition-colors hover:bg-emerald-600 ${isMobilePortrait ? 'px-2 py-1.5 text-xs' : 'px-3 py-2'}`}
          >
            {session.status === 'connected' ? <Swords size={14} /> : <Goal size={14} />}
            {session.status === 'connected' ? 'Desafíos' : 'Quiero Más'}
            {pendingIncomingCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                {pendingIncomingCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setMuted(!muted)}
            className={`rounded-lg bg-stone-800 hover:bg-stone-700 transition-colors ${isMobilePortrait ? 'p-1.5' : 'p-2'}`}
          >
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <button
            onClick={() => setShowHelp(true)}
            className={`rounded-lg bg-stone-800 hover:bg-stone-700 transition-colors ${isMobilePortrait ? 'p-1.5' : 'p-2'}`}
          >
            <Info size={16} />
          </button>
          <button
            onClick={resetGame}
            className={`rounded-lg bg-stone-800 hover:bg-stone-700 transition-colors ${isMobilePortrait ? 'p-1.5' : 'p-2'}`}
          >
            <RotateCcw size={16} />
          </button>
        </div>
      </header>

      {/* Scoreboard */}
      <div className={`w-full max-w-5xl px-4 ${isMobilePortrait ? 'mb-2' : 'mb-3'}`}>
        <div className={`grid items-center gap-3 rounded-xl bg-stone-800 shadow-lg ${isMobilePortrait ? 'grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] p-2' : 'grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] p-4'}`}>
          <div className={`flex min-w-0 items-center justify-self-start ${isMobilePortrait ? 'gap-2' : 'gap-3'}`}>
            <img
              src={awayIdentity?.avatarUrl || 'https://api.dicebear.com/9.x/bottts/svg?seed=training-bot'}
              alt={awayIdentity?.name || 'Visitante'}
              className={`rounded-full border border-red-500/40 bg-red-950 object-cover shadow-md ${isMobilePortrait ? 'w-8 h-8' : 'w-12 h-12'}`}
            />
            <div className="min-w-0">
              <p className={`truncate font-bold uppercase tracking-wider text-stone-100 ${isMobilePortrait ? 'text-xs' : 'text-sm'}`}>{awayIdentity?.name || 'Visitante'}</p>
              <p className={`truncate uppercase text-stone-500 ${isMobilePortrait ? 'text-[8px] tracking-[0.15em]' : 'text-[10px] tracking-[0.2em]'}`}>{shortenPubkey(awayIdentity?.pubkey || '')}</p>
            </div>
            <div className={`rounded-lg bg-stone-900/60 ${isMobilePortrait ? 'px-2 py-0.5' : 'px-3 py-1'}`}>
              <p className={`font-bold leading-none text-red-400 ${isMobilePortrait ? 'text-xl' : 'text-3xl'}`}>{gameState.score.away}</p>
            </div>
          </div>

          <div className={`text-center ${isMobilePortrait ? 'min-w-[80px] px-1' : 'min-w-[140px] px-2'}`}>
            <p className={`mb-1 uppercase tracking-[0.3em] text-stone-500 ${isMobilePortrait ? 'text-[8px]' : 'text-[10px]'}`}>Turno</p>
            <p className={`font-bold uppercase tracking-widest ${turnColor} ${isMobilePortrait ? 'text-xs' : 'text-base'}`}>{turnText}</p>
            <p className={`mt-1 text-stone-500 ${isMobilePortrait ? 'text-[10px]' : 'text-xs'}`}>{phaseText}</p>
          </div>

          <div className={`flex min-w-0 items-center justify-self-end ${isMobilePortrait ? 'gap-2' : 'gap-3'}`}>
            <div className={`rounded-lg bg-stone-900/60 ${isMobilePortrait ? 'px-2 py-0.5' : 'px-3 py-1'}`}>
              <p className={`font-bold leading-none text-blue-400 ${isMobilePortrait ? 'text-xl' : 'text-3xl'}`}>{gameState.score.home}</p>
            </div>
            <div className="min-w-0 text-right">
              <p className={`truncate font-bold uppercase tracking-wider text-stone-100 ${isMobilePortrait ? 'text-xs' : 'text-sm'}`}>{homeIdentity?.name || 'Local'}</p>
              <p className={`truncate uppercase text-stone-500 ${isMobilePortrait ? 'text-[8px] tracking-[0.15em]' : 'text-[10px] tracking-[0.2em]'}`}>{shortenPubkey(homeIdentity?.pubkey || '')}</p>
            </div>
            <img
              src={homeIdentity?.avatarUrl || 'https://api.dicebear.com/9.x/shapes/svg?seed=local-player'}
              alt={homeIdentity?.name || 'Local'}
              className={`rounded-full border border-blue-500/40 bg-blue-950 object-cover shadow-md ${isMobilePortrait ? 'w-8 h-8' : 'w-12 h-12'}`}
            />
          </div>
        </div>
      </div>

      {/* Game Canvas */}
      <div ref={containerRef} className={`flex-1 flex items-center justify-center w-full max-w-5xl ${isMobilePortrait ? 'px-2 pb-2' : 'px-4 pb-4'}`}>
        <TejoCanvas
          gameState={gameState}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          scale={scale}
          isRotated={isMobilePortrait}
        />
      </div>

      {showNostrGateway && (
        <NostrGatewayModal
          linkedChallengeId={linkedChallengeId}
          linkedChallengeToken={linkedChallengeToken}
          linkedChallengeOwner={linkedChallengeOwner}
          matchError={matchError}
          isCreatingMatch={isCreatingMatch}
          onClose={() => setShowNostrGateway(false)}
        />
      )}

      {session.status === 'connected' && (
        <div className="w-full max-w-5xl px-4 pb-2">
          <div className="flex items-center justify-between rounded-xl border border-stone-700 bg-stone-800/70 px-4 py-3 text-sm text-stone-300">
            <p>
              Conectado como <span className="font-semibold text-stone-100">{session.profile?.name}</span>. Tu caché por
              pubkey ya puede cargar perfil, desafíos y apuestas.
            </p>
            <button
              type="button"
              onClick={() => void refreshProfile()}
              className="rounded-lg bg-stone-700 px-3 py-2 font-semibold text-white transition-colors hover:bg-stone-600"
            >
              Actualizar perfil
            </button>
          </div>
        </div>
      )}

      {/* Match creation overlay */}
      {isCreatingMatch && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-stone-800 rounded-2xl p-8 text-center shadow-2xl max-w-sm mx-4 border border-stone-700">
            <LoaderCircle size={48} className="mx-auto mb-4 animate-spin text-emerald-400" />
            <h2 className="text-xl font-bold mb-2">Creando partida...</h2>
            <p className="text-sm text-stone-400">Conectando con el servidor y preparando el campo.</p>
          </div>
        </div>
      )}

      {/* Match error toast */}
      {matchError && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-md">
          <div className="flex items-center gap-3 rounded-xl border border-red-800 bg-red-950/90 px-4 py-3 text-sm text-red-200 shadow-2xl">
            <span className="flex-1">{matchError}</span>
            <button
              type="button"
              onClick={clearMatch}
              className="rounded-lg bg-red-800 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-red-700"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {terminationNotice && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-md">
          <div className="rounded-xl border border-stone-700 bg-stone-900/95 px-4 py-3 text-sm text-stone-200 shadow-2xl">
            {terminationNotice}
          </div>
        </div>
      )}

      {/* Winner overlay */}
      {gameState.winner && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-stone-800 rounded-2xl p-8 text-center shadow-2xl max-w-sm mx-4 border border-stone-700">
            <Trophy size={64} className="mx-auto mb-4 text-amber-400" />
            <h2 className="text-3xl font-bold mb-2">
              {`¡${winnerName.toUpperCase()} CAMPEÓN!`}
            </h2>
            <p className="text-stone-400 mb-6">
              {gameState.score.home} - {gameState.score.away}
            </p>
            {!activeChallenge ? (
              <button
                onClick={resetGame}
                className="px-6 py-3 bg-amber-600 hover:bg-amber-500 rounded-lg font-bold transition-colors"
              >
                Jugar de nuevo
              </button>
            ) : (
              <div className="space-y-3">
                {terminatedByOther ? (
                  <div className="space-y-3">
                    <div className="rounded-lg bg-stone-900/60 px-4 py-3 text-sm text-stone-300">
                      {terminatorName} terminó la partida.
                    </div>
                    <button
                      type="button"
                      onClick={() => { clearMatch(); setGameState(createInitialState()); }}
                      className="w-full px-6 py-3 bg-stone-700 hover:bg-stone-600 rounded-lg font-bold transition-colors"
                    >
                      Terminar desafió
                    </button>
                  </div>
                ) : rematchMatchId ? (
                  <div className="rounded-lg bg-stone-900/60 px-4 py-3 text-sm text-stone-300">
                    Armando revancha...
                  </div>
                ) : rematchRejectedBy ? (
                  <div className="rounded-lg bg-stone-900/60 px-4 py-3 text-sm text-stone-300">
                    El rival no quiere jugar de vuelta.
                  </div>
                ) : rematchRequestedByOther ? (
                  <>
                    <p className="text-sm text-stone-300">{rematchRequesterName} quiere jugar de vuelta.</p>
                    <button
                      type="button"
                      disabled={isSubmittingRematch || !localPubkey}
                      onClick={() => void acceptRematch(localPubkey)}
                      className="w-full px-6 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-lg font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSubmittingRematch ? 'Aceptando...' : 'Aceptar revancha'}
                    </button>
                  </>
                ) : rematchRequestedBySelf ? (
                  <div className="rounded-lg bg-stone-900/60 px-4 py-3 text-sm text-stone-300">
                    Esperando confirmación del rival...
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={isSubmittingRematch || !localPubkey}
                    onClick={() => void requestRematch(localPubkey)}
                    className="w-full px-6 py-3 bg-amber-600 hover:bg-amber-500 rounded-lg font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSubmittingRematch ? 'Enviando...' : localWon ? 'Jugar devuelta' : '¿Revancha?'}
                  </button>
                )}

                {!terminatedBy && (
                  <button
                    type="button"
                    onClick={() => void terminateMatch()}
                    className="w-full px-6 py-3 bg-stone-700 hover:bg-stone-600 rounded-lg font-bold transition-colors"
                  >
                    Terminar partida
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Terminated match overlay (when no winner but match was terminated by other player) */}
      {!gameState.winner && terminatedByOther && activeChallenge && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-stone-800 rounded-2xl p-8 text-center shadow-2xl max-w-sm mx-4 border border-stone-700">
            <Trophy size={64} className="mx-auto mb-4 text-stone-400" />
            <h2 className="text-3xl font-bold mb-2 text-stone-300">
              PARTIDA TERMINADA
            </h2>
            <p className="text-stone-400 mb-6">
              {terminatorName} terminó la partida.
            </p>
            <button
              type="button"
              onClick={() => { clearMatch(); clearActiveChallenge(); setGameState(createInitialState()); }}
              className="w-full px-6 py-3 bg-stone-700 hover:bg-stone-600 rounded-lg font-bold transition-colors"
            >
              Volver al entrenamiento
            </button>
          </div>
        </div>
      )}

      {/* Help modal */}
      {showHelp && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-stone-800 rounded-2xl p-6 max-w-md mx-4 border border-stone-700 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-amber-400">¿Cómo jugar?</h2>
              <button
                onClick={() => setShowHelp(false)}
                className="p-1 hover:bg-stone-700 rounded transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-3 text-sm text-stone-300">
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center shrink-0 text-xs font-bold">1</div>
                <p>Hacé click en uno de tus jugadores.</p>
              </div>
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center shrink-0 text-xs font-bold">2</div>
                <p>Mantené el click y arrastrá para apuntar.</p>
              </div>
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center shrink-0 text-xs font-bold">3</div>
                <p>La flecha te marca para dónde va a salir el disparo.</p>
              </div>
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center shrink-0 text-xs font-bold">4</div>
                <p>Soltá el click para patear. Cuanto más arrastres, más fuerza va a tener.</p>
              </div>
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-amber-600 flex items-center justify-center shrink-0 text-xs font-bold">⚽</div>
                <p>Meté la pelota en el arco rival. El primero en 3 goles gana.</p>
              </div>
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-red-600 flex items-center justify-center shrink-0 text-xs font-bold">!</div>
                <p>Si tocás un disco rival antes que la pelota, es falta y el rival gana dos jugadas.</p>
              </div>
            </div>

            <button
              onClick={() => setShowHelp(false)}
              className="w-full mt-5 py-2.5 bg-amber-600 hover:bg-amber-500 rounded-lg font-bold transition-colors"
            >
              Dale
            </button>
          </div>
        </div>
      )}

      {/* Footer hint */}
      <div className="pb-3 text-xs text-stone-500">
        Arrastrá y soltá para patear • Fútbol de precisión por turnos
      </div>
    </div>
  );
}
