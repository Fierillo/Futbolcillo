import { useEffect, useState } from 'react';
import { ArrowLeft, ChevronDown, LoaderCircle, PlugZap, QrCode, RefreshCcw, Shield, Swords, Wallet, Wifi, X, Zap } from 'lucide-react';
import { useChallengeStore } from '../challenge/store';
import { ChallengeComposer } from '../challenge/ChallengeComposer';
import { ChallengeHistoryPanel } from '../challenge/ChallengeHistoryPanel';
import { getRelayList } from './client';
import { useNostrSession } from './session-store';
import type { NostrFeatureCard } from './types';

interface Props {
  onClose: () => void;
  linkedChallengeId?: string;
  linkedChallengeToken?: string;
}

const features: NostrFeatureCard[] = [
  {
    title: 'Amistosos online',
    description: 'Retos directos con identidad real y continuidad entre sesiones.',
  },
  {
    title: 'Apuestas en sats',
    description: 'Listo para sats, escrow del juego y premios al ganador.',
  },
  {
    title: 'Historial y continuidad',
    description: 'Caché local, relays mixtos e historial siempre a mano.',
  },
];

type ModalStep = 'intro' | 'connect' | 'invite';

export function NostrGatewayModal({ onClose, linkedChallengeId = '', linkedChallengeToken = '' }: Props) {
  const [bunkerToken, setBunkerToken] = useState('');
  const [showQr, setShowQr] = useState(false);
  const [showTechnicalNotes, setShowTechnicalNotes] = useState(false);
  const [step, setStep] = useState<ModalStep>('intro');
  const { session, connectNip07, connectBunker, disconnect, refreshProfile } = useNostrSession();
  const { linkedChallenge, loadLinkedChallenge } = useChallengeStore();
  const relays = getRelayList();
  const isBusy = session.status === 'connecting';
  const bunkerQrUrl = bunkerToken.trim()
    ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(bunkerToken.trim())}`
    : '';

  const activeStep = session.status === 'connected' ? 'invite' : linkedChallengeId ? 'connect' : step;

  const stepTitle = activeStep === 'intro' ? 'Modo Nostr' : activeStep === 'connect' ? 'Conectá tu identidad' : 'Invitá a un rival';
  const stepHint =
    activeStep === 'intro'
      ? 'Más juego, más riesgo y más calle.'
      : activeStep === 'connect'
        ? 'Entrá con extensión o con bunker.'
        : 'Ya entraste. Ahora toca retar a alguien.';

  useEffect(() => {
    if (session.status !== 'connected' || !linkedChallengeId || !linkedChallengeToken) return;
    void loadLinkedChallenge(linkedChallengeId, linkedChallengeToken);
  }, [session.status, linkedChallengeId, linkedChallengeToken, loadLinkedChallenge]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4">
      <div className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-3xl border border-stone-700 bg-stone-900 p-4 shadow-2xl sm:p-5">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-emerald-400">Quiero Más</p>
            <h2 className="title-font text-3xl uppercase tracking-[0.12em] text-amber-400 sm:text-4xl">Modo Nostr</h2>
            <p className="mt-1 text-sm text-stone-400">{stepTitle}. {stepHint}</p>
          </div>
          <div className="flex items-center gap-2">
            {activeStep !== 'intro' && session.status !== 'connected' && (
              <button
                type="button"
                onClick={() => setStep('intro')}
                className="rounded-lg p-2 text-stone-400 transition-colors hover:bg-stone-800 hover:text-white"
                aria-label="Volver"
              >
                <ArrowLeft size={18} />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-stone-400 transition-colors hover:bg-stone-800 hover:text-white"
              aria-label="Cerrar panel Nostr"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {linkedChallengeId && linkedChallengeToken && (
          <div className="mb-4 rounded-2xl border border-sky-800/60 bg-sky-950/30 px-4 py-3 text-sm text-sky-100">
            <p className="font-semibold">Llegaste desde un desafío</p>
            <p className="mt-1 text-sky-100/80">
              Conectate con Nostr para seguir con este reto. ID corto: <span className="font-mono">{linkedChallengeId.slice(0, 8)}</span>
            </p>
            {linkedChallenge && (
              <p className="mt-2 text-sky-100/80">
                {linkedChallenge.mode === 'wager'
                  ? `Te lo mandó ${linkedChallenge.rivalName} por ${linkedChallenge.amountSats} sats.`
                  : `Te lo mandó ${linkedChallenge.rivalName} como amistoso.`}
              </p>
            )}
          </div>
        )}

        {activeStep === 'intro' && (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              {features.map((feature, index) => (
                <div key={feature.title} className="rounded-2xl border border-stone-700 bg-gradient-to-br from-stone-800 to-stone-900 p-3">
                  <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-stone-700 text-stone-100">
                    {index === 0 && <Swords size={16} />}
                    {index === 1 && <Zap size={16} />}
                    {index === 2 && <Wifi size={16} />}
                  </div>
                  <h3 className="mb-1 text-base font-bold text-stone-100">{feature.title}</h3>
                  <p className="text-xs text-stone-400">{feature.description}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-3xl border border-emerald-800/60 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.18),transparent_55%),linear-gradient(180deg,rgba(6,78,59,0.28),rgba(12,10,9,0.1))] p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-lg font-bold text-white">Desbloqueá el modo serio</p>
                  <p className="mt-1 max-w-md text-sm text-emerald-100/80">
                    Entrá con Nostr para jugar amistosos, preparar apuestas y guardar todo en tu caché local.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setStep('connect')}
                  className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-bold uppercase tracking-wider text-white transition-colors hover:bg-emerald-500"
                >
                  <PlugZap size={16} />
                  Entrar con Nostr
                </button>
              </div>
            </div>
          </>
        )}

        {activeStep === 'connect' && (
          <div className="mt-4 grid gap-3 lg:grid-cols-[1.15fr,0.85fr]">
            <div className="rounded-2xl border border-stone-700 bg-stone-800/70 p-3">
              <div className="mb-2 flex items-center gap-2 text-stone-200">
                <Shield size={18} className="text-sky-400" />
                <h3 className="font-bold">Elegí cómo entrar</h3>
              </div>
              <p className="mb-3 text-sm text-stone-400">Extensión para entrar rápido. Bunker para signer remoto.</p>

              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => void connectNip07()}
                  disabled={isBusy}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-sky-700 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isBusy && session.method === 'nip07' ? <LoaderCircle size={16} className="animate-spin" /> : <PlugZap size={16} />}
                  {isBusy && session.method === 'nip07' ? 'Conectando...' : 'Entrar con extensión Nostr'}
                </button>

                <div className="rounded-2xl border border-stone-700 bg-stone-900/70 p-3">
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-stone-400">
                    Bunker / NIP-46
                  </label>
                  <textarea
                    value={bunkerToken}
                    onChange={(event) => setBunkerToken(event.target.value)}
                    rows={3}
                    placeholder="bunker://..."
                    className="w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 outline-none transition-colors placeholder:text-stone-500 focus:border-emerald-500"
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void connectBunker(bunkerToken.trim())}
                      disabled={isBusy || bunkerToken.trim().length === 0}
                      className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isBusy && session.method === 'bunker' ? 'Conectando bunker...' : 'Entrar con bunker'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowQr((value) => !value)}
                      disabled={bunkerToken.trim().length === 0}
                      className="flex items-center gap-2 rounded-lg bg-stone-700 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-stone-600 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <QrCode size={15} />
                      {showQr ? 'Ocultar QR' : 'Generar QR'}
                    </button>
                  </div>
                  {showQr && bunkerQrUrl && (
                    <div className="mt-3 flex flex-col items-center rounded-2xl border border-stone-700 bg-stone-950/70 p-3">
                      <img src={bunkerQrUrl} alt="QR para bunker" className="h-44 w-44 rounded-xl bg-white p-2" />
                      <p className="mt-2 text-center text-xs text-stone-500">Escanea y sigue desde tu signer remoto.</p>
                    </div>
                  )}
                </div>
              </div>
              {session.error && (
                <div className="mt-3 rounded-xl border border-red-900/60 bg-red-950/30 px-3 py-2 text-sm text-red-200">
                  {session.error}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-stone-700 bg-stone-800/70 p-3">
              <div className="mb-2 flex items-center gap-2 text-stone-200">
                <Wifi size={18} className="text-emerald-400" />
                <h3 className="font-bold">Qué desbloquea</h3>
              </div>
              <ul className="space-y-2 text-sm text-stone-400">
                <li>Perfil real dentro del juego.</li>
                <li>Invitar rivales y seguir desafíos.</li>
                <li>Preparar amistosos y apuestas en sats.</li>
                <li className="flex items-center gap-2"><Wallet size={14} className="text-amber-300" /> Más adelante: premio al ganador.</li>
              </ul>

              <div className="mt-3 rounded-2xl border border-stone-700 bg-stone-900/60">
                <button
                  type="button"
                  onClick={() => setShowTechnicalNotes((value) => !value)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-stone-300 transition-colors hover:bg-stone-800/70"
                >
                  <span>Notas técnicas</span>
                  <ChevronDown size={15} className={`transition-transform ${showTechnicalNotes ? 'rotate-180' : ''}`} />
                </button>

                {showTechnicalNotes && (
                  <div className="border-t border-stone-700 px-3 py-3 text-xs text-stone-400">
                    <ul className="space-y-2">
                      <li>Caché local separada por pubkey.</li>
                      <li>Relays mixtos con refresh en segundo plano.</li>
                      <li>Preparado para partidas online y escrow.</li>
                      <li>NWC del juego pensado para recibir y pagar sats.</li>
                    </ul>
                    <div className="mt-3 rounded-xl border border-stone-700 bg-stone-950/60 p-3">
                      <p className="mb-2 font-semibold uppercase tracking-wider text-stone-300">Relays iniciales</p>
                      <div className="space-y-1">
                        {relays.map((relay) => (
                          <p key={relay} className="truncate">{relay}</p>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeStep !== 'intro' && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-stone-700 bg-stone-800/60 px-4 py-3 text-sm text-stone-300">
            <div className="flex items-center gap-2">
              {session.status === 'connecting' ? <LoaderCircle size={16} className="animate-spin text-sky-300" /> : <PlugZap size={16} className="text-sky-300" />}
              <span>
                {session.status === 'connected'
                  ? 'Tu identidad ya alimenta perfil, caché y flujo de desafíos.'
                  : 'Conectá tu identidad para desbloquear el reto real.'}
              </span>
            </div>
            {session.status === 'connected' && (
              <div className="ml-auto flex flex-wrap gap-2">
                <button type="button" onClick={() => void refreshProfile()} className="flex items-center gap-2 rounded-lg bg-stone-700 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-white transition-colors hover:bg-stone-600">
                  <RefreshCcw size={14} />
                  Actualizar perfil
                </button>
                <button type="button" onClick={disconnect} className="rounded-lg bg-red-700 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-white transition-colors hover:bg-red-600">
                  Salir
                </button>
              </div>
            )}
          </div>
        )}

        {activeStep === 'invite' && session.status === 'connected' && (
          <div className="mt-4 grid gap-3 lg:grid-cols-[1.1fr,0.9fr]">
            <ChallengeComposer />
            <ChallengeHistoryPanel />
          </div>
        )}

        <div className="mt-4 flex items-center justify-between gap-4 rounded-2xl border border-emerald-800/60 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-100">
          <p className="max-w-md">
            {activeStep === 'intro'
              ? 'Seguís entrenando o entrás al modo Nostr cuando quieras subir la apuesta.'
              : activeStep === 'connect'
                ? 'Entrás, conectás y enseguida pasás al panel para invitar rival.'
                : 'Ya estás adentro. El siguiente paso va a ser mandar desafíos reales por Nostr.'}
          </p>
          <button type="button" onClick={onClose} className="rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white transition-colors hover:bg-emerald-600">
            {activeStep === 'invite' ? 'Cerrar panel' : 'Seguir entrenando'}
          </button>
        </div>
      </div>
    </div>
  );
}
