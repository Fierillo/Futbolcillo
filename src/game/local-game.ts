import type { MatchState, PhysicsBall, PhysicsPlayer } from './physics';
import { createInitialMatchState, MAX_SHOOT_POWER } from './physics';
import type { GameState, Particle, Vec2 } from './types';

interface LocalShotCandidate {
  playerIndex: number;
  playerTeam: 'home' | 'away';
  playerNumber: number;
  velX: number;
  velY: number;
}

function vec2(x = 0, y = 0): Vec2 {
  return { x, y };
}

function dist(a: Vec2, b: Vec2): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function normalize(v: Vec2): Vec2 {
  const len = Math.sqrt(v.x * v.x + v.y * v.y);
  if (len === 0) return vec2(0, 0);
  return vec2(v.x / len, v.y / len);
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function createVisualPlayers(players: PhysicsPlayer[]): GameState['players'] {
  return players.map((p) => ({
    ...p,
    isSelected: false,
    cooldown: 0,
    color: p.team === 'away' ? '#b91c1c' : '#1e40af',
    strokeColor: p.team === 'away' ? '#f87171' : '#60a5fa',
  }));
}

export function createVisualBall(ball: PhysicsBall): GameState['ball'] {
  return {
    ...ball,
    color: '#fbbf24',
    strokeColor: '#f59e0b',
  };
}

export function createInitialState(): GameState {
  const matchState = createInitialMatchState('training-home', 'training-away');
  matchState.turn = 'away';
  return {
    players: createVisualPlayers(matchState.players),
    ball: createVisualBall(matchState.ball),
    goals: [...matchState.goals],
    score: { ...matchState.score },
    turn: matchState.turn,
    bonusTurnTeam: matchState.bonusTurnTeam,
    pendingBonusTurns: matchState.pendingBonusTurns,
    phase: matchState.phase,
    selectedPlayer: null,
    activeShotPlayer: matchState.activeShotPlayer,
    activeShotTouchedBall: matchState.activeShotTouchedBall,
    activeShotCommittedFoul: matchState.activeShotCommittedFoul,
    dragStart: null,
    dragCurrent: null,
    winner: matchState.winner,
    lastShot: matchState.lastShot,
    lastShotAnimation: null,
    message: '',
    messageTimer: 0,
    particles: [],
    cameraShake: 0,
  };
}

export function toMatchState(state: GameState): MatchState {
  return {
    players: state.players.map((player) => ({
      pos: { ...player.pos },
      vel: { ...player.vel },
      radius: player.radius,
      mass: player.mass,
      team: player.team,
      number: player.number,
    })),
    ball: {
      pos: { ...state.ball.pos },
      vel: { ...state.ball.vel },
      radius: state.ball.radius,
      mass: state.ball.mass,
      trail: state.ball.trail.map((point) => ({ ...point })),
    },
    goals: state.goals.map((goal) => ({ ...goal })),
    score: { ...state.score },
    turn: state.turn,
    bonusTurnTeam: state.bonusTurnTeam,
    pendingBonusTurns: state.pendingBonusTurns,
    phase: state.phase,
    activeShotPlayer: state.activeShotPlayer,
    activeShotTouchedBall: state.activeShotTouchedBall,
    activeShotCommittedFoul: state.activeShotCommittedFoul,
    winner: state.winner,
    lastShot: state.lastShot ? { ...state.lastShot } : null,
  };
}

export function syncMatchStateToGameState(prev: GameState, matchState: MatchState): GameState {
  return {
    ...prev,
    players: createVisualPlayers(matchState.players),
    ball: createVisualBall(matchState.ball),
    goals: [...matchState.goals],
    score: { ...matchState.score },
    turn: matchState.turn,
    phase: matchState.phase,
    winner: matchState.winner,
    activeShotPlayer: matchState.activeShotPlayer,
    activeShotTouchedBall: matchState.activeShotTouchedBall,
    activeShotCommittedFoul: matchState.activeShotCommittedFoul,
    bonusTurnTeam: matchState.bonusTurnTeam,
    pendingBonusTurns: matchState.pendingBonusTurns,
    lastShot: matchState.lastShot,
    lastShotAnimation: null,
    selectedPlayer: null,
    dragStart: null,
    dragCurrent: null,
  };
}

export function clearPointerSelection(state: GameState) {
  if (state.selectedPlayer !== null) {
    const selected = state.players[state.selectedPlayer];
    if (selected) selected.isSelected = false;
  }
  state.selectedPlayer = null;
  state.dragStart = null;
  state.dragCurrent = null;
}

export function handlePointerDown(state: GameState, x: number, y: number) {
  if (state.phase !== 'aiming' || state.winner) return;

  let closestIndex: number | null = null;
  let closestDist = Infinity;
  for (let i = 0; i < state.players.length; i += 1) {
    const player = state.players[i];
    if (player.team !== state.turn) continue;
    const playerDist = dist(player.pos, vec2(x, y));
    if (playerDist < player.radius + 15 && playerDist < closestDist) {
      closestIndex = i;
      closestDist = playerDist;
    }
  }

  if (closestIndex === null) return;
  const player = state.players[closestIndex];
  player.isSelected = true;
  state.selectedPlayer = closestIndex;
  state.dragStart = vec2(player.pos.x, player.pos.y);
  state.dragCurrent = vec2(x, y);
}

export function handlePointerMove(state: GameState, x: number, y: number) {
  if (state.selectedPlayer === null || !state.dragStart) return;
  state.dragCurrent = vec2(x, y);
}

export function consumeShotInput(state: GameState): LocalShotCandidate | null {
  if (state.selectedPlayer === null || !state.dragStart || !state.dragCurrent) {
    return null;
  }

  const player = state.players[state.selectedPlayer];
  const dx = state.dragStart.x - state.dragCurrent.x;
  const dy = state.dragStart.y - state.dragCurrent.y;
  const power = Math.sqrt(dx * dx + dy * dy) * 0.15;
  const clampedPower = clamp(power, 0, MAX_SHOOT_POWER);

  clearPointerSelection(state);
  if (clampedPower <= 1) return null;

  const dir = normalize(vec2(dx, dy));
  return {
    playerIndex: state.players.indexOf(player),
    playerTeam: player.team,
    playerNumber: player.number,
    velX: dir.x * clampedPower,
    velY: dir.y * clampedPower,
  };
}

export function spawnParticles(state: GameState, pos: Vec2, count: number, color: string, speed: number, size: number) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const particleSpeed = Math.random() * speed + 1;
    state.particles.push({
      pos: vec2(pos.x, pos.y),
      vel: vec2(Math.cos(angle) * particleSpeed, Math.sin(angle) * particleSpeed),
      life: 1,
      maxLife: 1,
      color,
      size: Math.random() * size + 1,
    });
  }
}

export function advanceVisualEffects(state: GameState) {
  for (let i = state.particles.length - 1; i >= 0; i -= 1) {
    const particle = state.particles[i];
    particle.pos.x += particle.vel.x;
    particle.pos.y += particle.vel.y;
    particle.vel.y += 0.05;
    particle.life -= 0.015;
    if (particle.life <= 0) {
      state.particles.splice(i, 1);
    }
  }

  if (state.cameraShake > 0) {
    state.cameraShake *= 0.9;
    if (state.cameraShake < 0.5) state.cameraShake = 0;
  }

  if (state.messageTimer > 0) {
    state.messageTimer -= 1;
    if (state.messageTimer <= 0) {
      state.messageTimer = 0;
      state.message = '';
    }
  }
}

export function hasActiveVisualEffects(state: GameState) {
  return state.messageTimer > 0 || state.cameraShake > 0 || state.particles.length > 0;
}

export type { LocalShotCandidate, Particle };
