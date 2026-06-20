import { useState, useEffect, useRef, useCallback } from 'react';
import { Trophy, RotateCcw, Info, X, Volume2, VolumeX } from 'lucide-react';
import TejoCanvas from './game/TejoCanvas';
import {
  createInitialState,
  updateGame,
  handleMouseDown,
  handleMouseMove,
  handleMouseUp,
} from './game/engine';
import { GameState, FIELD_WIDTH, FIELD_HEIGHT } from './game/types';

export default function App() {
  const [gameState, setGameState] = useState<GameState>(createInitialState);
  const [showHelp, setShowHelp] = useState(true);
  const [muted, setMuted] = useState(false);
  const [scale, setScale] = useState(1);
  const gameStateRef = useRef<GameState>(gameState);
  const animFrameRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  // Responsive scaling
  useEffect(() => {
    const updateScale = () => {
      if (!containerRef.current) return;
      const containerWidth = containerRef.current.clientWidth - 32;
      const containerHeight = window.innerHeight - 200;
      const scaleX = containerWidth / FIELD_WIDTH;
      const scaleY = containerHeight / FIELD_HEIGHT;
      setScale(Math.min(scaleX, scaleY, 1));
    };
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, []);

  // Game loop
  useEffect(() => {
    let lastTime = performance.now();

    const loop = (time: number) => {
      const dt = Math.min((time - lastTime) / 16.67, 3);
      lastTime = time;

      setGameState((prev) => {
        const next = { ...prev };
        // Deep copy arrays
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
  }, []);

  const onMouseDown = useCallback((x: number, y: number) => {
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
  }, []);

  const onMouseMove = useCallback((x: number, y: number) => {
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
  }, []);

  const onMouseUp = useCallback(() => {
    setGameState((prev) => {
      const next = { ...prev };
      next.players = prev.players.map((p) => ({ ...p }));
      next.particles = prev.particles.map((p) => ({ ...p }));
      next.ball = { ...prev.ball, trail: [...prev.ball.trail] };
      next.goals = [...prev.goals];
      next.score = { ...prev.score };
      next.dragStart = prev.dragStart ? { ...prev.dragStart } : null;
      next.dragCurrent = prev.dragCurrent ? { ...prev.dragCurrent } : null;
      handleMouseUp(next);
      return next;
    });
  }, []);

  const resetGame = () => {
    setGameState(createInitialState());
  };

  const turnText = gameState.turn === 'home' ? 'LOCAL' : 'VISITANTE';
  const turnColor = gameState.turn === 'home' ? 'text-blue-400' : 'text-red-400';
  const phaseText = gameState.phase === 'aiming' ? 'Apunta y lanza' : 'En juego...';

  return (
    <div className="min-h-screen bg-stone-900 text-white flex flex-col items-center select-none">
      {/* Header */}
      <header className="w-full max-w-5xl px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-600 flex items-center justify-center">
            <span className="text-xl font-bold">T</span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-amber-400">Fútbol Tejo</h1>
            <p className="text-xs text-stone-400">Juego tradicional colombiano</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
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
        <div className="bg-stone-800 rounded-xl p-4 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center shadow-md">
              <span className="text-lg font-bold">L</span>
            </div>
            <div className="text-center">
              <p className="text-xs text-stone-400 uppercase tracking-wider">Local</p>
              <p className="text-3xl font-bold text-blue-400">{gameState.score.home}</p>
            </div>
          </div>

          <div className="text-center px-6">
            <p className="text-xs text-stone-500 uppercase tracking-widest mb-1">Turno</p>
            <p className={`text-sm font-bold ${turnColor}`}>{turnText}</p>
            <p className="text-xs text-stone-500 mt-1">{phaseText}</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-center">
              <p className="text-xs text-stone-400 uppercase tracking-wider">Visitante</p>
              <p className="text-3xl font-bold text-red-400">{gameState.score.away}</p>
            </div>
            <div className="w-12 h-12 rounded-full bg-red-600 flex items-center justify-center shadow-md">
              <span className="text-lg font-bold">V</span>
            </div>
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

      {/* Winner overlay */}
      {gameState.winner && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-stone-800 rounded-2xl p-8 text-center shadow-2xl max-w-sm mx-4 border border-stone-700">
            <Trophy size={64} className="mx-auto mb-4 text-amber-400" />
            <h2 className="text-3xl font-bold mb-2">
              {gameState.winner === 'home' ? '¡LOCAL CAMPEÓN!' : '¡VISITANTE CAMPEÓN!'}
            </h2>
            <p className="text-stone-400 mb-6">
              {gameState.score.home} - {gameState.score.away}
            </p>
            <button
              onClick={resetGame}
              className="px-6 py-3 bg-amber-600 hover:bg-amber-500 rounded-lg font-bold transition-colors"
            >
              Jugar de Nuevo
            </button>
          </div>
        </div>
      )}

      {/* Help modal */}
      {showHelp && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-stone-800 rounded-2xl p-6 max-w-md mx-4 border border-stone-700 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-amber-400">¿Cómo Jugar?</h2>
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
                <p>Selecciona un jugador de tu equipo (arrastra desde el jugador).</p>
              </div>
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center shrink-0 text-xs font-bold">2</div>
                <p>Apunta en la dirección contraria a donde quieres lanzar (como una honda).</p>
              </div>
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center shrink-0 text-xs font-bold">3</div>
                <p>Suelta para lanzar el tejo. Mientras más lejos arrastres, más fuerte será el tiro.</p>
              </div>
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center shrink-0 text-xs font-bold">4</div>
                <p>Usa la flecha como guía: marca la dirección real del disparo y cambia de color según la potencia.</p>
              </div>
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-amber-600 flex items-center justify-center shrink-0 text-xs font-bold">⚽</div>
                <p>Mete el tejo dorado en el arco contrario para marcar gol. ¡Primero en 5 goles gana!</p>
              </div>
            </div>

            <button
              onClick={() => setShowHelp(false)}
              className="w-full mt-5 py-2.5 bg-amber-600 hover:bg-amber-500 rounded-lg font-bold transition-colors"
            >
              ¡Entendido!
            </button>
          </div>
        </div>
      )}

      {/* Footer hint */}
      <div className="pb-3 text-xs text-stone-500">
        Arrastra y suelta para lanzar • Fútbol de precisión por turnos
      </div>
    </div>
  );
}
