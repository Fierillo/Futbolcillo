import { useMemo } from 'react';
import { Clock3, Play, Check, Loader } from 'lucide-react';
import { useChallengeStore } from './store';
import type { CachedChallenge, ChallengeFilter } from './types';

interface Props {
  onAction?: () => void;
}

const filters: ChallengeFilter[] = ['all', 'friendly', 'wager', 'pending', 'finished'];

function filterLabel(filter: ChallengeFilter) {
  if (filter === 'all') return 'Todo';
  if (filter === 'friendly') return 'Amistosos';
  if (filter === 'wager') return 'Apuestas';
  if (filter === 'pending') return 'Pendientes';
  return 'Cerrados';
}

function formatRemaining(expirationAt: number) {
  const ms = expirationAt - Date.now();
  if (ms <= 0) return 'Expirado';
  const hours = Math.round(ms / (60 * 60 * 1000));
  if (hours < 1) return 'Menos de 1h';
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function isFinishedState(state: string) {
  return state === 'rejected' || state === 'expired' || state === 'cancelled' || state === 'finalized';
}

function ChallengeActionButton({
  challenge,
  isActive,
  onAccept,
  onEnter,
  onAction,
}: {
  challenge: CachedChallenge;
  isActive: boolean;
  onAccept: (challenge: CachedChallenge) => Promise<void>;
  onEnter: (challenge: CachedChallenge) => void;
  onAction?: () => void;
}) {
  const { direction, state } = challenge;

  if (isFinishedState(state)) return null;

  if (direction === 'incoming' && state === 'received') {
    return (
      <button
        type="button"
        onClick={async () => {
          await onAccept(challenge);
          onAction?.();
        }}
        className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-500"
      >
        <Check size={13} />
        Aceptar
      </button>
    );
  }

  if (state === 'accepted' || state === 'in_match') {
    return (
      <button
        type="button"
        onClick={() => {
          onEnter(challenge);
          onAction?.();
        }}
        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-colors ${isActive ? 'bg-amber-500 cursor-default' : 'bg-amber-600 hover:bg-amber-500'}`}
      >
        <Play size={13} />
        {isActive ? 'Jugando' : state === 'in_match' ? 'Volver' : 'Jugar'}
      </button>
    );
  }

  if (direction === 'outgoing' && state === 'sent') {
    return (
      <div className="flex items-center gap-1.5 rounded-lg bg-stone-700 px-3 py-1.5 text-xs font-semibold text-stone-400">
        <Loader size={13} className="animate-spin" />
        Esperando rival
      </div>
    );
  }

  return null;
}

export function ChallengeHistoryPanel({ onAction }: Props) {
  const {
    challenges,
    rivalProfiles,
    selectedFilter,
    setSelectedFilter,
    activeChallengeId,
    acceptIncomingChallenge,
    enterAcceptedChallenge,
  } = useChallengeStore();

  const emptyText = useMemo(() => {
    if (selectedFilter === 'all') return 'Todavía no tenés desafíos guardados.';
    return 'No hay elementos para este filtro.';
  }, [selectedFilter]);

  return (
    <div className="rounded-2xl border border-stone-700 bg-stone-800/70 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-stone-100">Desafíos</h3>
          <p className="text-xs text-stone-400">Tus partidas y retos.</p>
        </div>
        <div className="flex flex-wrap justify-end gap-1">
          {filters.map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setSelectedFilter(filter)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider transition-colors ${selectedFilter === filter ? 'bg-stone-100 text-stone-900' : 'bg-stone-900/70 text-stone-400 hover:bg-stone-900 hover:text-stone-200'}`}
            >
              {filterLabel(filter)}
            </button>
          ))}
        </div>
      </div>

      {challenges.length === 0 ? (
        <div className="rounded-xl border border-dashed border-stone-700 bg-stone-900/50 px-4 py-6 text-center text-sm text-stone-500">
          {emptyText}
        </div>
      ) : (
        <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
          {challenges.map((challenge) => {
            const rivalProfile = rivalProfiles[challenge.rivalPubkey];
            const rivalName = rivalProfile?.displayName || rivalProfile?.nip05 || challenge.rivalName;
            const rivalAvatar = rivalProfile?.avatarUrl || `https://api.dicebear.com/9.x/shapes/svg?seed=${challenge.rivalPubkey}`;
            const isActive = challenge.id === activeChallengeId;
            const isPending = !isFinishedState(challenge.state) && challenge.state !== 'accepted' && challenge.state !== 'in_match';

            return (
              <div
                key={challenge.id}
                className={`grid grid-cols-[1fr_auto] gap-3 rounded-xl border px-3 py-2.5 transition-colors ${isActive ? 'border-amber-500/60 bg-amber-950/20' : 'border-stone-700 bg-stone-900/60'}`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm text-stone-100">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest ${challenge.mode === 'wager' ? 'bg-amber-900/60 text-amber-200' : 'bg-emerald-900/60 text-emerald-200'}`}>
                      {challenge.mode === 'wager' ? 'Apuesta' : 'Amistoso'}
                    </span>
                    <div className="flex min-w-0 items-center gap-2">
                      <img src={rivalAvatar} alt={rivalName} className="h-6 w-6 rounded-full object-cover" />
                      <span className="truncate font-semibold">{rivalName}</span>
                    </div>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs uppercase tracking-wider text-stone-500">
                    {challenge.direction === 'incoming' && isPending && (
                      <span className="text-emerald-400">Entrante</span>
                    )}
                    {challenge.direction === 'outgoing' && isPending && (
                      <span className="text-sky-400">Enviado</span>
                    )}
                    {challenge.state === 'in_match' && (
                      <span className="text-amber-400">En partida</span>
                    )}
                    {challenge.mode === 'wager' && <span>{challenge.amountSats} sats</span>}
                  </div>
                </div>
                <div className="flex flex-col items-end justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 text-xs text-stone-400">
                    <Clock3 size={12} />
                    <span>{formatRemaining(challenge.expirationAt)}</span>
                  </div>
                  <ChallengeActionButton
                    challenge={challenge}
                    isActive={isActive}
                    onAccept={acceptIncomingChallenge}
                    onEnter={enterAcceptedChallenge}
                    onAction={onAction}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
