export const FIELD_WIDTH = 1000;
export const FIELD_HEIGHT = 600;
export const PLAYER_RADIUS = 22;
export const BALL_RADIUS = 14;
export const GOAL_WIDTH = 48;
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

export type BallHitLevel = 1 | 2 | 3 | 4;

export interface BallHitEvent {
  frame: number;
  level: BallHitLevel;
}

export type ImpactKind = 'disc-ball' | 'disc-disc' | 'ball-wall';

export interface ImpactEvent {
  frame: number;
  level: BallHitLevel;
  kind: ImpactKind;
  playerIndices: number[];
}

export interface ShotOutcome {
  goal: 'home' | 'away' | null;
  foul: {
    byTeam: 'home' | 'away';
    victimTeam: 'home' | 'away';
  } | null;
  /**
   * Animation frame indices where the ball impacts something (disc or wall).
   * May contain the same frame more than once if multiple impacts happen together.
   * Playback should key by event index, not by frame value.
   */
  ballHitFrames: number[];
  /** Ball impacts with their physical intensity quantized into four audio levels. */
  ballHits: BallHitEvent[];
  /** All physical impacts used by the client for synchronized visual feedback. */
  impacts: ImpactEvent[];
  /** Frame index where the foul was first committed, if any. */
  foulFrame: number | null;
  /** Frame index where a goal was scored, if any. */
  goalFrame: number | null;
}

export function createEmptyShotOutcome(): ShotOutcome {
  return {
    goal: null,
    foul: null,
    ballHitFrames: [],
    ballHits: [],
    impacts: [],
    foulFrame: null,
    goalFrame: null,
  };
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
  return {
    players: state.players.map((player) => ({
      pos: { x: player.pos.x, y: player.pos.y },
      vel: { x: player.vel.x, y: player.vel.y },
      radius: player.radius,
      mass: player.mass,
      team: player.team,
      number: player.number,
    })),
    ball: {
      pos: { x: state.ball.pos.x, y: state.ball.pos.y },
      vel: { x: state.ball.vel.x, y: state.ball.vel.y },
      radius: state.ball.radius,
      mass: state.ball.mass,
      trail: state.ball.trail.map((point) => ({ x: point.x, y: point.y })),
    },
    goals: state.goals.map((goal) => ({
      x: goal.x + goal.width / 2 < FIELD_WIDTH / 2 ? -GOAL_WIDTH : FIELD_WIDTH,
      y: FIELD_HEIGHT / 2 - GOAL_HEIGHT / 2,
      width: GOAL_WIDTH,
      height: GOAL_HEIGHT,
      team: goal.team,
    })),
    score: { home: state.score.home, away: state.score.away },
    turn: state.turn,
    bonusTurnTeam: state.bonusTurnTeam,
    pendingBonusTurns: state.pendingBonusTurns,
    phase: state.phase,
    activeShotPlayer: state.activeShotPlayer,
    activeShotTouchedBall: state.activeShotTouchedBall,
    activeShotCommittedFoul: state.activeShotCommittedFoul,
    winner: state.winner,
    lastShot: state.lastShot
      ? {
          id: state.lastShot.id,
          playerIndex: state.lastShot.playerIndex,
          velX: state.lastShot.velX,
          velY: state.lastShot.velY,
        }
      : null,
  };
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
  involvedPlayers = new Set([state.activeShotPlayer]),
) {
  if (
    state.phase !== 'shooting'
    || state.activeShotPlayer === null
    || state.activeShotTouchedBall
    || state.activeShotCommittedFoul
  ) {
    return null;
  }

  const first = state.players[firstIndex];
  const second = state.players[secondIndex];
  const firstInvolved = involvedPlayers.has(firstIndex);
  const secondInvolved = involvedPlayers.has(secondIndex);
  if (firstInvolved === secondInvolved) return null;

  const other = firstInvolved ? second : first;
  const shooterTeam = state.players[state.activeShotPlayer].team;

  if (shooterTeam === other.team || !areCirclesTouching(first, second)) {
    return null;
  }

  state.activeShotCommittedFoul = true;
  state.bonusTurnTeam = other.team;
  state.pendingBonusTurns = 1;

  return {
    byTeam: shooterTeam,
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
      { x: -GOAL_WIDTH, y: FIELD_HEIGHT / 2 - GOAL_HEIGHT / 2, width: GOAL_WIDTH, height: GOAL_HEIGHT, team: 'away' },
      { x: FIELD_WIDTH, y: FIELD_HEIGHT / 2 - GOAL_HEIGHT / 2, width: GOAL_WIDTH, height: GOAL_HEIGHT, team: 'home' },
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

export function classifyBallHitLevel(impactSpeed: number): BallHitLevel {
  if (impactSpeed < 3) return 1;
  if (impactSpeed < 7) return 2;
  if (impactSpeed < 12) return 3;
  return 4;
}

/** @returns relative normal speed when an impulse was applied. */
function resolveCircleCollision(
  a: { pos: PhysicsVec2; vel: PhysicsVec2; radius: number; mass: number },
  b: { pos: PhysicsVec2; vel: PhysicsVec2; radius: number; mass: number },
): number | null {
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

    if (velAlongNormal >= 0) return null;

    const restitution = 0.7;
    const impulse = -(1 + restitution) * velAlongNormal / totalMass;

    a.vel.x -= impulse * b.mass * nx;
    a.vel.y -= impulse * b.mass * ny;
    b.vel.x += impulse * a.mass * nx;
    b.vel.y += impulse * a.mass * ny;
    return -velAlongNormal;
  }

  return null;
}

function resolveSideAndGoalWalls(
  body: { pos: PhysicsVec2; vel: PhysicsVec2; radius: number },
  previousPos: PhysicsVec2,
  goals: PhysicsGoal[],
  restitution: number,
  allowGoalEntry = true,
) {
  let xImpactSpeed = 0;
  let yImpactSpeed = 0;
  const exteriorGoal = allowGoalEntry
    ? goals.find((goal) => {
      const crossedGoalLine = goal.x < 0
        ? body.pos.x < body.radius
        : body.pos.x > FIELD_WIDTH - body.radius;
      const fitsThroughMouth = body.pos.y - body.radius >= goal.y
        && body.pos.y + body.radius <= goal.y + goal.height;
      const centerInsideTunnel = (goal.x < 0 ? body.pos.x < 0 : body.pos.x > FIELD_WIDTH)
        && body.pos.y >= goal.y
        && body.pos.y <= goal.y + goal.height;
      const wasInsideTunnel = goal.x < 0 ? previousPos.x < 0 : previousPos.x > FIELD_WIDTH;
      return crossedGoalLine && (fitsThroughMouth || (centerInsideTunnel && wasInsideTunnel));
    })
    : undefined;

  if (exteriorGoal) {
    if (body.pos.y - body.radius < exteriorGoal.y) {
      yImpactSpeed = Math.max(yImpactSpeed, Math.max(0, -body.vel.y));
      body.pos.y = exteriorGoal.y + body.radius;
      body.vel.y = Math.abs(body.vel.y) * restitution;
    }
    if (body.pos.y + body.radius > exteriorGoal.y + exteriorGoal.height) {
      yImpactSpeed = Math.max(yImpactSpeed, Math.max(0, body.vel.y));
      body.pos.y = exteriorGoal.y + exteriorGoal.height - body.radius;
      body.vel.y = -Math.abs(body.vel.y) * restitution;
    }

    if (exteriorGoal.x < 0 && body.pos.x - body.radius < exteriorGoal.x) {
      xImpactSpeed = Math.max(xImpactSpeed, Math.max(0, -body.vel.x));
      body.pos.x = exteriorGoal.x + body.radius;
      body.vel.x = Math.abs(body.vel.x) * restitution;
    }
    if (exteriorGoal.x >= FIELD_WIDTH && body.pos.x + body.radius > exteriorGoal.x + exteriorGoal.width) {
      xImpactSpeed = Math.max(xImpactSpeed, Math.max(0, body.vel.x));
      body.pos.x = exteriorGoal.x + exteriorGoal.width - body.radius;
      body.vel.x = -Math.abs(body.vel.x) * restitution;
    }
  } else {
    const crossedSide = body.pos.x - body.radius < 0 || body.pos.x + body.radius > FIELD_WIDTH;
    const entranceGoal = allowGoalEntry && crossedSide
      ? goals.find((goal) => goal.x < 0 ? body.pos.x < body.radius : body.pos.x > FIELD_WIDTH - body.radius)
      : undefined;
    const postY = entranceGoal
      ? Math.abs(body.pos.y - entranceGoal.y) < Math.abs(body.pos.y - entranceGoal.y - entranceGoal.height)
        ? entranceGoal.y
        : entranceGoal.y + entranceGoal.height
      : null;
    if (entranceGoal && postY !== null) {
      const goalLineX = entranceGoal.x < 0 ? 0 : FIELD_WIDTH;
      const dx = body.pos.x - goalLineX;
      const dy = body.pos.y - postY;
      const distance = Math.hypot(dx, dy);
      if (distance < body.radius && distance > 0) {
        const previousDx = previousPos.x - goalLineX;
        const previousDy = previousPos.y - postY;
        const previousDistance = Math.hypot(previousDx, previousDy);
        const nx = previousDistance > 0 ? previousDx / previousDistance : dx / distance;
        const ny = previousDistance > 0 ? previousDy / previousDistance : dy / distance;
        const overlap = body.radius - distance;
        body.pos.x += nx * overlap;
        body.pos.y += ny * overlap;
        const velocityAlongNormal = body.vel.x * nx + body.vel.y * ny;
        if (velocityAlongNormal < 0) {
          const impactSpeed = -velocityAlongNormal;
          body.vel.x -= (1 + restitution) * velocityAlongNormal * nx;
          body.vel.y -= (1 + restitution) * velocityAlongNormal * ny;
          xImpactSpeed = impactSpeed * Math.abs(nx);
          yImpactSpeed = impactSpeed * Math.abs(ny);
        }
        return { xImpactSpeed, yImpactSpeed };
      }
    }

    if (body.pos.x - body.radius < 0) {
      xImpactSpeed = Math.max(0, -body.vel.x);
      body.pos.x = body.radius;
      body.vel.x = Math.abs(body.vel.x) * restitution;
    }
    if (body.pos.x + body.radius > FIELD_WIDTH) {
      xImpactSpeed = Math.max(0, body.vel.x);
      body.pos.x = FIELD_WIDTH - body.radius;
      body.vel.x = -Math.abs(body.vel.x) * restitution;
    }
  }

  return { xImpactSpeed, yImpactSpeed };
}

function checkGoal(state: MatchState): 'home' | 'away' | null {
  if (state.activeShotCommittedFoul) {
    return null;
  }

  const ball = state.ball;
  for (const goal of state.goals) {
    const inGoalY = ball.pos.y - ball.radius >= goal.y && ball.pos.y + ball.radius <= goal.y + goal.height;
    if (!inGoalY) continue;

    const fullyCrossedGoalLine = goal.x < 0
      ? ball.pos.x + ball.radius <= 0
      : ball.pos.x - ball.radius >= FIELD_WIDTH;
    if (!fullyCrossedGoalLine) continue;

    if (goal.team === 'home') {
      return 'away';
    }

    return 'home';
  }

  return null;
}

export function recoverInvalidBallState(state: MatchState) {
  const movingPlayers = state.players.some((player) => Math.abs(player.vel.x) > STOP_THRESHOLD || Math.abs(player.vel.y) > STOP_THRESHOLD);
  const movingBall = Math.abs(state.ball.vel.x) > STOP_THRESHOLD || Math.abs(state.ball.vel.y) > STOP_THRESHOLD;
  const ballOutOfBounds = state.ball.pos.x < state.ball.radius
    || state.ball.pos.x > FIELD_WIDTH - state.ball.radius
    || state.ball.pos.y < state.ball.radius
    || state.ball.pos.y > FIELD_HEIGHT - state.ball.radius;

  if (state.phase !== 'aiming' || movingPlayers || movingBall || !ballOutOfBounds) {
    return false;
  }

  state.ball.pos = { x: FIELD_WIDTH / 2, y: FIELD_HEIGHT / 2 };
  state.ball.vel = { x: 0, y: 0 };
  state.ball.trail = [];
  return true;
}

export function swapMatchSides(state: MatchState): MatchState {
  return {
    ...state,
    players: state.players.map((player) => ({
      ...player,
      pos: {
        x: FIELD_WIDTH - player.pos.x,
        y: player.pos.y,
      },
      vel: {
        x: -player.vel.x,
        y: player.vel.y,
      },
      team: player.team === 'home' ? 'away' : 'home',
    })),
    ball: {
      ...state.ball,
      pos: {
        x: FIELD_WIDTH - state.ball.pos.x,
        y: state.ball.pos.y,
      },
      vel: {
        x: -state.ball.vel.x,
        y: state.ball.vel.y,
      },
      trail: state.ball.trail.map((point) => ({
        x: FIELD_WIDTH - point.x,
        y: point.y,
      })),
    },
    goals: state.goals.map((goal) => ({
      ...goal,
      x: FIELD_WIDTH - goal.x - goal.width,
      team: goal.team === 'home' ? 'away' : 'home',
    })),
    score: {
      home: state.score.away,
      away: state.score.home,
    },
    turn: state.turn === 'home' ? 'away' : 'home',
    bonusTurnTeam: state.bonusTurnTeam == null ? null : state.bonusTurnTeam === 'home' ? 'away' : 'home',
    winner: state.winner == null ? null : state.winner === 'home' ? 'away' : 'home',
    lastShot: state.lastShot
      ? {
          ...state.lastShot,
          velX: -state.lastShot.velX,
        }
      : null,
  };
}

export function mirrorMatchHorizontally(state: MatchState): MatchState {
  return {
    ...state,
    players: state.players.map((player) => ({
      ...player,
      pos: {
        x: FIELD_WIDTH - player.pos.x,
        y: player.pos.y,
      },
      vel: {
        x: -player.vel.x,
        y: player.vel.y,
      },
    })),
    ball: {
      ...state.ball,
      pos: {
        x: FIELD_WIDTH - state.ball.pos.x,
        y: state.ball.pos.y,
      },
      vel: {
        x: -state.ball.vel.x,
        y: state.ball.vel.y,
      },
      trail: state.ball.trail.map((point) => ({
        x: FIELD_WIDTH - point.x,
        y: point.y,
      })),
    },
    goals: state.goals.map((goal) => ({
      ...goal,
      x: FIELD_WIDTH - goal.x - goal.width,
    })),
    lastShot: state.lastShot
      ? {
          ...state.lastShot,
          velX: -state.lastShot.velX,
        }
      : null,
  };
}

export function normalizeAwayTeamOnLeft(state: MatchState): MatchState {
  const awayPlayers = state.players.filter((player) => player.team === 'away');
  const homePlayers = state.players.filter((player) => player.team === 'home');
  if (awayPlayers.length === 0 || homePlayers.length === 0) {
    return state;
  }

  const awayAverageX = awayPlayers.reduce((sum, player) => sum + player.pos.x, 0) / awayPlayers.length;
  const homeAverageX = homePlayers.reduce((sum, player) => sum + player.pos.x, 0) / homePlayers.length;

  return awayAverageX <= homeAverageX ? state : mirrorMatchHorizontally(state);
}

export function normalizeGoalTeams(state: MatchState): MatchState {
  if (state.goals.length !== 2) {
    return state;
  }

  const [leftGoal, rightGoal] = [...state.goals].sort((a, b) => a.x - b.x);
  if (leftGoal.team === 'away' && rightGoal.team === 'home') {
    return state;
  }

  return {
    ...state,
    goals: state.goals.map((goal) => ({
      ...goal,
      team: goal.x === leftGoal.x ? 'away' : 'home',
    })),
  };
}

/**
 * Reset to kickoff shape after a goal.
 * @param scoringTeam team that received the point (includes own goals)
 *
 * Restart turn goes to the team that conceded — same as a kickoff after a goal —
 * not to the opposite of whoever took the shot (that breaks own goals).
 */
function resetPositions(state: MatchState, scoringTeam: 'home' | 'away') {
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
  const outcome = createEmptyShotOutcome();
  const involvedPlayers = new Set([playerIndex]);

  for (let frame = 0; frame < maxFrames; frame += 1) {
    const done = simulateStepWithOutcome(deepState, outcome, null, involvedPlayers);
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
  const outcome = createEmptyShotOutcome();
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
  const involvedPlayers = new Set([playerIndex]);

  for (let frame = 0; frame < maxFrames; frame += 1) {
    const hadFoul = outcome.foul !== null;
    const scoreBefore = { home: workingState.score.home, away: workingState.score.away };
    const frameIndex = frames.length;

    // Impacts (disc + wall) are recorded inside the step via impulse/bounce detection.
    const done = simulateStepWithOutcome(workingState, outcome, frameIndex, involvedPlayers);

    if (!hadFoul && outcome.foul) {
      outcome.foulFrame = frameIndex;
    }

    if (workingState.score.home !== scoreBefore.home || workingState.score.away !== scoreBefore.away) {
      outcome.goalFrame = frameIndex;
    }

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

/**
 * Advance one physics step.
 * @param impactFrame when set, records every ball impact (disc impulse or wall bounce)
 *                    into outcome.ballHitFrames for SFX scheduling.
 */
function simulateStepWithOutcome(
  state: MatchState,
  outcome: ShotOutcome,
  impactFrame: number | null,
  involvedPlayers = new Set(state.activeShotPlayer === null ? [] : [state.activeShotPlayer]),
): boolean {
  const activePlayerIndex = state.activeShotPlayer;
  const recordVisualImpact = (impactSpeed: number, kind: ImpactKind, playerIndices: number[]) => {
    if (impactFrame !== null) {
      outcome.impacts.push({
        frame: impactFrame,
        level: classifyBallHitLevel(impactSpeed),
        kind,
        playerIndices,
      });
    }
  };
  const recordBallImpact = (impactSpeed: number, kind: 'disc-ball' | 'ball-wall', playerIndices: number[]) => {
    if (impactFrame !== null) {
      const level = classifyBallHitLevel(impactSpeed);
      outcome.ballHitFrames.push(impactFrame);
      outcome.ballHits.push({
        frame: impactFrame,
        level,
      });
      outcome.impacts.push({ frame: impactFrame, level, kind, playerIndices });
    }
  };

  for (const player of state.players) {
    const previousPos = { x: player.pos.x, y: player.pos.y };
    player.pos.x += player.vel.x * MOVEMENT_SCALE;
    player.pos.y += player.vel.y * MOVEMENT_SCALE;
    player.vel.x *= FRICTION;
    player.vel.y *= FRICTION;

    if (player.pos.y - player.radius < 0) {
      player.pos.y = player.radius;
      player.vel.y *= -0.8;
    }
    if (player.pos.y + player.radius > FIELD_HEIGHT) {
      player.pos.y = FIELD_HEIGHT - player.radius;
      player.vel.y *= -0.8;
    }

    resolveSideAndGoalWalls(player, previousPos, state.goals, 0.8);
  }

  const previousBallPos = { x: state.ball.pos.x, y: state.ball.pos.y };
  state.ball.pos.x += state.ball.vel.x * MOVEMENT_SCALE;
  state.ball.pos.y += state.ball.vel.y * MOVEMENT_SCALE;
  state.ball.vel.x *= FRICTION;
  state.ball.vel.y *= FRICTION;

  state.ball.trail.push({ x: state.ball.pos.x, y: state.ball.pos.y });
  if (state.ball.trail.length > 12) state.ball.trail.shift();

  // Ball wall bounces — each real bounce is an impact (SFX).
  if (state.ball.pos.y - state.ball.radius < 0) {
    const impactSpeed = Math.max(0, -state.ball.vel.y);
    state.ball.pos.y = state.ball.radius;
    state.ball.vel.y *= -0.9;
    if (impactSpeed > 0) recordBallImpact(impactSpeed, 'ball-wall', []);
  }
  if (state.ball.pos.y + state.ball.radius > FIELD_HEIGHT) {
    const impactSpeed = Math.max(0, state.ball.vel.y);
    state.ball.pos.y = FIELD_HEIGHT - state.ball.radius;
    state.ball.vel.y *= -0.9;
    if (impactSpeed > 0) recordBallImpact(impactSpeed, 'ball-wall', []);
  }

  const goalWallImpact = resolveSideAndGoalWalls(
    state.ball,
    previousBallPos,
    state.goals,
    0.9,
    !state.activeShotCommittedFoul,
  );
  const goalWallImpactSpeed = Math.max(goalWallImpact.xImpactSpeed, goalWallImpact.yImpactSpeed);
  if (goalWallImpactSpeed > 0) recordBallImpact(goalWallImpactSpeed, 'ball-wall', []);

  for (let i = 0; i < state.players.length; i += 1) {
    for (let j = i + 1; j < state.players.length; j += 1) {
      const foul = detectAndApplyShotFoul(state, i, j, involvedPlayers);
      if (foul) {
        outcome.foul = foul;
      }

      const impactSpeed = resolveCircleCollision(state.players[i], state.players[j]);
      if (impactSpeed !== null) {
        if (!foul && (involvedPlayers.has(i) || involvedPlayers.has(j))) {
          involvedPlayers.add(i);
          involvedPlayers.add(j);
        }
        recordVisualImpact(impactSpeed, 'disc-disc', [i, j]);
      }
    }
  }

  // Disc ↔ ball: record every real impulse (first hit, rebounds, multi-disc chains).
  for (let i = 0; i < state.players.length; i += 1) {
    const beforeTouching = areCirclesTouching(state.players[i], state.ball);
    const impactSpeed = resolveCircleCollision(state.players[i], state.ball);
    const afterTouching = areCirclesTouching(state.players[i], state.ball);

    if (impactSpeed !== null) {
      recordBallImpact(impactSpeed, 'disc-ball', [i]);
    }

    if ((beforeTouching || afterTouching) && activePlayerIndex !== null && involvedPlayers.has(i)) {
      state.activeShotTouchedBall = true;
    }
  }

  const scored = outcome.goal === null ? checkGoal(state) : null;
  if (scored) {
    outcome.goal = scored;
    state.score[scored] += 1;
    if (state.score[scored] >= WIN_SCORE) {
      state.winner = scored;
    }
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

  if (outcome.goal) {
    resetPositions(state, outcome.goal);
    return true;
  }

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
  recoverInvalidBallState(state);
  return simulateStepWithOutcome(state, createEmptyShotOutcome(), null);
}
