/**
 * Match SFX.
 *
 * Ball hits: HTMLAudio from an in-memory blob URL (instant play after unlock).
 * Each hit creates a new Audio() so nothing can pause the first impact.
 *
 * Unlock uses a dedicated element that is never used for gameplay.
 * Whistle/goal still use Web Audio.
 */

import ballHitUrl from './sfx/ball-hit.wav';
import whistleUrl from './sfx/whistle.wav';
import goalCheer1Url from './sfx/goal-cheer-1.wav';
import goalCheer2Url from './sfx/goal-cheer-2.wav';
import goalCheer3Url from './sfx/goal-cheer-3.wav';
import goalCheer4Url from './sfx/goal-cheer-4.wav';
import goalCheer5Url from './sfx/goal-cheer-5.wav';
import type { BallHitLevel } from './physics';

export type SfxName = 'ballHit' | 'whistle' | 'goalCheer';

const GOAL_CHEER_URLS = [
  goalCheer1Url,
  goalCheer2Url,
  goalCheer3Url,
  goalCheer4Url,
  goalCheer5Url,
] as const;

const SFX_GAIN: Record<SfxName, number> = {
  ballHit: 1,
  whistle: 1.15,
  goalCheer: 0.95,
};

const BALL_HIT_LEVEL_GAIN: Record<BallHitLevel, number> = {
  1: 0.28,
  2: 0.48,
  3: 0.72,
  4: 1,
};

let muted = false;
let unlocked = false;
let ballHitBlobUrl: string | null = null;
let primedBallVoice: HTMLAudioElement | null = null;
/** Prevent GC from collecting in-flight HTMLAudio before play starts (kills 1st hit). */
const activeBallVoices = new Set<HTMLAudioElement>();

let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let webLoadPromise: Promise<void> | null = null;
let whistleBuffer: AudioBuffer | null = null;
const goalCheerBuffers: AudioBuffer[] = [];
let lastGoalVariant = -1;

function getAudioContextCtor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  return window.AudioContext
    || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    || null;
}

function ensureContext(): AudioContext | null {
  const Ctor = getAudioContextCtor();
  if (!Ctor) return null;
  if (!audioCtx) {
    audioCtx = new Ctor();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = muted ? 0 : 1;
    masterGain.connect(audioCtx.destination);
  }
  return audioCtx;
}

async function resumeContext(ctx: AudioContext) {
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      // Retry on next gesture.
    }
  }
}

async function decodeUrl(ctx: AudioContext, url: string): Promise<AudioBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch sfx (${response.status}): ${url}`);
  }
  const data = await response.arrayBuffer();
  return ctx.decodeAudioData(data.slice(0));
}

async function ensureBallHitBlob(): Promise<string> {
  if (ballHitBlobUrl) return ballHitBlobUrl;
  const response = await fetch(ballHitUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch ball hit (${response.status})`);
  }
  const blob = await response.blob();
  ballHitBlobUrl = URL.createObjectURL(blob);
  return ballHitBlobUrl;
}

/**
 * Unlock + preload. Prefer calling from a user gesture (pointerdown).
 */
export async function prepareAudio(): Promise<boolean> {
  try {
    const blobUrl = await ensureBallHitBlob();

    // Unlock with a dedicated element that is never reused for gameplay.
    const unlockEl = new Audio(blobUrl);
    unlockEl.muted = true;
    unlockEl.volume = 0;
    try {
      await unlockEl.play();
      unlockEl.pause();
      unlockEl.currentTime = 0;
      unlocked = true;
    } catch {
      // Will retry on next gesture.
    }

    // Pre-warm one real (muted) playback of a gameplay-style element so the
    // browser media pipeline is fully open before the first impact timer fires.
    if (unlocked) {
      const warm = primedBallVoice ?? new Audio(blobUrl);
      warm.preload = 'auto';
      warm.muted = true;
      warm.volume = 0;
      try {
        await warm.play();
        warm.pause();
        warm.currentTime = 0;
        warm.muted = false;
        warm.volume = SFX_GAIN.ballHit;
        primedBallVoice = warm;
      } catch {
        // Ignore.
      }
    }

    // Web Audio for whistle / goal.
    const ctx = ensureContext();
    if (ctx) {
      await resumeContext(ctx);
      if (!webLoadPromise) {
        webLoadPromise = (async () => {
          const [goals, whistle] = await Promise.all([
            Promise.all(GOAL_CHEER_URLS.map((url) => decodeUrl(ctx, url))),
            decodeUrl(ctx, whistleUrl),
          ]);
          goalCheerBuffers.length = 0;
          goalCheerBuffers.push(...goals);
          whistleBuffer = whistle;
        })().catch((error) => {
          console.error('[sfx] web load failed', error);
          webLoadPromise = null;
        });
      }
      await webLoadPromise;
      await resumeContext(ctx);
    }

    return unlocked;
  } catch (error) {
    console.error('[sfx] prepareAudio failed', error);
    return false;
  }
}

export function unlockAudio() {
  void prepareAudio();
}

function pickVariantIndex(count: number, lastIndex: number): number {
  if (count <= 1) return 0;
  let index = Math.floor(Math.random() * count);
  if (index === lastIndex) {
    index = (index + 1 + Math.floor(Math.random() * (count - 1))) % count;
  }
  return index;
}

function playBufferNow(buffer: AudioBuffer, gainValue: number): boolean {
  const ctx = ensureContext();
  if (!ctx || !masterGain || muted || ctx.state !== 'running') return false;

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.value = Math.min(gainValue, 4);
  source.connect(gain);
  gain.connect(masterGain);
  try {
    source.start(0);
    return true;
  } catch (error) {
    console.warn('[sfx] start failed', error);
    return false;
  }
}

function releaseBallVoice(voice: HTMLAudioElement) {
  activeBallVoices.delete(voice);
  try {
    voice.removeAttribute('src');
    voice.load();
  } catch {
    // Ignore cleanup errors.
  }
}

function playBallHit(level: BallHitLevel = 3) {
  if (muted) return;

  const voice = primedBallVoice ?? new Audio(ballHitBlobUrl || ballHitUrl);
  primedBallVoice = null;
  voice.preload = 'auto';
  voice.volume = SFX_GAIN.ballHit * BALL_HIT_LEVEL_GAIN[level];
  voice.muted = false;
  try {
    voice.pause();
    voice.currentTime = 0;
  } catch {
    // Ignore reset failures and try playback anyway.
  }

  // CRITICAL: retain the element until play finishes. Without this, V8 can GC the
  // first short-lived Audio() before the browser starts output — later hits survive
  // because more activity keeps the heap warm.
  activeBallVoices.add(voice);

  const onDone = () => releaseBallVoice(voice);
  voice.addEventListener('ended', onDone, { once: true });
  voice.addEventListener('error', onDone, { once: true });

  void voice.play()
    .catch((error) => {
      console.warn('[sfx] ballHit play failed, retrying', error);
      releaseBallVoice(voice);
      void prepareAudio().then(() => {
        const retry = new Audio(ballHitBlobUrl || ballHitUrl);
        retry.volume = SFX_GAIN.ballHit * BALL_HIT_LEVEL_GAIN[level];
        activeBallVoices.add(retry);
        const releaseRetry = () => releaseBallVoice(retry);
        retry.addEventListener('ended', releaseRetry, { once: true });
        retry.addEventListener('error', releaseRetry, { once: true });
        void retry.play().catch((retryError) => {
          console.warn('[sfx] ballHit retry failed', retryError);
          releaseBallVoice(retry);
        });
      });
    });
}

export function setMuted(next: boolean) {
  muted = next;
  if (masterGain && audioCtx) {
    masterGain.gain.setTargetAtTime(next ? 0 : 1, audioCtx.currentTime, 0.015);
  }
}

export function isMuted() {
  return muted;
}

export function playSfx(name: SfxName) {
  if (muted) return;

  if (name === 'ballHit') {
    playBallHit();
    return;
  }

  const ctx = ensureContext();
  if (!ctx) return;

  const playOther = () => {
    if (muted || ctx.state !== 'running') return;
    if (name === 'whistle') {
      if (whistleBuffer) playBufferNow(whistleBuffer, SFX_GAIN.whistle);
      return;
    }
    if (goalCheerBuffers.length === 0) return;
    const index = pickVariantIndex(goalCheerBuffers.length, lastGoalVariant);
    lastGoalVariant = index;
    playBufferNow(goalCheerBuffers[index], SFX_GAIN.goalCheer);
  };

  if (
    ctx.state !== 'running'
    || (name === 'whistle' && !whistleBuffer)
    || (name === 'goalCheer' && goalCheerBuffers.length === 0)
  ) {
    void prepareAudio().then(playOther);
    return;
  }

  playOther();
}

export function playSfxReliable(name: SfxName) {
  playSfx(name);
}

export type ScheduledBallHits = {
  count: number;
  stop: () => void;
};

/**
 * Schedule every ball impact (including the first) with the same HTMLAudio path.
 */
export function scheduleBallHits(delaysMs: number[], levels: BallHitLevel[] = []): ScheduledBallHits {
  const timers: number[] = [];

  const stop = () => {
    for (const id of timers) {
      window.clearTimeout(id);
    }
    timers.length = 0;
  };

  if (muted) {
    return { count: 0, stop };
  }

  for (let i = 0; i < delaysMs.length; i += 1) {
    const delay = Math.max(0, Math.round(delaysMs[i]));
    const id = window.setTimeout(() => {
      playBallHit(levels[i] ?? 3);
    }, delay);
    timers.push(id);
  }

  return { count: timers.length, stop };
}
