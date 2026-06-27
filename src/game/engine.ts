import {
  GameState,
  Player,
  Vec2,
  FIELD_WIDTH,
  FIELD_HEIGHT,
  PLAYER_RADIUS,
  BALL_RADIUS,
  GOAL_WIDTH,
  GOAL_HEIGHT,
  FRICTION,
  STOP_THRESHOLD,
  MAX_SHOOT_POWER,
  MOVEMENT_SCALE,
  WIN_SCORE,
} from './types';

const DEBUG_FOULS = true;

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

function logFoulDebug(message: string, data?: Record<string, unknown>) {
  if (!DEBUG_FOULS) return;
  console.log(`[foul-debug] ${message}`, data ?? {});
}

function areCirclesTouching(a: { pos: Vec2; radius: number }, b: { pos: Vec2; radius: number }, tolerance = 0.5) {
  return dist(a.pos, b.pos) <= a.radius + b.radius + tolerance;
}

export function createInitialState(): GameState {
  const players: Player[] = [];

  // Away team (left side, red)
  const awayPositions = [
    { x: 180, y: 220 },
    { x: 180, y: 380 },
    { x: 320, y: 300 },
  ];
  awayPositions.forEach((pos, i) => {
    players.push({
      pos: vec2(pos.x, pos.y),
      vel: vec2(0, 0),
      radius: PLAYER_RADIUS,
      mass: 3,
      color: '#b91c1c',
      strokeColor: '#f87171',
      team: 'away',
      number: i + 1,
      isSelected: false,
      cooldown: 0,
    });
  });

  // Home team (right side, blue)
  const homePositions = [
    { x: 820, y: 220 },
    { x: 820, y: 380 },
    { x: 680, y: 300 },
  ];
  homePositions.forEach((pos, i) => {
    players.push({
      pos: vec2(pos.x, pos.y),
      vel: vec2(0, 0),
      radius: PLAYER_RADIUS,
      mass: 3,
      color: '#1e40af',
      strokeColor: '#60a5fa',
      team: 'home',
      number: i + 1,
      isSelected: false,
      cooldown: 0,
    });
  });

  return {
    players,
    ball: {
      pos: vec2(FIELD_WIDTH / 2, FIELD_HEIGHT / 2),
      vel: vec2(0, 0),
      radius: BALL_RADIUS,
      mass: 1,
      color: '#fbbf24',
      strokeColor: '#f59e0b',
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
    selectedPlayer: null,
    activeShotPlayer: null,
    activeShotTouchedBall: false,
    activeShotCommittedFoul: false,
    dragStart: null,
    dragCurrent: null,
    winner: null,
    lastShot: null,
    lastShotAnimation: null,
    message: '',
    messageTimer: 0,
    particles: [],
    cameraShake: 0,
  };
}

function resolveCircleCollision(a: { pos: Vec2; vel: Vec2; radius: number; mass: number }, b: { pos: Vec2; vel: Vec2; radius: number; mass: number }) {
  const dx = b.pos.x - a.pos.x;
  const dy = b.pos.y - a.pos.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const minDist = a.radius + b.radius;

  if (distance < minDist && distance > 0) {
    const overlap = minDist - distance;
    const nx = dx / distance;
    const ny = dy / distance;

    // Separate
    const totalMass = a.mass + b.mass;
    a.pos.x -= (overlap * b.mass / totalMass) * nx;
    a.pos.y -= (overlap * b.mass / totalMass) * ny;
    b.pos.x += (overlap * a.mass / totalMass) * nx;
    b.pos.y += (overlap * a.mass / totalMass) * ny;

    // Relative velocity
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

function spawnParticles(state: GameState, pos: Vec2, count: number, color: string, speed: number, size: number) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const spd = Math.random() * speed + 1;
    state.particles.push({
      pos: vec2(pos.x, pos.y),
      vel: vec2(Math.cos(angle) * spd, Math.sin(angle) * spd),
      life: 1,
      maxLife: 1,
      color,
      size: Math.random() * size + 1,
    });
  }
}

function checkGoal(state: GameState): 'home' | 'away' | null {
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

function resetPositions(state: GameState, scoringTeam: 'home' | 'away') {
  state.ball.pos = vec2(FIELD_WIDTH / 2, FIELD_HEIGHT / 2);
  state.ball.vel = vec2(0, 0);
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
    p.vel = vec2(0, 0);
    p.cooldown = 0;
    if (p.team === 'away') {
      p.pos = vec2(awayPositions[ai].x, awayPositions[ai].y);
      ai++;
    } else {
      p.pos = vec2(homePositions[hi].x, homePositions[hi].y);
      hi++;
    }
  }

  state.phase = 'aiming';
  state.selectedPlayer = null;
  state.activeShotPlayer = null;
  state.activeShotTouchedBall = false;
  state.activeShotCommittedFoul = false;
  state.dragStart = null;
  state.dragCurrent = null;
  state.bonusTurnTeam = null;
  state.pendingBonusTurns = 0;
  state.turn = scoringTeam === 'home' ? 'away' : 'home';
}

export function updateGame(state: GameState, _dt: number): GameState {
  if (state.winner) return state;

  // Update particles
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.pos.x += p.vel.x;
    p.pos.y += p.vel.y;
    p.vel.y += 0.05;
    p.life -= 0.015;
    if (p.life <= 0) {
      state.particles.splice(i, 1);
    }
  }

  // Camera shake decay
  if (state.cameraShake > 0) {
    state.cameraShake *= 0.9;
    if (state.cameraShake < 0.5) state.cameraShake = 0;
  }

  // Update players
  let allStopped = true;
  for (const p of state.players) {
    if (p.cooldown > 0) p.cooldown--;

    p.pos.x += p.vel.x * MOVEMENT_SCALE;
    p.pos.y += p.vel.y * MOVEMENT_SCALE;
    p.vel.x *= FRICTION;
    p.vel.y *= FRICTION;

    if (Math.abs(p.vel.x) < STOP_THRESHOLD) p.vel.x = 0;
    if (Math.abs(p.vel.y) < STOP_THRESHOLD) p.vel.y = 0;
    if (Math.abs(p.vel.x) > 0.1 || Math.abs(p.vel.y) > 0.1) allStopped = false;

    // Wall collisions
    if (p.pos.x < p.radius) {
      p.pos.x = p.radius;
      p.vel.x = -p.vel.x * 0.6;
    }
    if (p.pos.x > FIELD_WIDTH - p.radius) {
      p.pos.x = FIELD_WIDTH - p.radius;
      p.vel.x = -p.vel.x * 0.6;
    }
    if (p.pos.y < p.radius) {
      p.pos.y = p.radius;
      p.vel.y = -p.vel.y * 0.6;
    }
    if (p.pos.y > FIELD_HEIGHT - p.radius) {
      p.pos.y = FIELD_HEIGHT - p.radius;
      p.vel.y = -p.vel.y * 0.6;
    }
  }

  // Update ball
  const ball = state.ball;
  ball.pos.x += ball.vel.x * MOVEMENT_SCALE;
  ball.pos.y += ball.vel.y * MOVEMENT_SCALE;
  ball.vel.x *= FRICTION;
  ball.vel.y *= FRICTION;

  if (Math.abs(ball.vel.x) < STOP_THRESHOLD) ball.vel.x = 0;
  if (Math.abs(ball.vel.y) < STOP_THRESHOLD) ball.vel.y = 0;
  if (Math.abs(ball.vel.x) > 0.1 || Math.abs(ball.vel.y) > 0.1) allStopped = false;

  // Ball trail
  if (Math.abs(ball.vel.x) > 1 || Math.abs(ball.vel.y) > 1) {
    ball.trail.push(vec2(ball.pos.x, ball.pos.y));
    if (ball.trail.length > 15) ball.trail.shift();
  } else if (ball.trail.length > 0) {
    ball.trail.shift();
  }

  // Ball wall collisions (with goal detection)
  const inHomeGoal = ball.pos.y > state.goals[0].y && ball.pos.y < state.goals[0].y + state.goals[0].height;
  const inAwayGoal = ball.pos.y > state.goals[1].y && ball.pos.y < state.goals[1].y + state.goals[1].height;
  const goalsBlockedByFoul = state.activeShotCommittedFoul;

  if (ball.pos.x < ball.radius) {
    if (inHomeGoal && !goalsBlockedByFoul) {
      // Goal!
    } else {
      ball.pos.x = ball.radius;
      ball.vel.x = -ball.vel.x * 0.6;
    }
  }
  if (ball.pos.x > FIELD_WIDTH - ball.radius) {
    if (inAwayGoal && !goalsBlockedByFoul) {
      // Goal!
    } else {
      ball.pos.x = FIELD_WIDTH - ball.radius;
      ball.vel.x = -ball.vel.x * 0.6;
    }
  }
  if (ball.pos.y < ball.radius) {
    ball.pos.y = ball.radius;
    ball.vel.y = -ball.vel.y * 0.6;
  }
  if (ball.pos.y > FIELD_HEIGHT - ball.radius) {
    ball.pos.y = FIELD_HEIGHT - ball.radius;
    ball.vel.y = -ball.vel.y * 0.6;
  }

  // Check goal
  const goalScorer = goalsBlockedByFoul ? null : checkGoal(state);
  if (goalScorer) {
    state.score[goalScorer]++;
    const scorerLabel = goalScorer === 'home' ? 'JUGADOR' : 'LA MÁQUINA';
    state.message = `¡GOL DE ${scorerLabel}!`;
    state.messageTimer = 120;
    state.cameraShake = 12;
    spawnParticles(state, ball.pos, 50, '#fbbf24', 8, 5);
    spawnParticles(state, ball.pos, 30, goalScorer === 'home' ? '#60a5fa' : '#f87171', 6, 4);

    if (state.score[goalScorer] >= WIN_SCORE) {
      state.winner = goalScorer;
      state.message = `¡${scorerLabel} CAMPEÓN!`;
    }

    resetPositions(state, goalScorer);
    return state;
  }

  // Player-ball collisions
  for (let i = 0; i < state.players.length; i++) {
    const player = state.players[i];

    if (
      state.phase === 'shooting' &&
      state.activeShotPlayer === i &&
      !state.activeShotTouchedBall &&
      areCirclesTouching(player, state.ball)
    ) {
      state.activeShotTouchedBall = true;
      logFoulDebug('ball touched on collision resolution', {
        shooter: player.number,
        team: player.team,
        distance: Number(dist(player.pos, state.ball.pos).toFixed(2)),
        threshold: Number((player.radius + state.ball.radius).toFixed(2)),
      });
    }

    resolveCircleCollision(player, state.ball);
  }

  // Player-player collisions
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
        const shooter = state.activeShotPlayer === i ? first : state.activeShotPlayer === j ? second : null;
        const other = shooter === first ? second : first;

        if (shooter) {
          logFoulDebug('checking player collision', {
            shooter: shooter.number,
            shooterTeam: shooter.team,
            rival: other.number,
            rivalTeam: other.team,
            distance: Number(dist(shooter.pos, other.pos).toFixed(2)),
            threshold: Number((shooter.radius + other.radius).toFixed(2)),
            touchedBall: state.activeShotTouchedBall,
            foul: state.activeShotCommittedFoul,
          });
        }

        if (shooter && shooter.team !== other.team && areCirclesTouching(shooter, other)) {
          state.activeShotCommittedFoul = true;
          state.bonusTurnTeam = other.team;
          state.pendingBonusTurns = 1;
          const foulBy = shooter.team === 'home' ? 'JUGADOR' : 'LA MÁQUINA';
          const foulVictim = other.team === 'home' ? 'JUGADOR' : 'LA MÁQUINA';
          state.message = `¡Falta de ${foulBy}! ${foulVictim} gana dos jugadas.`;
          state.messageTimer = 120;
          state.cameraShake = 6;
          spawnParticles(state, shooter.pos, 18, '#f87171', 3, 3);
          logFoulDebug('foul detected on collision resolution', {
            shooter: shooter.number,
            shooterTeam: shooter.team,
            rival: other.number,
            rivalTeam: other.team,
            distance: Number(dist(shooter.pos, other.pos).toFixed(2)),
            threshold: Number((shooter.radius + other.radius).toFixed(2)),
          });
        }
      }

      resolveCircleCollision(state.players[i], state.players[j]);
    }
  }

  // Phase management
  if (state.phase === 'shooting' && allStopped) {
    state.phase = 'aiming';
    const nextTurn = state.turn === 'home' ? 'away' : 'home';

    if (state.pendingBonusTurns > 0 && state.bonusTurnTeam === state.turn) {
      state.pendingBonusTurns--;
      if (state.pendingBonusTurns <= 0) {
        state.pendingBonusTurns = 0;
        state.bonusTurnTeam = null;
      }
    } else {
      state.turn = nextTurn;
    }

    state.selectedPlayer = null;
    state.activeShotPlayer = null;
    state.activeShotTouchedBall = false;
    state.activeShotCommittedFoul = false;
    state.dragStart = null;
    state.dragCurrent = null;
  }

  // Message timer
  if (state.messageTimer > 0) {
    state.messageTimer--;
    if (state.messageTimer <= 0) state.message = '';
  }

  return state;
}

export function handleMouseDown(state: GameState, x: number, y: number): GameState {
  if (state.phase !== 'aiming' || state.winner) return state;

  // Find closest player of current team
  let closest: Player | null = null;
  let closestDist = Infinity;
  for (const p of state.players) {
    if (p.team !== state.turn) continue;
    const d = dist(p.pos, vec2(x, y));
    if (d < p.radius + 15 && d < closestDist) {
      closest = p;
      closestDist = d;
    }
  }

  if (closest) {
    state.selectedPlayer = state.players.indexOf(closest);
    state.dragStart = vec2(closest.pos.x, closest.pos.y);
    state.dragCurrent = vec2(x, y);
    closest.isSelected = true;
  }

  return state;
}

export function handleMouseMove(state: GameState, x: number, y: number): GameState {
  if (state.selectedPlayer !== null && state.dragStart) {
    state.dragCurrent = vec2(x, y);
  }
  return state;
}

export function handleMouseUp(state: GameState): GameState {
  if (state.selectedPlayer === null || !state.dragStart || !state.dragCurrent) {
    return state;
  }

  const player = state.players[state.selectedPlayer];
  const dx = state.dragStart.x - state.dragCurrent.x;
  const dy = state.dragStart.y - state.dragCurrent.y;
  const power = Math.sqrt(dx * dx + dy * dy) * 0.15;
  const clampedPower = clamp(power, 0, MAX_SHOOT_POWER);

  if (clampedPower > 1) {
    const dir = normalize(vec2(dx, dy));
    player.vel.x = dir.x * clampedPower;
    player.vel.y = dir.y * clampedPower;
    state.phase = 'shooting';
    state.activeShotPlayer = state.players.indexOf(player);
    state.activeShotTouchedBall = false;
    state.activeShotCommittedFoul = false;
    logFoulDebug('shot started', {
      shooter: player.number,
      team: player.team,
      power: Number(clampedPower.toFixed(2)),
      dir: { x: Number(dir.x.toFixed(3)), y: Number(dir.y.toFixed(3)) },
      start: { x: Number(player.pos.x.toFixed(2)), y: Number(player.pos.y.toFixed(2)) },
    });
    spawnParticles(state, player.pos, 8, '#ffffff', 2, 2);
  }

  player.isSelected = false;
  state.selectedPlayer = null;
  state.dragStart = null;
  state.dragCurrent = null;

  return state;
}

export function applyRemoteShot(
  state: GameState,
  team: 'home' | 'away',
  playerNumber: number,
  velocityX: number,
  velocityY: number
): GameState {
  if (state.phase !== 'aiming' || state.turn !== team || state.winner) {
    return state;
  }

  const player = state.players.find((candidate) => candidate.team === team && candidate.number === playerNumber);
  if (!player) return state;

  player.vel.x = velocityX;
  player.vel.y = velocityY;
  player.isSelected = false;
  state.phase = 'shooting';
  state.activeShotPlayer = state.players.indexOf(player);
  state.activeShotTouchedBall = false;
  state.activeShotCommittedFoul = false;
  state.selectedPlayer = null;
  state.dragStart = null;
  state.dragCurrent = null;
  spawnParticles(state, player.pos, 8, '#ffffff', 2, 2);

  return state;
}
