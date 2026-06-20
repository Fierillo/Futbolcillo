import { useMemo } from 'react';
import { Clock3 } from 'lucide-react';
import { useChallengeStore } from './store';
import type { ChallengeFilter } from './types';

const filters: ChallengeFilter[] = ['all', 'friendly', 'wager', 'pending', 'finished'];

function filterLabel(filter: ChallengeFilter) {
  if (filter === 'all') return 'Todo';
  if (filter === 'friendly') return 'Amistosos';
  if (filter === 'wager') return 'Apuestas';
  if (filter === 'pending') return 'Pendientes';
  return 'Cerrados';
}

function formatState(state: string) {
  return state.replace('_', ' ');
}

function formatRemaining(expirationAt: number) {
  const ms = expirationAt - Date.now();
  if (ms <= 0) return 'Expirado';
  const hours = Math.round(ms / (60 * 60 * 1000));
  if (hours < 1) return 'Menos de 1h';
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export function ChallengeHistoryPanel() {
  const { challenges, rivalProfiles, selectedFilter, setSelectedFilter } = useChallengeStore();
  const emptyText = useMemo(() => {
    if (selectedFilter === 'all') return 'Todavía no tenés desafíos guardados.';
    return 'No hay elementos para este filtro.';
  }, [selectedFilter]);

  return (
    <div className="rounded-2xl border border-stone-700 bg-stone-800/70 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-stone-100">Historial</h3>
          <p className="text-xs text-stone-400">Panel único con desafíos y apuestas guardados localmente.</p>
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
          {challenges.map((challenge) => (
            <div key={challenge.id} className="grid grid-cols-[1fr_auto] gap-3 rounded-xl border border-stone-700 bg-stone-900/60 px-3 py-2.5">
              {(() => {
                const rivalProfile = rivalProfiles[challenge.rivalPubkey];
                const rivalName = rivalProfile?.displayName || rivalProfile?.nip05 || challenge.rivalName;
                const rivalAvatar = rivalProfile?.avatarUrl || `https://api.dicebear.com/9.x/shapes/svg?seed=${challenge.rivalPubkey}`;

                return (
                  <>
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
                  <span>{formatState(challenge.state)}</span>
                  {challenge.mode === 'wager' && <span>{challenge.amountSats} sats</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-stone-400">
                <Clock3 size={13} />
                <span>{formatRemaining(challenge.expirationAt)}</span>
              </div>
                  </>
                );
              })()}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
