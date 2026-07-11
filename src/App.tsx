import { useState, useEffect, useRef, useCallback } from 'react';
import { Goal, LoaderCircle, Swords, Trophy, RotateCcw, Info, X, Volume2, VolumeX } from 'lucide-react';
import { useChallengeStore } from './challenge/store';
import TejoCanvas from './game/TejoCanvas';
import { preparePhaseOneInfrastructure, usePhaseOneBoot } from './app/use-phase-one-boot';
import { simulateShotWithFrames, type ShotAnimation } from './game/physics';
import { GameState, FIELD_WIDTH, FIELD_HEIGHT } from './game/types';
import {
  advanceVisualEffects,
  clearPointerSelection,
  consumeShotInput,
  createInitialState,
  createVisualBall,
  createVisualPlayers,
  handlePointerDown,
  handlePointerMove,
  hasActiveVisualEffects,
  spawnParticles,
  syncMatchStateToGameState,
  toMatchState,
} from './game/local-game';
import { NostrGatewayModal } from './nostr/NostrGatewayModal';
import { useNostrSession } from './nostr/session-store';
import { getNostrClient } from './nostr/client';
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
  const [localShotAnimation, setLocalShotAnimation] = useState<ShotAnimation | null>(null);
  const gameStateRef = useRef<GameState>(gameState);
  const animFrameRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastHandledTerminationRef = useRef<string | null>(null);
  const { setSyncState } = useSyncStatus();
  const { session, refreshProfile } = useNostrSession();
  const { activeChallenge, pendingIncomingCount, clearActiveChallenge, finalizeChallengeWithResult, syncChallengeProgress, setActiveChallengeById } = useChallengeStore();
  const { activeMatchId, activeMatchMeta, matchState, matchError, isCreatingMatch, isSubmittingShot, isAnimatingShot, pendingShotAnimation, isSubmittingRematch, rematchChallengeId, rematchChallengeAccessToken, interactionResetNonce, createMatch, submitShot, requestRematch, acceptRematch, terminateMatch: terminateRealtimeMatch, clearMatch, finishShotAnimation, clearRematchChallengeId } = useMatchStore();
  const localPubkey = session.profile?.pubkey || '';
  const isResumingMatch = activeChallenge?.state === 'in_match';
  const activeShotAnimation = pendingShotAnimation ?? localShotAnimation;
  const isShotAnimating = isAnimatingShot || Boolean(localShotAnimation);

  const creatorPubkey = activeMatchMeta?.homePubkey
    || (activeChallenge
      ? (activeChallenge.direction === 'outgoing' ? localPubkey : activeChallenge.rivalPubkey)
      : '');
  const joinerPubkey = activeMatchMeta?.awayPubkey
    || (activeChallenge
      ? (activeChallenge.direction === 'outgoing' ? activeChallenge.rivalPubkey : localPubkey)
      : '');
  const localTeam = activeMatchMeta
    ? activeMatchMeta.homePubkey === localPubkey
      ? 'home'
      : activeMatchMeta.awayPubkey === localPubkey
        ? 'away'
        : null
    : activeChallenge?.direction === 'outgoing'
      ? 'home'
      : activeChallenge?.direction === 'incoming'
        ? 'away'
        : null;
  const creatorAlias = activeMatchMeta?.homeName
    || (creatorPubkey === localPubkey ? session.profile?.name || 'Local' : activeChallenge?.rivalName || 'Rival');
  const joinerAlias = activeMatchMeta?.awayName
    || (joinerPubkey === localPubkey ? session.profile?.name || 'Local' : activeChallenge?.rivalName || 'Rival');

  const isOnlineInteractionBlocked = Boolean(
    isSubmittingShot
    || isShotAnimating
    || (activeMatchId && matchState && (matchState.turn !== localTeam || matchState.phase !== 'aiming'))
  );

  const terminateMatch = useCallback(async () => {
    if (!activeMatchId || !localPubkey) return;

    await terminateRealtimeMatch(localPubkey);
  }, [activeMatchId, localPubkey, terminateRealtimeMatch]);

  const finishActiveShotAnimation = useCallback(() => {
    if (pendingShotAnimation) {
      finishShotAnimation();
      return;
    }

    setLocalShotAnimation(null);
  }, [finishShotAnimation, pendingShotAnimation]);

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
    const url = new URL(window.location.href);

    if (activeChallenge?.id && activeChallenge.accessToken) {
      url.searchParams.set('challenge', activeChallenge.id);
      url.searchParams.set('token', activeChallenge.accessToken);
      url.searchParams.set('owner', activeChallenge.sourceOwnerPubkey || activeChallenge.ownerPubkey);
    } else {
      url.searchParams.delete('challenge');
      url.searchParams.delete('token');
      url.searchParams.delete('owner');
    }

    window.history.replaceState({}, '', url);
  }, [activeChallenge]);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  const lastProcessedChallengeRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activeChallenge) return;
    if (lastProcessedChallengeRef.current === activeChallenge.id) return;
    lastProcessedChallengeRef.current = activeChallenge.id;

    setLocalShotAnimation(null);
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

      setLocalShotAnimation(null);
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
  const lastSyncedChallengeScoreRef = useRef<string>('');
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
      ? creatorPubkey
      : serverWinner === 'away'
        ? joinerPubkey
        : null;

    void finalizeChallengeWithResult(
      activeChallenge.id,
      winnerPubkey,
      serverScore.home,
      serverScore.away,
    );
  }, [activeMatchId, activeMatchMeta, activeChallenge, matchState, localPubkey, finalizeChallengeWithResult]);

  useEffect(() => {
    if (!activeMatchId || !activeMatchMeta || !activeChallenge?.id || !matchState?.score) return;
    if (activeMatchMeta.status !== 'active') return;

    const scoreKey = `${activeChallenge.id}:${matchState.score.home}:${matchState.score.away}`;
    if (lastSyncedChallengeScoreRef.current === scoreKey) return;
    lastSyncedChallengeScoreRef.current = scoreKey;

    void syncChallengeProgress(
      activeChallenge.id,
      'in_match',
      matchState.score.home,
      matchState.score.away,
    );
  }, [activeMatchId, activeMatchMeta, activeChallenge, matchState, syncChallengeProgress]);

  // When rematch starts, load the new challenge
  const lastRematchChallengeRef = useRef<string | null>(null);
  useEffect(() => {
    if (!rematchChallengeId) return;
    if (lastRematchChallengeRef.current === rematchChallengeId) return;
    lastRematchChallengeRef.current = rematchChallengeId;
    clearMatch();
    void setActiveChallengeById(rematchChallengeId, rematchChallengeAccessToken || '');
    clearRematchChallengeId();
  }, [rematchChallengeAccessToken, rematchChallengeId, setActiveChallengeById, clearMatch, clearRematchChallengeId]);

  // Fetch rival Nostr profile for avatar when match starts
  const [rivalAvatarUrl, setRivalAvatarUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!activeMatchId) {
      setRivalAvatarUrl(null);
      return;
    }

    const rivalPubkey = activeChallenge?.rivalPubkey
      || (activeMatchMeta
        ? (activeMatchMeta.homePubkey === session.profile?.pubkey ? activeMatchMeta.awayPubkey : activeMatchMeta.homePubkey)
        : '')
      || '';
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
  }, [activeChallenge, activeMatchId, activeMatchMeta, session.profile?.pubkey]);

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
    if (!matchState || !activeMatchId || isShotAnimating || isSubmittingShot) return;

    setGameState((prev) => syncMatchStateToGameState(prev, matchState));
  }, [matchState, activeMatchId, isShotAnimating, isSubmittingShot]);

  useEffect(() => {
    if (!interactionResetNonce) return;
    setGameState((prev) => ({
      ...prev,
      selectedPlayer: null,
      dragStart: null,
      dragCurrent: null,
    }));
  }, [interactionResetNonce]);

  // Game loop helpers
  const shotAnimationStartRef = useRef(0);
  const SHOT_ANIMATION_MIN_MS = 700;
  const SHOT_ANIMATION_MAX_MS = 2520;
  const SHOT_ANIMATION_FRAME_MS = 16;

  useEffect(() => {
    if (isShotAnimating || !hasActiveVisualEffects(gameState)) {
      return;
    }

    const loop = () => {
      setGameState((prev) => {
        const next = { ...prev };
        next.particles = prev.particles.map((p) => ({ ...p }));
        advanceVisualEffects(next);
        return next;
      });

      const shouldContinue = hasActiveVisualEffects(gameStateRef.current);
      if (shouldContinue) {
        animFrameRef.current = requestAnimationFrame(loop);
      }
    };

    animFrameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [gameState, isShotAnimating]);

  useEffect(() => {
    if (!activeShotAnimation) return;

    const anim = activeShotAnimation;
    const animationHomeAlias = activeMatchMeta?.homeName
      || joinerAlias;
    const animationAwayAlias = activeMatchMeta?.awayName
      || creatorAlias;

    if (!anim.initialState || !anim.finalState || !Array.isArray(anim.frames) || anim.frames.length === 0) {
      console.error('[online-shot][app] invalid-animation-payload', anim);
      finishActiveShotAnimation();
      return;
    }

    console.info('[online-shot][app] animation-start', {
      id: anim.id,
      frames: anim.frames?.length || 0,
    });

    shotAnimationStartRef.current = performance.now();

    const goalScored = anim.finalState.score.home !== anim.initialState.score.home
      || anim.finalState.score.away !== anim.initialState.score.away;
    const visibleFrameCount = goalScored && anim.frames.length > 1
      ? anim.frames.length - 1
      : anim.frames.length;
    const animationDurationMs = Math.max(
      SHOT_ANIMATION_MIN_MS,
      Math.min(SHOT_ANIMATION_MAX_MS, Math.max(1, visibleFrameCount - 1) * SHOT_ANIMATION_FRAME_MS)
    );

    const renderFrame = (time: number) => {
      const progress = Math.min(1, (time - shotAnimationStartRef.current) / animationDurationMs);
      const frameIndex = Math.min(visibleFrameCount - 1, Math.floor(progress * Math.max(visibleFrameCount - 1, 0)));
      const frame = anim.frames[frameIndex];
      const finalState = anim.finalState;
      const framePlayers = Array.isArray(frame?.players) ? frame.players : [];
      const frameBall = frame?.ball ?? anim.initialState.ball.pos;

      setGameState((prev) => {
        const next = { ...prev };
        next.players = createVisualPlayers(anim.initialState.players).map((player, index) => ({
          ...player,
          pos: {
            x: framePlayers[index]?.x ?? player.pos.x,
            y: framePlayers[index]?.y ?? player.pos.y,
          },
        }));
        next.ball = {
          ...createVisualBall(anim.initialState.ball),
          pos: {
            x: frameBall.x,
            y: frameBall.y,
          },
          trail: progress < 1 ? [] : [...finalState.ball.trail],
        };
        next.goals = [...anim.initialState.goals];
        next.score = progress < 1 ? { ...anim.initialState.score } : { ...finalState.score };
        next.turn = progress < 1 ? anim.initialState.turn : finalState.turn;
        next.phase = progress < 1 ? 'shooting' : finalState.phase;
        next.winner = progress < 1 ? anim.initialState.winner : finalState.winner;
        next.activeShotPlayer = progress < 1 ? anim.playerIndex : finalState.activeShotPlayer;
        next.activeShotTouchedBall = progress < 1 ? false : finalState.activeShotTouchedBall;
        next.activeShotCommittedFoul = progress < 1 ? false : finalState.activeShotCommittedFoul;
        next.bonusTurnTeam = progress < 1 ? anim.initialState.bonusTurnTeam : finalState.bonusTurnTeam;
        next.pendingBonusTurns = progress < 1 ? anim.initialState.pendingBonusTurns : finalState.pendingBonusTurns;
        next.lastShot = progress < 1 ? anim.initialState.lastShot : finalState.lastShot;
        next.lastShotAnimation = null;
        next.dragStart = null;
        next.dragCurrent = null;
        next.selectedPlayer = null;

        if (progress >= 1) {
          if (goalScored) {
            const goalScorer = finalState.score.home !== anim.initialState.score.home ? 'home' : 'away';
            const scorerName = goalScorer === 'home' ? animationHomeAlias : animationAwayAlias;
            next.message = `¡GOL DE ${scorerName.toUpperCase()}!`;
            next.messageTimer = 120;
            next.cameraShake = 12;
            spawnParticles(next, next.ball.pos, 50, '#fbbf24', 8, 5);
            spawnParticles(next, next.ball.pos, 30, goalScorer === 'home' ? '#60a5fa' : '#f87171', 6, 4);
          } else if (anim.outcome.foul) {
            const foulVictim = anim.outcome.foul.victimTeam === 'home' ? animationHomeAlias : animationAwayAlias;
            next.message = `¡Falta! ${foulVictim.toUpperCase()} gana dos jugadas.`;
            next.messageTimer = 120;
            next.cameraShake = 6;
            const shooterPos = finalState.players[anim.playerIndex]?.pos ?? next.ball.pos;
            spawnParticles(next, shooterPos, 18, '#f87171', 3, 3);
          } else if (!anim.initialState.winner && finalState.winner) {
            const winnerName = finalState.winner === 'home' ? animationHomeAlias : animationAwayAlias;
            next.message = `¡${winnerName.toUpperCase()} CAMPEÓN!`;
            next.messageTimer = 120;
            next.cameraShake = 12;
          }
        }

        return next;
      });

      if (progress >= 1) {
        console.info('[online-shot][app] animation-finished', {
          id: anim.id,
          finalTurn: finalState.turn,
          finalPhase: finalState.phase,
          score: finalState.score,
        });
        finishActiveShotAnimation();
        return;
      }

      animFrameRef.current = requestAnimationFrame(renderFrame);
    };

    animFrameRef.current = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [activeChallenge, activeMatchMeta, activeShotAnimation, finishActiveShotAnimation, session.profile?.name]);

  const onMouseDown = useCallback((x: number, y: number) => {
    if (isSubmittingShot || isShotAnimating) return;
    if (activeMatchId && matchState) {
      if (matchState.turn !== localTeam || matchState.phase !== 'aiming') return;
    } else if (activeChallenge && gameStateRef.current.turn !== localTeam) {
      return;
    }

    setGameState((prev) => {
      const next = { ...prev };
      next.players = prev.players.map((p) => ({ ...p }));
      next.dragStart = prev.dragStart ? { ...prev.dragStart } : null;
      next.dragCurrent = prev.dragCurrent ? { ...prev.dragCurrent } : null;
      handlePointerDown(next, x, y);
      return next;
    });
  }, [activeChallenge, activeMatchId, isShotAnimating, isSubmittingShot, localTeam, matchState]);

  const onMouseMove = useCallback((x: number, y: number) => {
    if (isSubmittingShot || isShotAnimating) return;
    if (activeMatchId && matchState) {
      if (matchState.turn !== localTeam || matchState.phase !== 'aiming') return;
    } else if (activeChallenge && gameStateRef.current.turn !== localTeam) {
      return;
    }

    setGameState((prev) => {
      const next = { ...prev };
      next.players = prev.players.map((p) => ({ ...p }));
      next.dragStart = prev.dragStart ? { ...prev.dragStart } : null;
      next.dragCurrent = prev.dragCurrent ? { ...prev.dragCurrent } : null;
      handlePointerMove(next, x, y);
      return next;
    });
  }, [activeChallenge, activeMatchId, isShotAnimating, isSubmittingShot, localTeam, matchState]);

  const onMouseUp = useCallback(() => {
    console.info('[online-shot][app] mouse-up', {
      activeMatchId,
      isSubmittingShot,
      isShotAnimating,
      localTeam,
      matchTurn: matchState?.turn,
      matchPhase: matchState?.phase,
      selectedPlayer: gameStateRef.current.selectedPlayer,
      dragStart: gameStateRef.current.dragStart,
      dragCurrent: gameStateRef.current.dragCurrent,
    });
    if (isSubmittingShot || isShotAnimating) return;
    if (activeMatchId && matchState) {
      if (matchState.turn !== localTeam || matchState.phase !== 'aiming') return;
    } else if (activeChallenge && gameStateRef.current.turn !== localTeam) {
      return;
    }

    let shotCandidate: { playerTeam: 'home' | 'away'; playerNumber: number; velX: number; velY: number } | null = null;

    if (activeMatchId) {
      const current = gameStateRef.current;
      const probe = {
        ...current,
        players: current.players.map((p) => ({ ...p })),
        dragStart: current.dragStart ? { ...current.dragStart } : null,
        dragCurrent: current.dragCurrent ? { ...current.dragCurrent } : null,
      };

      const candidate = consumeShotInput(probe);
      if (candidate) {
        const localPlayer = current.players[candidate.playerIndex];
        if (!localPlayer) {
          console.warn('[online-shot][app] missing-local-player-for-shot', candidate);
        } else {
          shotCandidate = {
            playerTeam: localPlayer.team,
            playerNumber: localPlayer.number,
            velX: candidate.velX,
            velY: candidate.velY,
          };
          console.info('[online-shot][app] shot-candidate', shotCandidate);
        }
      }
    }

    const current = gameStateRef.current;
    const localProbe = {
      ...current,
      players: current.players.map((p) => ({ ...p })),
      dragStart: current.dragStart ? { ...current.dragStart } : null,
      dragCurrent: current.dragCurrent ? { ...current.dragCurrent } : null,
    };
    const localShotCandidate = !activeMatchId ? consumeShotInput(localProbe) : null;

    setGameState((prev) => {
      const next = { ...prev };
      next.players = prev.players.map((p) => ({ ...p }));
      clearPointerSelection(next);
      return next;
    });

    if (shotCandidate) {
      console.info('[online-shot][app] submitting-shot', shotCandidate);
      void submitShot(shotCandidate.playerTeam, shotCandidate.playerNumber, shotCandidate.velX, shotCandidate.velY);
    } else if (localShotCandidate) {
      const { shotAnimation } = simulateShotWithFrames(
        toMatchState(current),
        localShotCandidate.playerIndex,
        localShotCandidate.velX,
        localShotCandidate.velY,
        `training-shot-${Date.now()}`,
      );
      setLocalShotAnimation(shotAnimation);
    } else {
      console.warn('[online-shot][app] no-shot-candidate');
    }
  }, [activeChallenge, activeMatchId, isShotAnimating, isSubmittingShot, localTeam, matchState, submitShot]);

  const resetGame = () => {
    setLocalShotAnimation(null);
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

  const formatRemaining = (expirationAt: number) => {
    const ms = expirationAt - Date.now();
    if (ms <= 0) return 'Expirado';
    const hours = Math.round(ms / (60 * 60 * 1000));
    if (hours < 1) return 'Menos de 1h';
    if (hours < 24) return `${hours}h`;
    return `${Math.round(hours / 24)}d`;
  };

  const homeAlias = activeMatchMeta?.homeName || creatorAlias;
  const awayAlias = activeMatchMeta?.awayName || joinerAlias;

  const turnText = activeChallenge
    ? gameState.turn === 'home'
      ? homeAlias.toUpperCase()
      : awayAlias.toUpperCase()
    : gameState.turn === 'home'
      ? 'LOCAL'
      : 'RIVAL';
  const isBonusTurn = gameState.turn === gameState.bonusTurnTeam && gameState.pendingBonusTurns > 0;
  const turnDisplayText = isBonusTurn ? `${turnText} x2` : turnText;
  const turnColor = gameState.turn === 'home' ? 'text-blue-400' : 'text-red-400';
  const phaseText = gameState.phase === 'aiming' ? 'Apuntá y pateá' : 'En juego...';

  const rivalFallbackAvatar = `https://api.dicebear.com/9.x/bottts/svg?seed=${activeChallenge?.rivalPubkey || 'rival'}`;

  const homeIdentity = activeChallenge
    ? {
        name: homeAlias,
        pubkey: creatorPubkey,
        avatarUrl: creatorPubkey === localPubkey
          ? session.profile?.avatarUrl || `https://api.dicebear.com/9.x/shapes/svg?seed=${session.profile?.pubkey || 'local'}`
          : rivalAvatarUrl || rivalFallbackAvatar,
      }
    : activeMatchMeta
      ? {
          name: homeAlias,
          pubkey: activeMatchMeta.homePubkey,
          avatarUrl: activeMatchMeta.homePubkey === session.profile?.pubkey
            ? session.profile?.avatarUrl || `https://api.dicebear.com/9.x/shapes/svg?seed=${session.profile?.pubkey || 'local'}`
            : rivalAvatarUrl || rivalFallbackAvatar,
        }
    : session.profile;

  const awayIdentity = activeChallenge
    ? {
        name: awayAlias,
        pubkey: joinerPubkey,
        avatarUrl: joinerPubkey === localPubkey
          ? session.profile?.avatarUrl || `https://api.dicebear.com/9.x/shapes/svg?seed=${session.profile?.pubkey || 'away'}`
          : rivalAvatarUrl || rivalFallbackAvatar,
      }
    : activeMatchMeta
      ? {
          name: awayAlias,
          pubkey: activeMatchMeta.awayPubkey,
          avatarUrl: activeMatchMeta.awayPubkey === session.profile?.pubkey
            ? session.profile?.avatarUrl || `https://api.dicebear.com/9.x/shapes/svg?seed=${session.profile?.pubkey || 'away'}`
            : rivalAvatarUrl || rivalFallbackAvatar,
        }
    : {
        name: 'Máquina',
        pubkey: 'training-bot',
        avatarUrl: 'https://api.dicebear.com/9.x/bottts/svg?seed=training-bot',
      };

  const winnerName = gameState.winner === 'home' ? homeAlias : awayAlias;
  const displayedScore = activeMatchId && matchState ? matchState.score : gameState.score;
  const localWon = Boolean(activeChallenge && localTeam && gameState.winner && localTeam === gameState.winner);
  const rematchRequestedBy = activeMatchMeta?.rematchRequestedBy || null;
  const rematchMatchId = activeMatchMeta?.rematchMatchId || null;
  const rematchRejectedBy = activeMatchMeta?.rematchRejectedBy || null;
  const terminatedBy = activeMatchMeta?.terminatedBy || null;
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
              ? (isResumingMatch ? 'Reanudando partida...' : 'Creando partida...')
              : activeMatchId
                ? `Turno de ${turnDisplayText.toLowerCase()}${activeChallenge ? ` • vence en ${formatRemaining(activeChallenge.expirationAt).toLowerCase()}` : ''}`
                : activeChallenge
                  ? activeChallenge.mode === 'wager'
                    ? `Partida en juego: ${activeChallenge.amountSats} sats • vence en ${formatRemaining(activeChallenge.expirationAt).toLowerCase()}`
                    : `Partida amistosa activa • vence en ${formatRemaining(activeChallenge.expirationAt).toLowerCase()}`
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
              <p className={`font-bold leading-none text-red-400 ${isMobilePortrait ? 'text-xl' : 'text-3xl'}`}>{displayedScore.away}</p>
            </div>
          </div>

          <div className={`text-center ${isMobilePortrait ? 'min-w-[80px] px-1' : 'min-w-[140px] px-2'}`}>
            <p className={`mb-1 uppercase tracking-[0.3em] text-stone-500 ${isMobilePortrait ? 'text-[8px]' : 'text-[10px]'}`}>Turno</p>
            <p className={`font-bold uppercase tracking-widest ${turnColor} ${isMobilePortrait ? 'text-xs' : 'text-base'}`}>{turnDisplayText}</p>
            <p className={`mt-1 text-stone-500 ${isMobilePortrait ? 'text-[10px]' : 'text-xs'}`}>{phaseText}</p>
          </div>

          <div className={`flex min-w-0 items-center justify-self-end ${isMobilePortrait ? 'gap-2' : 'gap-3'}`}>
            <div className={`rounded-lg bg-stone-900/60 ${isMobilePortrait ? 'px-2 py-0.5' : 'px-3 py-1'}`}>
              <p className={`font-bold leading-none text-blue-400 ${isMobilePortrait ? 'text-xl' : 'text-3xl'}`}>{displayedScore.home}</p>
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
          isInteractionBlocked={isOnlineInteractionBlocked}
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
            <h2 className="text-xl font-bold mb-2">{isResumingMatch ? 'Reanudando partida...' : 'Creando partida...'}</h2>
            <p className="text-sm text-stone-400">
              {isResumingMatch
                ? 'Conectando con el servidor y recuperando el estado actual.'
                : 'Conectando con el servidor y preparando el campo.'}
            </p>
          </div>
        </div>
      )}

      {/* Shot calculation overlay */}
      {isSubmittingShot && !isCreatingMatch && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/35">
          <div className="mx-4 w-full max-w-xs rounded-2xl border border-stone-700 bg-stone-900/95 px-5 py-4 text-center shadow-2xl">
            <LoaderCircle size={36} className="mx-auto mb-3 animate-spin text-amber-400" />
            <h2 className="text-lg font-bold text-stone-100">Calculando tiro...</h2>
            <p className="mt-1 text-sm text-stone-400">Esperá la respuesta del servidor antes de volver a jugar.</p>
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
                {displayedScore.home} - {displayedScore.away}
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
                      onClick={() => { setLocalShotAnimation(null); clearMatch(); setGameState(createInitialState()); }}
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
              onClick={() => { setLocalShotAnimation(null); clearMatch(); clearActiveChallenge(); setGameState(createInitialState()); }}
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
