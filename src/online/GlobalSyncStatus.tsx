import { LoaderCircle, RotateCcw } from 'lucide-react';
import { useSyncStatus } from './sync-store';

interface Props {
  onRetry: () => void;
}

const dotStyles = {
  booting: 'bg-amber-400',
  syncing: 'bg-sky-400',
  ready: 'bg-emerald-400',
  error: 'bg-red-400',
} as const;

export function GlobalSyncStatus({ onRetry }: Props) {
  const { syncState } = useSyncStatus();

  return (
    <div className="flex items-center gap-2 rounded-full border border-stone-700 bg-stone-800/80 px-3 py-1.5 text-xs text-stone-300 shadow-lg backdrop-blur-sm">
      <span className={`h-2.5 w-2.5 rounded-full ${dotStyles[syncState.status]}`} />
      <div className="leading-tight">
        <p className="font-semibold uppercase tracking-wider text-stone-200">{syncState.label}</p>
        <p className="text-stone-400">{syncState.detail}</p>
      </div>
      {syncState.status === 'syncing' && <LoaderCircle size={14} className="animate-spin text-sky-300" />}
      {syncState.status === 'error' && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-full bg-stone-700 p-1 text-stone-200 transition-colors hover:bg-stone-600"
          aria-label="Reintentar sincronización"
        >
          <RotateCcw size={12} />
        </button>
      )}
    </div>
  );
}
