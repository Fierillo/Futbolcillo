import type { ImpactEvent, MatchState, PhysicsBall, PhysicsPlayer } from './physics';
import { createInitialMatchState, MAX_SHOOT_POWER } from './physics';
import type { GameState, Particle, Vec2 } from './types';

export const SHOT_POWER_SCALE = 0.15;

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

export function getShotPowerFromDragDistance(dragDistance: number) {
  return dragDistance * SHOT_POWER_SCALE;
}

export function getMinimumShotDragDistance(playerRadius: number) {
  return playerRadius * 0.5;
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
    impactWaves: [],
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

export function handleDetachedPointerMove(state: GameState, pointerStart: Vec2, x: number, y: number) {
  if (state.selectedPlayer === null || !state.dragStart) return;
  state.dragCurrent = vec2(
    state.dragStart.x + x - pointerStart.x,
    state.dragStart.y + y - pointerStart.y,
  );
}

export function consumeShotInput(state: GameState): LocalShotCandidate | null {
  if (state.selectedPlayer === null || !state.dragStart || !state.dragCurrent) {
    return null;
  }

  const player = state.players[state.selectedPlayer];
  const dx = state.dragStart.x - state.dragCurrent.x;
  const dy = state.dragStart.y - state.dragCurrent.y;
  const dragDistance = Math.sqrt(dx * dx + dy * dy);
  const power = getShotPowerFromDragDistance(dragDistance);
  const clampedPower = clamp(power, 0, MAX_SHOOT_POWER);

  clearPointerSelection(state);
  if (dragDistance <= getMinimumShotDragDistance(player.radius)) return null;

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

export function spawnImpactEffect(state: GameState, impact: ImpactEvent) {
  const playerPositions = impact.playerIndices
    .map((index) => state.players[index]?.pos)
    .filter((pos): pos is Vec2 => Boolean(pos));
  const involvedPositions = impact.kind === 'disc-ball'
    ? [...playerPositions, state.ball.pos]
    : impact.kind === 'ball-wall'
      ? [state.ball.pos]
      : playerPositions;
  if (involvedPositions.length === 0) return;

  const contact = involvedPositions.reduce(
    (sum, pos) => ({ x: sum.x + pos.x, y: sum.y + pos.y }),
    { x: 0, y: 0 },
  );
  contact.x /= involvedPositions.length;
  contact.y /= involvedPositions.length;

  const countByLevel = [0, 4, 8, 14, 22];
  const speedByLevel = [0, 0.6, 1.2, 2.1, 3.2];
  const sizeByLevel = [0, 1.2, 1.8, 2.7, 3.8];
  const colorByLevel = ['', '#dbeafe', '#fde68a', '#fbbf24', '#fb7185'];
  const shakeByLevel = [0, 0, 0.8, 1.8, 3.2];
  const level = impact.level;

  spawnParticles(
    state,
    contact,
    countByLevel[level],
    colorByLevel[level],
    speedByLevel[level],
    sizeByLevel[level],
  );
  state.impactWaves.push({
    pos: { ...contact },
    radius: 5 + level * 2,
    growth: 1.2 + level * 0.65,
    life: 1,
    color: colorByLevel[level],
    lineWidth: 1 + level * 0.65,
  });
  state.cameraShake = Math.max(state.cameraShake, shakeByLevel[level]);
}

export function advanceImpactEffects(state: GameState) {
  for (let i = state.particles.length - 1; i >= 0; i -= 1) {
    const particle = state.particles[i];
    particle.pos.x += particle.vel.x;
    particle.pos.y += particle.vel.y;
    particle.vel.y += 0.05;
    particle.life -= 0.04;
    if (particle.life <= 0) {
      state.particles.splice(i, 1);
    }
  }

  for (let i = state.impactWaves.length - 1; i >= 0; i -= 1) {
    const wave = state.impactWaves[i];
    wave.radius += wave.growth;
    wave.life -= 0.07;
    if (wave.life <= 0) {
      state.impactWaves.splice(i, 1);
    }
  }

  if (state.cameraShake > 0) {
    state.cameraShake *= 0.86;
    if (state.cameraShake < 0.3) state.cameraShake = 0;
  }
}

export function advanceVisualEffects(state: GameState) {
  advanceImpactEffects(state);

  if (state.messageTimer > 0) {
    state.messageTimer -= 1;
    if (state.messageTimer <= 0) {
      state.messageTimer = 0;
      state.message = '';
    }
  }
}

export function hasActiveVisualEffects(state: GameState) {
  return state.messageTimer > 0
    || state.cameraShake > 0
    || state.particles.length > 0
    || state.impactWaves.length > 0;
}

export type { LocalShotCandidate, Particle };
