import { useState, useEffect, useRef, useCallback } from 'react';
import { Goal, LoaderCircle, Trophy, RotateCcw, Info, X, Volume2, VolumeX } from 'lucide-react';
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
import { GameState, FIELD_WIDTH, FIELD_HEIGHT } from './game/types';
import { NostrGatewayModal } from './nostr/NostrGatewayModal';
import { useNostrSession } from './nostr/session-store';
import { GlobalSyncStatus } from './online/GlobalSyncStatus';
import { useSyncStatus } from './online/sync-store';
import { useMatchStore } from './match/store';

export default function App() {
  const [gameState, setGameState] = useState<GameState>(createInitialState);
  const [showHelp, setShowHelp] = useState(true);
  const [showNostrGateway, setShowNostrGateway] = useState(false);
  const [linkedChallengeId, setLinkedChallengeId] = useState('');
  const [linkedChallengeToken, setLinkedChallengeToken] = useState('');
  const [muted, setMuted] = useState(false);
  const [scale, setScale] = useState(1);
  const gameStateRef = useRef<GameState>(gameState);
  const animFrameRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const { setSyncState } = useSyncStatus();
  const { session, refreshProfile } = useNostrSession();
  const { activeChallenge, pendingIncomingCount } = useChallengeStore();
  const { activeMatchId, matchState, matchError, isCreatingMatch, createMatch, submitShot, clearMatch } = useMatchStore();
  const localTeam = activeChallenge?.direction === 'incoming' ? 'away' : activeChallenge?.direction === 'outgoing' ? 'home' : null;

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
    if (!challengeId || !challengeToken) return;

    setLinkedChallengeId(challengeId);
    setLinkedChallengeToken(challengeToken);
    setShowNostrGateway(true);
  }, []);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    if (!activeChallenge) return;

    setGameState(createInitialState());
    setShowNostrGateway(false);
    setShowHelp(false);

    if (activeChallenge.state === 'accepted') {
      void createMatch(activeChallenge);
    }
  }, [activeChallenge, createMatch]);

  // Responsive scaling
  useEffect(() => {
    const updateScale = () => {
      if (!containerRef.current) return;
      const containerWidth = containerRef.current.clientWidth - 32;
      const containerTop = containerRef.current.getBoundingClientRect().top;
      const containerHeight = Math.max(window.innerHeight - containerTop - 24, 240);
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
    if (!matchState || !activeMatchId) return;

    setGameState((prev) => {
      const next = { ...prev };
      next.players = matchState.players.map((p) => ({
        ...p,
        isSelected: false,
        cooldown: 0,
        color: p.team === 'home' ? '#1e40af' : '#b91c1c',
        strokeColor: p.team === 'home' ? '#60a5fa' : '#f87171',
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
      return next;
    });
  }, [matchState, activeMatchId]);

  // Game loop (only runs in training mode)
  useEffect(() => {
    if (activeMatchId) return;

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

        updateGame(next, dt);
        return next;
      });

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [activeMatchId]);

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
            void submitShot(playerIndex, velX, velY);
          }
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

  const turnText = gameState.turn === 'home' ? 'LOCAL' : 'RIVAL';
  const turnColor = gameState.turn === 'home' ? 'text-blue-400' : 'text-red-400';
  const phaseText = gameState.phase === 'aiming' ? 'Apuntá y pateá' : 'En juego...';
  const shortenPubkey = (value: string) => {
    if (!value) return '';
    if (value.length <= 16) return value;
    return `${value.slice(0, 8)}...${value.slice(-6)}`;
  };
  const homeIdentity = session.profile;
  const awayIdentity = {
    name: activeChallenge?.rivalName || 'Máquina',
    pubkey: activeChallenge?.rivalPubkey || 'training-bot',
    avatarUrl: `https://api.dicebear.com/9.x/bottts/svg?seed=${activeChallenge?.rivalPubkey || 'training-bot'}`,
  };

  return (
    <div className="min-h-screen bg-stone-900 text-white flex flex-col items-center select-none">
      {/* Header */}
      <header className="w-full max-w-5xl px-4 py-4 flex items-center justify-between">
        <div>
          <h1 className="title-font text-4xl leading-none tracking-[0.14em] text-amber-400 uppercase drop-shadow-[0_2px_0_rgba(0,0,0,0.35)] sm:text-5xl">
            Futbolcillo
          </h1>
          <p className="mt-1 text-xs uppercase tracking-[0.25em] text-stone-500">
            {isCreatingMatch
              ? 'Creando partida...'
              : activeMatchId
                ? `Partida online • ${matchState?.turn === localTeam ? 'Tu turno' : 'Turno del rival'}`
                : activeChallenge
                  ? activeChallenge.mode === 'wager'
                    ? `Partida en juego: ${activeChallenge.amountSats} sats`
                    : 'Partida amistosa activa'
                  : session.status === 'connected'
                    ? `Identidad lista: ${session.method === 'nip07' ? 'NIP-07' : 'Bunker'}`
                    : 'Modo entrenamiento activo'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <GlobalSyncStatus onRetry={retrySync} />
          <button
            onClick={() => setShowNostrGateway(true)}
            className="relative flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold uppercase tracking-wider text-white transition-colors hover:bg-emerald-600"
          >
            <Goal size={16} />
            Quiero Más
            {pendingIncomingCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                {pendingIncomingCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setMuted(!muted)}
            className="p-2 rounded-lg bg-stone-800 hover:bg-stone-700 transition-colors"
          >
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          <button
            onClick={() => setShowHelp(true)}
            className="p-2 rounded-lg bg-stone-800 hover:bg-stone-700 transition-colors"
          >
            <Info size={18} />
          </button>
          <button
            onClick={resetGame}
            className="p-2 rounded-lg bg-stone-800 hover:bg-stone-700 transition-colors"
          >
            <RotateCcw size={18} />
          </button>
        </div>
      </header>

      {/* Scoreboard */}
      <div className="w-full max-w-5xl px-4 mb-3">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 rounded-xl bg-stone-800 p-4 shadow-lg">
          <div className="flex min-w-0 items-center gap-3 justify-self-start">
            <img
              src={homeIdentity?.avatarUrl || 'https://api.dicebear.com/9.x/shapes/svg?seed=local-player'}
              alt={homeIdentity?.name || 'Local'}
              className="w-12 h-12 rounded-full border border-blue-500/40 bg-blue-950 object-cover shadow-md"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold uppercase tracking-wider text-stone-100">{homeIdentity?.name || 'Local'}</p>
              <p className="truncate text-[10px] uppercase tracking-[0.2em] text-stone-500">{shortenPubkey(homeIdentity?.pubkey || 'Sin login')}</p>
            </div>
            <div className="rounded-lg bg-stone-900/60 px-3 py-1">
              <p className="text-3xl font-bold leading-none text-blue-400">{gameState.score.home}</p>
            </div>
          </div>

          <div className="min-w-[140px] text-center px-2">
            <p className="mb-1 text-[10px] uppercase tracking-[0.3em] text-stone-500">Turno</p>
            <p className={`text-base font-bold uppercase tracking-widest ${turnColor}`}>{turnText}</p>
            <p className="mt-1 text-xs text-stone-500">{phaseText}</p>
          </div>

          <div className="flex min-w-0 items-center justify-self-end gap-3">
            <div className="rounded-lg bg-stone-900/60 px-3 py-1">
              <p className="text-3xl font-bold leading-none text-red-400">{gameState.score.away}</p>
            </div>
            <div className="min-w-0 text-right">
              <p className="truncate text-sm font-bold uppercase tracking-wider text-stone-100">{awayIdentity.name}</p>
              <p className="truncate text-[10px] uppercase tracking-[0.2em] text-stone-500">{shortenPubkey(awayIdentity.pubkey)}</p>
            </div>
            <img src={awayIdentity.avatarUrl} alt={awayIdentity.name} className="w-12 h-12 rounded-full border border-red-500/40 bg-red-950 object-cover shadow-md" />
          </div>
        </div>
      </div>

      {/* Game Canvas */}
      <div ref={containerRef} className="flex-1 flex items-center justify-center w-full max-w-5xl px-4 pb-4">
        <TejoCanvas
          gameState={gameState}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          scale={scale}
        />
      </div>

      {showNostrGateway && (
        <NostrGatewayModal
          linkedChallengeId={linkedChallengeId}
          linkedChallengeToken={linkedChallengeToken}
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

      {/* Winner overlay */}
      {gameState.winner && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-stone-800 rounded-2xl p-8 text-center shadow-2xl max-w-sm mx-4 border border-stone-700">
            <Trophy size={64} className="mx-auto mb-4 text-amber-400" />
            <h2 className="text-3xl font-bold mb-2">
              {gameState.winner === 'home' ? '¡LOCAL CAMPEÓN!' : '¡RIVAL CAMPEÓN!'}
            </h2>
            <p className="text-stone-400 mb-6">
              {gameState.score.home} - {gameState.score.away}
            </p>
            <button
              onClick={resetGame}
              className="px-6 py-3 bg-amber-600 hover:bg-amber-500 rounded-lg font-bold transition-colors"
            >
              Jugar de nuevo
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
