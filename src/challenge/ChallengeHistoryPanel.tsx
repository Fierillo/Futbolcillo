import { useMemo, useState } from 'react';
import { Check, Clock3, Copy, Loader, Play } from 'lucide-react';
import { useChallengeStore } from './store';
import { useMatchStore } from '../match/store';
import { useNostrSession } from '../nostr/session-store';
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
  return state === 'rejected' || state === 'expired' || state === 'cancelled' || state === 'finalized' || state === 'terminated';
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
  const { matchState } = useMatchStore();
  const { session } = useNostrSession();
  const [copiedChallengeId, setCopiedChallengeId] = useState<string | null>(null);

  const emptyText = useMemo(() => {
    if (selectedFilter === 'all') return 'Todavía no tenés desafíos guardados.';
    return 'No hay elementos para este filtro.';
  }, [selectedFilter]);

  const copyChallengeId = async (challengeId: string) => {
    try {
      await navigator.clipboard.writeText(challengeId);
      setCopiedChallengeId(challengeId);
      window.setTimeout(() => {
        setCopiedChallengeId((current) => (current === challengeId ? null : current));
      }, 1400);
    } catch {
      // ignore clipboard failures silently
    }
  };

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
            const localAvatar = session.profile?.avatarUrl || `https://api.dicebear.com/9.x/shapes/svg?seed=${session.profile?.pubkey || 'local-player'}`;
            const isActive = challenge.id === activeChallengeId;
            const isOutgoing = challenge.direction === 'outgoing';
            const localAlias = session.profile?.name || 'Local';
            const homeAlias = isOutgoing ? localAlias : rivalName || 'Rival';
            const awayAlias = isOutgoing ? rivalName || 'Rival' : localAlias;
            const homeAvatar = isOutgoing ? localAvatar : rivalAvatar;
            const awayAvatar = isOutgoing ? rivalAvatar : localAvatar;
            const liveScore = isActive && matchState
              ? `${homeAlias} ${matchState.score.home} - ${matchState.score.away} ${awayAlias}`
              : null;
            const persistedScore = challenge.scoreHome != null && challenge.scoreAway != null
              ? `${homeAlias} ${challenge.scoreHome} - ${challenge.scoreAway} ${awayAlias}`
              : null;
            const scoreLabel = liveScore || persistedScore;
            const showExpiryLabel = challenge.state === 'sent' || challenge.state === 'received' || challenge.state === 'accepted';
            const resultLabel = challenge.state === 'finalized'
              ? challenge.winnerPubkey === session.pubkey
                ? 'Victoria'
                : challenge.winnerPubkey
                  ? 'Derrota'
                  : 'Finalizado'
              : challenge.state === 'terminated'
                ? challenge.winnerPubkey === session.pubkey
                  ? 'Victoria'
                  : challenge.winnerPubkey
                    ? 'Derrota'
                    : 'Cancelado'
                : null;
            const resultColor = resultLabel === 'Victoria'
              ? 'text-emerald-400'
              : resultLabel === 'Derrota'
                ? 'text-red-400'
                : 'text-stone-400';
            const modeLabel = challenge.mode === 'wager' ? `Apuesta por ${challenge.amountSats} sats` : 'Amistoso';
            const titleLabel = resultLabel
              || (challenge.state === 'in_match'
                ? 'En partida'
                : challenge.state === 'received'
                  ? 'Desafío recibido'
                  : challenge.state === 'sent'
                    ? 'Esperando rival'
                    : challenge.state === 'accepted'
                      ? 'Listo para jugar'
                      : challenge.state === 'rejected'
                        ? 'Rechazado'
                        : challenge.state === 'expired'
                          ? 'Expirado'
                          : 'Desafío');
            const titleColor = resultLabel
              ? resultColor
              : challenge.state === 'in_match'
                ? 'text-amber-400'
                : challenge.state === 'received'
                  ? 'text-emerald-400'
                  : challenge.state === 'sent' || challenge.state === 'accepted'
                    ? 'text-sky-400'
                    : 'text-stone-300';

            return (
              <div
                key={challenge.id}
                className={`relative rounded-xl border px-3 py-3 transition-colors ${isActive ? 'border-amber-500/60 bg-amber-950/20' : 'border-stone-700 bg-stone-900/60'}`}
              >
                <span className={`absolute right-3 top-3 max-w-[45%] rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest ${challenge.mode === 'wager' ? 'bg-amber-900/60 text-amber-200' : 'bg-emerald-900/60 text-emerald-200'}`}>
                  {modeLabel}
                </span>

                <div className="flex min-w-0 flex-col items-center gap-3 pt-6 text-center sm:pt-2">
                  <div className={`text-sm font-semibold uppercase tracking-[0.26em] ${titleColor}`}>
                    {titleLabel}
                  </div>
                  <div className="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
                    <div className="flex min-w-0 items-center justify-end">
                      <img src={homeAvatar} alt={homeAlias} className="h-9 w-9 rounded-full border border-stone-700 object-cover" />
                    </div>
                    <div className="rounded-xl bg-stone-950/80 px-3 py-2 text-lg font-black tracking-wide text-amber-300 sm:text-2xl">
                      {scoreLabel || 'vs'}
                    </div>
                    <div className="flex min-w-0 items-center">
                      <img src={awayAvatar} alt={awayAlias} className="h-9 w-9 rounded-full border border-stone-700 object-cover" />
                    </div>
                  </div>
                  <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <button
                      type="button"
                      onClick={() => void copyChallengeId(challenge.id)}
                      className={`group inline-flex items-center justify-center gap-2 self-center rounded-lg border px-3 py-1.5 text-xs font-mono font-bold tracking-[0.16em] transition-all sm:self-auto ${copiedChallengeId === challenge.id ? 'scale-[1.02] border-emerald-500/60 bg-emerald-950/40 text-emerald-300' : 'border-stone-700 bg-stone-950/60 text-amber-300 hover:border-amber-500/40 hover:text-amber-200'}`}
                    >
                      {copiedChallengeId === challenge.id ? <Check size={13} /> : <Copy size={13} className="transition-transform group-hover:scale-110" />}
                      <span>{challenge.id}</span>
                      <span className={`overflow-hidden text-[10px] font-semibold uppercase tracking-[0.18em] transition-all ${copiedChallengeId === challenge.id ? 'max-w-16 opacity-100' : 'max-w-0 opacity-0'}`}>
                        Copiado
                      </span>
                    </button>
                    <div className="flex flex-col items-center gap-2 sm:items-end">
                      {showExpiryLabel && (
                        <div className="flex items-center gap-1.5 text-xs text-stone-400">
                          <Clock3 size={12} />
                          <span>Vence en {formatRemaining(challenge.expirationAt)}</span>
                        </div>
                      )}
                      <ChallengeActionButton
                        challenge={challenge}
                        isActive={isActive}
                        onAccept={acceptIncomingChallenge}
                        onEnter={enterAcceptedChallenge}
                        onAction={onAction}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
