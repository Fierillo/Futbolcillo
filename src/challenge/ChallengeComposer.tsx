import { Send } from 'lucide-react';
import { useChallengeStore } from './store';

export function ChallengeComposer() {
  const { draft, setDraft, selectRival, createChallenge, recentRivals, followingRivals, rivalMatches, challengeError, clearChallengeError } = useChallengeStore();

  return (
    <div className="rounded-2xl border border-stone-700 bg-stone-800/70 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-stone-100">Enviar desafío</h3>
          <p className="text-xs text-stone-400">Flujo amistoso local listo para persistencia y futura entrega por DM.</p>
        </div>
        <div className="flex rounded-xl bg-stone-900/80 p-1 text-xs font-semibold uppercase tracking-wider text-stone-400">
          <button
            type="button"
            onClick={() => setDraft({ mode: 'friendly' })}
            className={`rounded-lg px-3 py-1.5 transition-colors ${draft.mode === 'friendly' ? 'bg-emerald-700 text-white' : 'hover:bg-stone-800'}`}
          >
            Amistoso
          </button>
          <button
            type="button"
            onClick={() => setDraft({ mode: 'wager' })}
            className={`rounded-lg px-3 py-1.5 transition-colors ${draft.mode === 'wager' ? 'bg-amber-700 text-white' : 'hover:bg-stone-800'}`}
          >
            Apuesta
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500">Rival</label>
          <input
            value={draft.rivalInput}
            onChange={(event) => {
              clearChallengeError();
              setDraft({ rivalInput: event.target.value });
            }}
            placeholder="Alias, npub o pubkey hex"
            className="w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 outline-none transition-colors placeholder:text-stone-500 focus:border-emerald-500"
          />

          {followingRivals.length > 0 && !draft.rivalInput.trim() && (
            <div className="mt-2">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500">Siguiendo</p>
              <div className="flex flex-wrap gap-2">
              {followingRivals.slice(0, 8).map((profile) => (
                  <button
                    key={profile.pubkey}
                    type="button"
                    onClick={() => {
                      clearChallengeError();
                      selectRival(profile);
                    }}
                    className="flex items-center gap-2 rounded-full border border-emerald-700/30 bg-stone-900/70 px-2.5 py-1.5 text-xs text-stone-300 transition-colors hover:border-emerald-500/60 hover:text-white"
                  >
                    <img src={profile.avatarUrl} alt={profile.contactAlias || profile.displayName} className="h-5 w-5 rounded-full object-cover" />
                    <span className="max-w-[110px] truncate">{profile.contactAlias || profile.displayName}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {rivalMatches.length > 0 && (
            <div className="mt-2 space-y-1 rounded-xl border border-stone-700 bg-stone-900/80 p-2">
              {rivalMatches.map((profile) => (
                <button
                  key={profile.pubkey}
                  type="button"
                  onClick={() => selectRival(profile)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-stone-300 transition-colors hover:bg-stone-800 hover:text-white"
                >
                    <img src={profile.avatarUrl} alt={profile.contactAlias || profile.displayName} className="h-6 w-6 rounded-full object-cover" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium">{profile.contactAlias || profile.displayName}</p>
                      {followingRivals.some((followed) => followed.pubkey === profile.pubkey) && (
                        <span className="rounded-full bg-emerald-900/60 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-200">
                          Following
                        </span>
                      )}
                    </div>
                    <p className="truncate text-[10px] uppercase tracking-wider text-stone-500">
                      {profile.nip05 || `${profile.pubkey.slice(0, 8)}...${profile.pubkey.slice(-6)}`}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {recentRivals.length > 0 && (
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500">Recientes</p>
            <div className="flex flex-wrap gap-2">
              {recentRivals.map((profile) => (
                <button
                  key={profile.pubkey}
                  type="button"
                  onClick={() => {
                    clearChallengeError();
                    selectRival(profile);
                  }}
                  className="flex items-center gap-2 rounded-full border border-stone-700 bg-stone-900/70 px-2.5 py-1.5 text-xs text-stone-300 transition-colors hover:border-emerald-600/60 hover:text-white"
                >
                    <img src={profile.avatarUrl} alt={profile.contactAlias || profile.displayName} className="h-5 w-5 rounded-full object-cover" />
                    <span className="max-w-[110px] truncate">{profile.contactAlias || profile.displayName}</span>
                  </button>
                ))}
              </div>
          </div>
        )}

        {draft.mode === 'wager' && (
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500">Monto en sats</label>
            <input
              type="number"
              min={1}
              value={draft.amountSats}
              onChange={(event) => setDraft({ amountSats: Number(event.target.value) || 0 })}
              className="w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 outline-none transition-colors focus:border-amber-500"
            />
          </div>
        )}

        <div className="rounded-xl border border-stone-700 bg-stone-900/60 px-3 py-2 text-xs text-stone-400">
          El desafío vence a las 24 horas si el rival no lo acepta.
        </div>

        {challengeError && <div className="rounded-xl border border-red-900/60 bg-red-950/30 px-3 py-2 text-sm text-red-200">{challengeError}</div>}

        <button
          type="button"
          onClick={() => void createChallenge()}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-600"
        >
          <Send size={15} />
          Enviar desafío
        </button>
      </div>
    </div>
  );
}
