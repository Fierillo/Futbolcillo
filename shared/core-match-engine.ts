export const FIELD_WIDTH = 1000;
export const FIELD_HEIGHT = 600;
export const PLAYER_RADIUS = 22;
export const BALL_RADIUS = 14;
export const GOAL_WIDTH = 20;
export const GOAL_HEIGHT = 160;
export const MAX_SHOOT_POWER = 18;
export const FRICTION = 0.985;
export const STOP_THRESHOLD = 0.08;
export const MOVEMENT_SCALE = 0.5;
export const WIN_SCORE = 3;

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

export interface ShotFrame {
  players: PhysicsVec2[];
  ball: PhysicsVec2;
}

export interface ShotOutcome {
  foul: {
    byTeam: 'home' | 'away';
    victimTeam: 'home' | 'away';
  } | null;
}

export interface ShotAnimation {
  id: string;
  initialState: MatchState;
  finalState: MatchState;
  frames: ShotFrame[];
  playerIndex: number;
  velX: number;
  velY: number;
  outcome: ShotOutcome;
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
  lastShot: { id: string; playerIndex: number; velX: number; velY: number } | null;
}

type TurnStateLike = Pick<MatchState, 'turn' | 'bonusTurnTeam' | 'pendingBonusTurns'>;

type FoulStateLike<TPlayer extends Pick<PhysicsPlayer, 'team' | 'pos' | 'radius'>> = Pick<MatchState, 'phase' | 'activeShotPlayer' | 'activeShotTouchedBall' | 'activeShotCommittedFoul' | 'bonusTurnTeam' | 'pendingBonusTurns'> & {
  players: TPlayer[];
};

export function compactMatchState(state: MatchState): MatchState {
  return JSON.parse(JSON.stringify(state)) as MatchState;
}

export function advanceTurnAfterShot<TState extends TurnStateLike>(state: TState) {
  const nextTurn = state.turn === 'home' ? 'away' : 'home';
  if (state.bonusTurnTeam && state.pendingBonusTurns > 0 && state.turn === state.bonusTurnTeam) {
    state.pendingBonusTurns -= 1;
    if (state.pendingBonusTurns <= 0) {
      state.pendingBonusTurns = 0;
      state.bonusTurnTeam = null;
    }
    return;
  }

  state.turn = nextTurn;
}

export function detectAndApplyShotFoul<TPlayer extends Pick<PhysicsPlayer, 'team' | 'pos' | 'radius'>>(
  state: FoulStateLike<TPlayer>,
  firstIndex: number,
  secondIndex: number,
) {
  if (
    state.phase !== 'shooting'
    || state.activeShotPlayer === null
    || state.activeShotTouchedBall
    || state.activeShotCommittedFoul
    || (state.activeShotPlayer !== firstIndex && state.activeShotPlayer !== secondIndex)
  ) {
    return null;
  }

  const first = state.players[firstIndex];
  const second = state.players[secondIndex];
  const shooter = state.activeShotPlayer === firstIndex ? first : second;
  const other = shooter === first ? second : first;

  if (shooter.team === other.team || !areCirclesTouching(shooter, other)) {
    return null;
  }

  state.activeShotCommittedFoul = true;
  state.bonusTurnTeam = other.team;
  state.pendingBonusTurns = 1;

  return {
    byTeam: shooter.team,
    victimTeam: other.team,
  } satisfies NonNullable<ShotOutcome['foul']>;
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
  };
}

function vec2Dist(a: PhysicsVec2, b: PhysicsVec2): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function areCirclesTouching(
  a: { pos: PhysicsVec2; radius: number },
  b: { pos: PhysicsVec2; radius: number },
  tolerance = 0.5,
) {
  return vec2Dist(a.pos, b.pos) <= a.radius + b.radius + tolerance;
}

function resolveCircleCollision(
  a: { pos: PhysicsVec2; vel: PhysicsVec2; radius: number; mass: number },
  b: { pos: PhysicsVec2; vel: PhysicsVec2; radius: number; mass: number },
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
  if (state.activeShotCommittedFoul) {
    return null;
  }

  const ball = state.ball;
  for (const goal of state.goals) {
    const inGoalY = ball.pos.y > goal.y && ball.pos.y < goal.y + goal.height;
    if (!inGoalY) continue;

    const inGoalX = ball.pos.x >= goal.x && ball.pos.x <= goal.x + goal.width;
    if (!inGoalX) continue;

    if (goal.team === 'home') {
      return 'away';
    }

    return 'home';
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

  let hi = 0;
  let ai = 0;
  for (const p of state.players) {
    p.vel = { x: 0, y: 0 };
    if (p.team === 'away') {
      p.pos = { x: awayPositions[ai].x, y: awayPositions[ai].y };
      ai += 1;
    } else {
      p.pos = { x: homePositions[hi].x, y: homePositions[hi].y };
      hi += 1;
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
  shotId = 'local-shot',
  maxFrames = 600,
): MatchState {
  const deepState: MatchState = compactMatchState(state);

  const player = deepState.players[playerIndex];
  if (!player || deepState.phase !== 'aiming' || deepState.turn !== player.team || deepState.winner) {
    return deepState;
  }

  deepState.lastShot = { id: shotId, playerIndex, velX, velY };
  player.vel.x = velX;
  player.vel.y = velY;
  deepState.phase = 'shooting';
  deepState.activeShotPlayer = playerIndex;
  deepState.activeShotTouchedBall = false;
  deepState.activeShotCommittedFoul = false;
  const outcome: ShotOutcome = { foul: null };

  for (let frame = 0; frame < maxFrames; frame += 1) {
    const done = simulateStepWithOutcome(deepState, outcome);
    if (done) break;
  }

  return deepState;
}

export function simulateShotWithFrames(
  state: MatchState,
  playerIndex: number,
  velX: number,
  velY: number,
  shotId = 'local-shot',
  maxFrames = 600,
) {
  const initialState = compactMatchState(state);
  const workingState = compactMatchState(state);
  const outcome: ShotOutcome = { foul: null };
  const frames: ShotFrame[] = [
    {
      players: workingState.players.map((p) => ({ x: p.pos.x, y: p.pos.y })),
      ball: { x: workingState.ball.pos.x, y: workingState.ball.pos.y },
    },
  ];

  const player = workingState.players[playerIndex];
  if (!player || workingState.phase !== 'aiming' || workingState.turn !== player.team || workingState.winner) {
    return {
      finalState: workingState,
      shotAnimation: {
        id: shotId,
        initialState,
        finalState: workingState,
        frames,
        playerIndex,
        velX,
        velY,
        outcome,
      } satisfies ShotAnimation,
    };
  }

  workingState.lastShot = { id: shotId, playerIndex, velX, velY };
  player.vel.x = velX;
  player.vel.y = velY;
  workingState.phase = 'shooting';
  workingState.activeShotPlayer = playerIndex;
  workingState.activeShotTouchedBall = false;
  workingState.activeShotCommittedFoul = false;

  for (let frame = 0; frame < maxFrames; frame += 1) {
    const done = simulateStepWithOutcome(workingState, outcome);
    frames.push({
      players: workingState.players.map((p) => ({ x: p.pos.x, y: p.pos.y })),
      ball: { x: workingState.ball.pos.x, y: workingState.ball.pos.y },
    });
    if (done) break;
  }

  const finalState = compactMatchState(workingState);
  return {
    finalState,
    shotAnimation: {
      id: shotId,
      initialState,
      finalState,
      frames,
      playerIndex,
      velX,
      velY,
      outcome,
    } satisfies ShotAnimation,
  };
}

function simulateStepWithOutcome(state: MatchState, outcome: ShotOutcome): boolean {
  const activePlayerIndex = state.activeShotPlayer;

  for (const player of state.players) {
    player.pos.x += player.vel.x * MOVEMENT_SCALE;
    player.pos.y += player.vel.y * MOVEMENT_SCALE;
    player.vel.x *= FRICTION;
    player.vel.y *= FRICTION;

    if (player.pos.x - player.radius < 0) {
      player.pos.x = player.radius;
      player.vel.x *= -0.8;
    }
    if (player.pos.x + player.radius > FIELD_WIDTH) {
      player.pos.x = FIELD_WIDTH - player.radius;
      player.vel.x *= -0.8;
    }
    if (player.pos.y - player.radius < 0) {
      player.pos.y = player.radius;
      player.vel.y *= -0.8;
    }
    if (player.pos.y + player.radius > FIELD_HEIGHT) {
      player.pos.y = FIELD_HEIGHT - player.radius;
      player.vel.y *= -0.8;
    }
  }

  state.ball.pos.x += state.ball.vel.x * MOVEMENT_SCALE;
  state.ball.pos.y += state.ball.vel.y * MOVEMENT_SCALE;
  state.ball.vel.x *= FRICTION;
  state.ball.vel.y *= FRICTION;

  state.ball.trail.push({ x: state.ball.pos.x, y: state.ball.pos.y });
  if (state.ball.trail.length > 12) state.ball.trail.shift();

  if (state.ball.pos.y - state.ball.radius < 0) {
    state.ball.pos.y = state.ball.radius;
    state.ball.vel.y *= -0.9;
  }
  if (state.ball.pos.y + state.ball.radius > FIELD_HEIGHT) {
    state.ball.pos.y = FIELD_HEIGHT - state.ball.radius;
    state.ball.vel.y *= -0.9;
  }

  const ballInGoalLane = state.goals.some((goal) => state.ball.pos.y > goal.y && state.ball.pos.y < goal.y + goal.height);
  if (!ballInGoalLane) {
    if (state.ball.pos.x - state.ball.radius < 0) {
      state.ball.pos.x = state.ball.radius;
      state.ball.vel.x *= -0.9;
    }
    if (state.ball.pos.x + state.ball.radius > FIELD_WIDTH) {
      state.ball.pos.x = FIELD_WIDTH - state.ball.radius;
      state.ball.vel.x *= -0.9;
    }
  }

  for (let i = 0; i < state.players.length; i += 1) {
    for (let j = i + 1; j < state.players.length; j += 1) {
      const foul = detectAndApplyShotFoul(state, i, j);
      if (foul) {
        outcome.foul = foul;
      }

      resolveCircleCollision(state.players[i], state.players[j]);
    }
  }

  for (let i = 0; i < state.players.length; i += 1) {
    const beforeTouching = areCirclesTouching(state.players[i], state.ball);
    resolveCircleCollision(state.players[i], state.ball);
    const afterTouching = areCirclesTouching(state.players[i], state.ball);

    if ((beforeTouching || afterTouching) && activePlayerIndex !== null && i === activePlayerIndex) {
      state.activeShotTouchedBall = true;
    }
  }

  const scored = checkGoal(state);
  if (scored) {
    state.score[scored] += 1;
    if (state.score[scored] >= WIN_SCORE) {
      state.winner = scored;
    }
    resetPositions(state);
    return true;
  }

  const movingPlayers = state.players.some((player) => Math.abs(player.vel.x) > STOP_THRESHOLD || Math.abs(player.vel.y) > STOP_THRESHOLD);
  const movingBall = Math.abs(state.ball.vel.x) > STOP_THRESHOLD || Math.abs(state.ball.vel.y) > STOP_THRESHOLD;
  if (movingPlayers || movingBall) {
    return false;
  }

  for (const player of state.players) {
    player.vel.x = 0;
    player.vel.y = 0;
  }
  state.ball.vel.x = 0;
  state.ball.vel.y = 0;

  if (state.phase === 'shooting') {
    advanceTurnAfterShot(state);
  }

  state.phase = 'aiming';
  state.activeShotPlayer = null;
  state.activeShotTouchedBall = false;
  state.activeShotCommittedFoul = false;
  return true;
}

export function simulateStep(state: MatchState): boolean {
  return simulateStepWithOutcome(state, { foul: null });
}
