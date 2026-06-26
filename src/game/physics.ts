import {
  FIELD_WIDTH,
  FIELD_HEIGHT,
  PLAYER_RADIUS,
  BALL_RADIUS,
  GOAL_WIDTH,
  GOAL_HEIGHT,
  FRICTION,
  STOP_THRESHOLD,
  MOVEMENT_SCALE,
  WIN_SCORE,
} from './types';

export interface PhysicsVec2 {
  x: number;
  y: number;
}

export interface PhysicsPlayer {
  pos: PhysicsVec2;
  vel: PhysicsVec2;
  radius: number;
  mass: number;
  team: 'home' | 'away';
  number: number;
}

export interface PhysicsBall {
  pos: PhysicsVec2;
  vel: PhysicsVec2;
  radius: number;
  mass: number;
  trail: PhysicsVec2[];
}

export interface PhysicsGoal {
  x: number;
  y: number;
  width: number;
  height: number;
  team: 'home' | 'away';
}

export interface ShotAnimation {
  initialState: MatchState;
  playerIndex: number;
  velX: number;
  velY: number;
}

export interface MatchState {
  players: PhysicsPlayer[];
  ball: PhysicsBall;
  goals: PhysicsGoal[];
  score: { home: number; away: number };
  turn: 'home' | 'away';
  bonusTurnTeam: 'home' | 'away' | null;
  pendingBonusTurns: number;
  phase: 'aiming' | 'shooting' | 'resetting';
  activeShotPlayer: number | null;
  activeShotTouchedBall: boolean;
  activeShotCommittedFoul: boolean;
  winner: 'home' | 'away' | null;
  lastShot: { playerIndex: number; velX: number; velY: number } | null;
  lastShotAnimation: ShotAnimation | null;
}

export function createInitialMatchState(homePubkey: string, awayPubkey: string): MatchState & { homePubkey: string; awayPubkey: string } {
  const players: PhysicsPlayer[] = [];
  const awayPositions = [
    { x: 180, y: 220 },
    { x: 180, y: 380 },
    { x: 320, y: 300 },
  ];
  const homePositions = [
    { x: 820, y: 220 },
    { x: 820, y: 380 },
    { x: 680, y: 300 },
  ];

  awayPositions.forEach((pos, i) => {
    players.push({ pos: { x: pos.x, y: pos.y }, vel: { x: 0, y: 0 }, radius: PLAYER_RADIUS, mass: 3, team: 'away', number: i + 1 });
  });
  homePositions.forEach((pos, i) => {
    players.push({ pos: { x: pos.x, y: pos.y }, vel: { x: 0, y: 0 }, radius: PLAYER_RADIUS, mass: 3, team: 'home', number: i + 1 });
  });

  return {
    homePubkey,
    awayPubkey,
    players,
    ball: {
      pos: { x: FIELD_WIDTH / 2, y: FIELD_HEIGHT / 2 },
      vel: { x: 0, y: 0 },
      radius: BALL_RADIUS,
      mass: 1,
      trail: [],
    },
    goals: [
      { x: 0, y: FIELD_HEIGHT / 2 - GOAL_HEIGHT / 2, width: GOAL_WIDTH, height: GOAL_HEIGHT, team: 'away' },
      { x: FIELD_WIDTH - GOAL_WIDTH, y: FIELD_HEIGHT / 2 - GOAL_HEIGHT / 2, width: GOAL_WIDTH, height: GOAL_HEIGHT, team: 'home' },
    ],
    score: { home: 0, away: 0 },
    turn: 'home',
    bonusTurnTeam: null,
    pendingBonusTurns: 0,
    phase: 'aiming',
    activeShotPlayer: null,
    activeShotTouchedBall: false,
    activeShotCommittedFoul: false,
    winner: null,
    lastShot: null,
    lastShotAnimation: null,
  };
}

function vec2Dist(a: PhysicsVec2, b: PhysicsVec2): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function areCirclesTouching(
  a: { pos: PhysicsVec2; radius: number },
  b: { pos: PhysicsVec2; radius: number },
  tolerance = 0.5
) {
  return vec2Dist(a.pos, b.pos) <= a.radius + b.radius + tolerance;
}

function resolveCircleCollision(
  a: { pos: PhysicsVec2; vel: PhysicsVec2; radius: number; mass: number },
  b: { pos: PhysicsVec2; vel: PhysicsVec2; radius: number; mass: number }
) {
  const dx = b.pos.x - a.pos.x;
  const dy = b.pos.y - a.pos.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const minDist = a.radius + b.radius;

  if (distance < minDist && distance > 0) {
    const overlap = minDist - distance;
    const nx = dx / distance;
    const ny = dy / distance;
    const totalMass = a.mass + b.mass;

    a.pos.x -= (overlap * b.mass / totalMass) * nx;
    a.pos.y -= (overlap * b.mass / totalMass) * ny;
    b.pos.x += (overlap * a.mass / totalMass) * nx;
    b.pos.y += (overlap * a.mass / totalMass) * ny;

    const rvx = b.vel.x - a.vel.x;
    const rvy = b.vel.y - a.vel.y;
    const velAlongNormal = rvx * nx + rvy * ny;

    if (velAlongNormal > 0) return;

    const restitution = 0.7;
    const impulse = -(1 + restitution) * velAlongNormal / totalMass;

    a.vel.x -= impulse * b.mass * nx;
    a.vel.y -= impulse * b.mass * ny;
    b.vel.x += impulse * a.mass * nx;
    b.vel.y += impulse * a.mass * ny;
  }
}

function checkGoal(state: MatchState): 'home' | 'away' | null {
  const ball = state.ball;
  for (const goal of state.goals) {
    const inGoalY = ball.pos.y > goal.y && ball.pos.y < goal.y + goal.height;
    if (!inGoalY) continue;

    const inGoalX = ball.pos.x >= goal.x && ball.pos.x <= goal.x + goal.width;
    if (!inGoalX) continue;

    if (goal.team === 'home') {
      return 'away';
    } else {
      return 'home';
    }
  }
  return null;
}

function resetPositions(state: MatchState) {
  state.ball.pos = { x: FIELD_WIDTH / 2, y: FIELD_HEIGHT / 2 };
  state.ball.vel = { x: 0, y: 0 };
  state.ball.trail = [];

  const awayPositions = [
    { x: 180, y: 220 },
    { x: 180, y: 380 },
    { x: 320, y: 300 },
  ];
  const homePositions = [
    { x: 820, y: 220 },
    { x: 820, y: 380 },
    { x: 680, y: 300 },
  ];

  let hi = 0, ai = 0;
  for (const p of state.players) {
    p.vel = { x: 0, y: 0 };
    if (p.team === 'away') {
      p.pos = { x: awayPositions[ai].x, y: awayPositions[ai].y };
      ai++;
    } else {
      p.pos = { x: homePositions[hi].x, y: homePositions[hi].y };
      hi++;
    }
  }

  state.phase = 'aiming';
  state.activeShotPlayer = null;
  state.activeShotTouchedBall = false;
  state.activeShotCommittedFoul = false;
  state.bonusTurnTeam = null;
  state.pendingBonusTurns = 0;
  const scoringTeam = state.turn;
  state.turn = scoringTeam === 'home' ? 'away' : 'home';
}

export function simulateShot(
  state: MatchState,
  playerIndex: number,
  velX: number,
  velY: number,
  maxFrames = 600
): MatchState {
  const deepState: MatchState = JSON.parse(JSON.stringify(state));

  const player = deepState.players[playerIndex];
  if (!player || deepState.phase !== 'aiming' || deepState.turn !== player.team || deepState.winner) {
    return deepState;
  }

  // Store animation data BEFORE simulating - both clients replay from this
  deepState.lastShotAnimation = {
    initialState: JSON.parse(JSON.stringify(deepState)),
    playerIndex,
    velX,
    velY,
  };

  player.vel.x = velX;
  player.vel.y = velY;
  deepState.phase = 'shooting';
  deepState.activeShotPlayer = playerIndex;
  deepState.activeShotTouchedBall = false;
  deepState.activeShotCommittedFoul = false;

  for (let frame = 0; frame < maxFrames; frame++) {
    const done = simulateStep(deepState);
    if (done) break;
  }

  return deepState;
}

export function simulateStep(state: MatchState): boolean {
  let allStopped = true;

  for (const p of state.players) {
    p.pos.x += p.vel.x * MOVEMENT_SCALE;
    p.pos.y += p.vel.y * MOVEMENT_SCALE;
    p.vel.x *= FRICTION;
    p.vel.y *= FRICTION;
    if (Math.abs(p.vel.x) < STOP_THRESHOLD) p.vel.x = 0;
    if (Math.abs(p.vel.y) < STOP_THRESHOLD) p.vel.y = 0;
    if (Math.abs(p.vel.x) > 0.1 || Math.abs(p.vel.y) > 0.1) allStopped = false;

    if (p.pos.x < p.radius) { p.pos.x = p.radius; p.vel.x = -p.vel.x * 0.6; }
    if (p.pos.x > FIELD_WIDTH - p.radius) { p.pos.x = FIELD_WIDTH - p.radius; p.vel.x = -p.vel.x * 0.6; }
    if (p.pos.y < p.radius) { p.pos.y = p.radius; p.vel.y = -p.vel.y * 0.6; }
    if (p.pos.y > FIELD_HEIGHT - p.radius) { p.pos.y = FIELD_HEIGHT - p.radius; p.vel.y = -p.vel.y * 0.6; }
  }

  const ball = state.ball;
  ball.pos.x += ball.vel.x * MOVEMENT_SCALE;
  ball.pos.y += ball.vel.y * MOVEMENT_SCALE;
  ball.vel.x *= FRICTION;
  ball.vel.y *= FRICTION;
  if (Math.abs(ball.vel.x) < STOP_THRESHOLD) ball.vel.x = 0;
  if (Math.abs(ball.vel.y) < STOP_THRESHOLD) ball.vel.y = 0;
  if (Math.abs(ball.vel.x) > 0.1 || Math.abs(ball.vel.y) > 0.1) allStopped = false;

  if (Math.abs(ball.vel.x) > 1 || Math.abs(ball.vel.y) > 1) {
    ball.trail.push({ x: ball.pos.x, y: ball.pos.y });
    if (ball.trail.length > 15) ball.trail.shift();
  } else if (ball.trail.length > 0) {
    ball.trail.shift();
  }

  const inHomeGoal = ball.pos.y > state.goals[0].y && ball.pos.y < state.goals[0].y + state.goals[0].height;
  const inAwayGoal = ball.pos.y > state.goals[1].y && ball.pos.y < state.goals[1].y + state.goals[1].height;
  const goalsBlockedByFoul = state.activeShotCommittedFoul;

  if (ball.pos.x < ball.radius) {
    if (!(inHomeGoal && !goalsBlockedByFoul)) { ball.pos.x = ball.radius; ball.vel.x = -ball.vel.x * 0.6; }
  }
  if (ball.pos.x > FIELD_WIDTH - ball.radius) {
    if (!(inAwayGoal && !goalsBlockedByFoul)) { ball.pos.x = FIELD_WIDTH - ball.radius; ball.vel.x = -ball.vel.x * 0.6; }
  }
  if (ball.pos.y < ball.radius) { ball.pos.y = ball.radius; ball.vel.y = -ball.vel.y * 0.6; }
  if (ball.pos.y > FIELD_HEIGHT - ball.radius) { ball.pos.y = FIELD_HEIGHT - ball.radius; ball.vel.y = -ball.vel.y * 0.6; }

  const goalScorer = goalsBlockedByFoul ? null : checkGoal(state);
  if (goalScorer) {
    state.score[goalScorer]++;
    if (state.score[goalScorer] >= WIN_SCORE) {
      state.winner = goalScorer;
    }
    resetPositions(state);
    return true;
  }

  for (let i = 0; i < state.players.length; i++) {
    const p = state.players[i];
    if (
      state.phase === 'shooting' &&
      state.activeShotPlayer === i &&
      !state.activeShotTouchedBall &&
      areCirclesTouching(p, state.ball)
    ) {
      state.activeShotTouchedBall = true;
    }
    resolveCircleCollision(p, state.ball);
  }

  for (let i = 0; i < state.players.length; i++) {
    for (let j = i + 1; j < state.players.length; j++) {
      if (
        state.phase === 'shooting' &&
        state.activeShotPlayer !== null &&
        !state.activeShotTouchedBall &&
        !state.activeShotCommittedFoul &&
        (state.activeShotPlayer === i || state.activeShotPlayer === j)
      ) {
        const first = state.players[i];
        const second = state.players[j];
        const shooter = state.activeShotPlayer === i ? first : second;
        const other = state.activeShotPlayer === i ? second : first;

        if (shooter.team !== other.team && areCirclesTouching(shooter, other)) {
          state.activeShotCommittedFoul = true;
          state.bonusTurnTeam = other.team;
          state.pendingBonusTurns = 1;
        }
      }
      resolveCircleCollision(state.players[i], state.players[j]);
    }
  }

  if (allStopped) {
    state.phase = 'aiming';
    if (state.pendingBonusTurns > 0 && state.bonusTurnTeam === state.turn) {
      state.pendingBonusTurns--;
      if (state.pendingBonusTurns <= 0) {
        state.pendingBonusTurns = 0;
        state.bonusTurnTeam = null;
      }
    } else {
      state.turn = state.turn === 'home' ? 'away' : 'home';
    }
    state.activeShotPlayer = null;
    state.activeShotTouchedBall = false;
    state.activeShotCommittedFoul = false;
    return true;
  }

  return false;
}
