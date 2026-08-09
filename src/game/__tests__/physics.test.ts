import { describe, it, expect } from 'vitest';
import { BALL_RADIUS, classifyBallHitLevel, createInitialMatchState, FIELD_HEIGHT, FIELD_WIDTH, GOAL_WIDTH, normalizeAwayTeamOnLeft, normalizeGoalTeams, PLAYER_RADIUS, recoverInvalidBallState, simulateShot, simulateShotWithFrames, simulateStep, swapMatchSides } from '../physics';

describe('classifyBallHitLevel', () => {
  it('maps impact speed into four increasing audio levels', () => {
    expect(classifyBallHitLevel(1)).toBe(1);
    expect(classifyBallHitLevel(4)).toBe(2);
    expect(classifyBallHitLevel(9)).toBe(3);
    expect(classifyBallHitLevel(16)).toBe(4);
  });
});

describe('createInitialMatchState', () => {
  it('creates state with correct teams and initial positions', () => {
    const state = createInitialMatchState('home-pubkey', 'away-pubkey');
    expect(state.homePubkey).toBe('home-pubkey');
    expect(state.awayPubkey).toBe('away-pubkey');
    expect(state.players.filter((p) => p.team === 'home')).toHaveLength(3);
    expect(state.players.filter((p) => p.team === 'away')).toHaveLength(3);
    expect(state.score).toEqual({ home: 0, away: 0 });
    expect(state.turn).toBe('home');
    expect(state.phase).toBe('aiming');
    expect(state.winner).toBeNull();
  });

  it('places ball at center', () => {
    const state = createInitialMatchState('a', 'b');
    expect(state.ball.pos.x).toBe(500);
    expect(state.ball.pos.y).toBe(300);
  });
});

describe('simulateShot', () => {
  it('does nothing when not the right turn', () => {
    const state = createInitialMatchState('a', 'b');
    const awayPlayer = state.players.find((p) => p.team === 'away')!;
    const awayPlayerIndex = state.players.indexOf(awayPlayer);
    const result = simulateShot(state, awayPlayerIndex, 10, 0);
    expect(result.phase).toBe('aiming');
  });

  it('does nothing when game is won', () => {
    const state = createInitialMatchState('a', 'b');
    state.winner = 'home';
    const homePlayer = state.players.find((p) => p.team === 'home')!;
    const idx = state.players.indexOf(homePlayer);
    const result = simulateShot(state, idx, 10, 0);
    expect(result.phase).toBe('aiming');
  });

  it('applies velocity and runs simulation', () => {
    const state = createInitialMatchState('a', 'b');
    const homePlayer = state.players.find((p) => p.team === 'home')!;
    const homePlayerIndex = state.players.indexOf(homePlayer);
    const result = simulateShot(state, homePlayerIndex, -10, 0);
    // The simulation ran (turn switched) and the shooter was assigned
    expect(result.phase).toBe('aiming');
    expect(result.turn).toBe('away');
    expect(result.activeShotPlayer).toBeNull();
  });

  it('switches turn after shot completes', () => {
    const state = createInitialMatchState('a', 'b');
    expect(state.turn).toBe('home');
    const homePlayer = state.players.find((p) => p.team === 'home')!;
    const homePlayerIndex = state.players.indexOf(homePlayer);
    const result = simulateShot(state, homePlayerIndex, -10, 0);
    expect(result.turn).toBe('away');
  });

  it('detects goal and updates score', () => {
    const state = createInitialMatchState('a', 'b');
    state.ball.pos.x = 10;
    state.ball.pos.y = 300;
    const homePlayer = state.players.find((p) => p.team === 'home')!;
    const homePlayerIndex = state.players.indexOf(homePlayer);
    state.turn = 'home';
    const result = simulateShot(state, homePlayerIndex, 0, 0);
    expect(result.score.away).toBe(0);
  });

  it('resets to default positions and gives the restart turn to the other team after a goal', () => {
    const state = createInitialMatchState('a', 'b');
    state.ball.pos.x = -GOAL_WIDTH + BALL_RADIUS;
    state.ball.pos.y = 300;
    const homePlayer = state.players.find((p) => p.team === 'home')!;
    const homePlayerIndex = state.players.indexOf(homePlayer);

    const result = simulateShot(state, homePlayerIndex, 0, 0);
    const awayCentralPlayer = result.players.find((p) => p.team === 'away' && p.number === 3);

    expect(result.score.home).toBe(1);
    expect(result.turn).toBe('away');
    expect(result.ball.pos).toEqual({ x: 500, y: 300 });
    expect(awayCentralPlayer?.pos).toEqual({ x: 320, y: 300 });
  });

  it('after an own goal, restart turn goes to the team that conceded (not the shooter)', () => {
    const state = createInitialMatchState('a', 'b');
    // Away is shooting and the ball is already in away's own net (left goal).
    // That awards a point to home — an own goal by away.
    state.turn = 'away';
    state.ball.pos.x = -GOAL_WIDTH + BALL_RADIUS;
    state.ball.pos.y = 300;
    const awayPlayer = state.players.find((p) => p.team === 'away')!;
    const awayPlayerIndex = state.players.indexOf(awayPlayer);

    const result = simulateShot(state, awayPlayerIndex, 0, 0);

    expect(result.score.home).toBe(1);
    expect(result.score.away).toBe(0);
    // Away conceded → away restarts (must NOT hand the turn to home/machine).
    expect(result.turn).toBe('away');
  });

  it('counts a goal when the whole ball crosses the goal line', () => {
    const state = createInitialMatchState('a', 'b');
    state.phase = 'shooting';
    state.turn = 'home';
    state.ball.pos.x = -BALL_RADIUS;
    state.ball.pos.y = FIELD_HEIGHT / 2;
    state.ball.vel.x = 0;
    state.ball.vel.y = 0;

    const finished = simulateStep(state);

    expect(finished).toBe(true);
    expect(state.score.home).toBe(1);
    expect(state.ball.pos).toEqual({ x: 500, y: 300 });
  });

  it('does not count a goal while part of the ball remains over the goal line', () => {
    const state = createInitialMatchState('a', 'b');
    state.phase = 'shooting';
    state.ball.pos = { x: -BALL_RADIUS + 1, y: FIELD_HEIGHT / 2 };
    state.ball.vel = { x: 0, y: 0 };

    simulateStep(state);

    expect(state.score).toEqual({ home: 0, away: 0 });
  });

  it('does not count a goal just for entering the goal rectangle', () => {
    const state = createInitialMatchState('a', 'b');
    state.phase = 'shooting';
    state.turn = 'home';
    state.ball.pos.x = 17;
    state.ball.pos.y = FIELD_HEIGHT / 2;
    state.ball.vel.x = -4;
    state.ball.vel.y = 0;

    const finished = simulateStep(state);

    expect(finished).toBe(false);
    expect(state.score.home).toBe(0);
  });

  it('keeps the ball inside the exterior goal tunnel', () => {
    const state = createInitialMatchState('a', 'b');
    const leftGoal = state.goals.find((goal) => goal.x < 0)!;
    state.phase = 'shooting';
    state.ball.pos = { x: -10, y: leftGoal.y + BALL_RADIUS - 1 };
    state.ball.vel = { x: -1, y: -3 };

    simulateStep(state);

    expect(state.ball.pos.y).toBe(leftGoal.y + BALL_RADIUS);
    expect(state.ball.vel.y).toBeGreaterThan(0);
    expect(state.score.home).toBe(0);
  });

  it('bounces off the goal line outside the mouth without changing its vertical position', () => {
    const state = createInitialMatchState('a', 'b');
    state.phase = 'shooting';
    state.ball.pos = { x: BALL_RADIUS + 1, y: 100 };
    state.ball.vel = { x: -8, y: 0 };

    simulateStep(state);

    expect(state.ball.pos).toEqual({ x: BALL_RADIUS, y: 100 });
    expect(state.ball.vel.x).toBeGreaterThan(0);
    expect(state.score).toEqual({ home: 0, away: 0 });
  });

  it('bounces at the post instead of pulling a partial overlap into the goal', () => {
    const state = createInitialMatchState('a', 'b');
    const leftGoal = state.goals.find((goal) => goal.x < 0)!;
    state.phase = 'shooting';
    state.ball.pos = { x: BALL_RADIUS + 1, y: leftGoal.y + BALL_RADIUS - 2 };
    state.ball.vel = { x: -8, y: 0 };

    simulateStep(state);

    expect(state.ball.pos).toEqual({ x: BALL_RADIUS, y: leftGoal.y + BALL_RADIUS - 2 });
    expect(state.ball.vel.x).toBeGreaterThan(0);
  });

  it('deflects a glancing post hit without snapping the ball into the goal tunnel', () => {
    const state = createInitialMatchState('a', 'b');
    const leftGoal = state.goals.find((goal) => goal.x < 0)!;
    state.phase = 'shooting';
    state.ball.pos = { x: BALL_RADIUS + 1, y: leftGoal.y + 4 };
    state.ball.vel = { x: -8, y: 0 };

    simulateStep(state);

    expect(state.ball.pos.y).toBeGreaterThan(leftGoal.y + 4);
    expect(state.ball.pos.y).toBeLessThan(leftGoal.y + BALL_RADIUS);
    expect(state.ball.vel.y).toBeGreaterThan(0);
  });

  it('bounces the ball off the back wall after crossing the goal line', () => {
    const state = createInitialMatchState('a', 'b');
    state.phase = 'shooting';
    state.ball.pos = { x: -GOAL_WIDTH + BALL_RADIUS + 1, y: FIELD_HEIGHT / 2 };
    state.ball.vel = { x: -8, y: 0 };

    simulateStep(state);

    expect(state.ball.pos.x).toBe(-GOAL_WIDTH + BALL_RADIUS);
    expect(state.ball.vel.x).toBeGreaterThan(0);
    expect(state.score.home).toBe(1);
  });

  it('allows player discs to enter the goal and rebound off its back wall', () => {
    const state = createInitialMatchState('a', 'b');
    const player = state.players[0];
    state.phase = 'shooting';
    state.activeShotPlayer = 0;
    player.pos = { x: -GOAL_WIDTH + PLAYER_RADIUS + 1, y: FIELD_HEIGHT / 2 };
    player.vel = { x: -8, y: 0 };

    simulateStep(state);

    expect(player.pos.x).toBe(-GOAL_WIDTH + PLAYER_RADIUS);
    expect(player.vel.x).toBeGreaterThan(0);
  });

  it('continues producing movement frames after the goal is registered', () => {
    const state = createInitialMatchState('a', 'b');
    const shooter = state.players.find((player) => player.team === 'home')!;
    const shooterIndex = state.players.indexOf(shooter);
    state.ball.pos = { x: -BALL_RADIUS + 2, y: FIELD_HEIGHT / 2 };
    state.ball.vel = { x: -8, y: 0 };

    const { shotAnimation } = simulateShotWithFrames(state, shooterIndex, 0, 0, 'moving-after-goal');

    expect(shotAnimation.outcome.goalFrame).not.toBeNull();
    expect(shotAnimation.frames.length - 1).toBeGreaterThan(shotAnimation.outcome.goalFrame!);
    expect(shotAnimation.outcome.impacts.some((impact) => impact.kind === 'ball-wall')).toBe(true);
  });

  it('detects foul when shooter hits rival before ball', () => {
    const state = createInitialMatchState('a', 'b');

    // Place shooter overlapping rival, ball in center (away from goals)
    const shooter = state.players.find((p) => p.team === 'home' && p.number === 1)!;
    const rival = state.players.find((p) => p.team === 'away' && p.number === 1)!;
    const shooterIdx = state.players.indexOf(shooter);
    shooter.pos.x = 600;
    shooter.pos.y = 300;
    rival.pos.x = 600;
    rival.pos.y = 300;
    state.ball.pos.x = 500;
    state.ball.pos.y = 300;
    const { finalState, shotAnimation } = simulateShotWithFrames(state, shooterIdx, -18, 0);
    expect(shotAnimation.outcome.foul).toEqual({ byTeam: 'home', victimTeam: 'away' });
    expect(shotAnimation.outcome.foulFrame).not.toBeNull();
    expect(finalState.activeShotCommittedFoul).toBe(false);
    expect(finalState.bonusTurnTeam).toBe('away');
    expect(finalState.ball.pos).not.toEqual({ x: 500, y: 300 });
  });

  it('detects foul when a teammate hit by the shooter then hits a rival before the ball', () => {
    const state = createInitialMatchState('a', 'b');
    const shooter = state.players.find((p) => p.team === 'home' && p.number === 1)!;
    const teammate = state.players.find((p) => p.team === 'home' && p.number === 2)!;
    const rival = state.players.find((p) => p.team === 'away' && p.number === 1)!;
    const shooterIdx = state.players.indexOf(shooter);

    shooter.pos = { x: 700, y: 300 };
    teammate.pos = { x: 640, y: 300 };
    rival.pos = { x: 580, y: 300 };
    state.ball.pos = { x: 900, y: 100 };

    const { shotAnimation } = simulateShotWithFrames(state, shooterIdx, -18, 0, 'indirect-foul');

    expect(shotAnimation.outcome.foul).toEqual({ byTeam: 'home', victimTeam: 'away' });
    expect(shotAnimation.outcome.foulFrame).not.toBeNull();
  });

  it('records ball hit frames when a disc contacts the ball', () => {
    const state = createInitialMatchState('a', 'b');
    const homeCentral = state.players.find((p) => p.team === 'home' && p.number === 3)!;
    const homeIdx = state.players.indexOf(homeCentral);
    homeCentral.pos.x = 520;
    homeCentral.pos.y = 300;
    state.ball.pos.x = 500;
    state.ball.pos.y = 300;
    state.turn = 'home';

    const { shotAnimation } = simulateShotWithFrames(state, homeIdx, -12, 0, 'ball-hit-sfx');
    expect(shotAnimation.outcome.ballHitFrames.length).toBeGreaterThan(0);
    expect(shotAnimation.outcome.ballHitFrames[0]).toBeGreaterThan(0);
    expect(shotAnimation.outcome.ballHits).toHaveLength(shotAnimation.outcome.ballHitFrames.length);
    expect(shotAnimation.outcome.ballHits[0].level).toBeGreaterThanOrEqual(1);
    expect(shotAnimation.outcome.ballHits[0].level).toBeLessThanOrEqual(4);
    expect(shotAnimation.outcome.impacts.some((impact) => impact.kind === 'disc-ball')).toBe(true);
  });

  it('records disc collisions for visual impact effects', () => {
    const state = createInitialMatchState('a', 'b');
    const shooter = state.players.find((p) => p.team === 'home' && p.number === 1)!;
    const rival = state.players.find((p) => p.team === 'away' && p.number === 1)!;
    const shooterIdx = state.players.indexOf(shooter);
    shooter.pos = { x: 600, y: 300 };
    rival.pos = { x: 540, y: 300 };
    state.ball.pos = { x: 800, y: 500 };
    state.turn = 'home';

    const { shotAnimation } = simulateShotWithFrames(state, shooterIdx, -14, 0, 'disc-impact-fx');
    const discImpact = shotAnimation.outcome.impacts.find((impact) => impact.kind === 'disc-disc');

    expect(discImpact).toBeDefined();
    expect(discImpact?.playerIndices).toEqual(expect.arrayContaining([shooterIdx]));
    expect(discImpact?.level).toBeGreaterThanOrEqual(1);
    expect(discImpact?.level).toBeLessThanOrEqual(4);
  });

  it('records the first disc impact (not only subsequent ones)', () => {
    const state = createInitialMatchState('a', 'b');
    const homeCentral = state.players.find((p) => p.team === 'home' && p.number === 3)!;
    const homeIdx = state.players.indexOf(homeCentral);
    // Far enough that only the first contact is the shot; no second disc needed.
    homeCentral.pos.x = 600;
    homeCentral.pos.y = 300;
    state.ball.pos.x = 500;
    state.ball.pos.y = 300;
    state.turn = 'home';

    const { shotAnimation } = simulateShotWithFrames(state, homeIdx, -16, 0, 'first-hit');
    expect(shotAnimation.outcome.ballHitFrames.length).toBeGreaterThanOrEqual(1);
  });

  it('records wall bounces as ball hit events', () => {
    const state = createInitialMatchState('a', 'b');
    state.turn = 'home';
    const home = state.players.find((p) => p.team === 'home')!;
    const homeIdx = state.players.indexOf(home);
    home.pos.x = 500;
    home.pos.y = 80;
    state.ball.pos.x = 500;
    state.ball.pos.y = 40;
    // Shoot upward into the top wall
    const { shotAnimation } = simulateShotWithFrames(state, homeIdx, 0, -18, 'wall-hit');
    expect(shotAnimation.outcome.ballHitFrames.length).toBeGreaterThan(0);
    expect(shotAnimation.outcome.impacts.some((impact) => impact.kind === 'ball-wall')).toBe(true);
  });

  it('records goal frame when a goal is scored', () => {
    const state = createInitialMatchState('a', 'b');
    state.ball.pos.x = -GOAL_WIDTH + BALL_RADIUS;
    state.ball.pos.y = 300;
    const homePlayer = state.players.find((p) => p.team === 'home')!;
    const homePlayerIndex = state.players.indexOf(homePlayer);

    const { shotAnimation } = simulateShotWithFrames(state, homePlayerIndex, 0, 0, 'goal-sfx');
    expect(shotAnimation.finalState.score.home).toBe(1);
    expect(shotAnimation.outcome.goalFrame).not.toBeNull();
  });

  it('treats the goal mouth as a wall after a foul', () => {
    const state = createInitialMatchState('a', 'b');
    state.phase = 'shooting';
    state.activeShotCommittedFoul = true;
    state.ball.pos.x = 8;
    state.ball.pos.y = FIELD_HEIGHT / 2;
    state.ball.vel.x = -4;
    state.ball.vel.y = 0;

    const finished = simulateStep(state);

    expect(finished).toBe(false);
    expect(state.score).toEqual({ home: 0, away: 0 });
    expect(state.ball.pos.x).toBe(state.ball.radius);
    expect(state.ball.vel.x).toBeGreaterThan(0);
  });

  it('recovers an invalid settled ball position during aiming', () => {
    const state = createInitialMatchState('a', 'b');
    state.phase = 'aiming';
    state.ball.pos.x = -52;
    state.ball.pos.y = 276;
    state.ball.vel.x = 0;
    state.ball.vel.y = 0;

    const recovered = recoverInvalidBallState(state);

    expect(recovered).toBe(true);
    expect(state.ball.pos).toEqual({ x: 500, y: 300 });
    expect(state.ball.trail).toEqual([]);
  });

  it('swaps and mirrors the full match state when normalizing sides', () => {
    const state = createInitialMatchState('home-a', 'away-b');
    state.players[0].pos.x = 150;
    state.players[0].vel.x = 3;
    state.ball.pos.x = 120;
    state.ball.vel.x = -4;
    state.ball.trail = [{ x: 100, y: 300 }];
    state.score = { home: 2, away: 1 };
    state.turn = 'home';

    const swapped = swapMatchSides(state);

    expect(swapped.players[0].team).toBe('home');
    expect(swapped.players[0].pos.x).toBe(FIELD_WIDTH - 150);
    expect(swapped.players[0].vel.x).toBe(-3);
    expect(swapped.ball.pos.x).toBe(FIELD_WIDTH - 120);
    expect(swapped.ball.vel.x).toBe(4);
    expect(swapped.ball.trail[0].x).toBe(FIELD_WIDTH - 100);
    expect(swapped.goals[0].x).toBe(FIELD_WIDTH - state.goals[0].x - state.goals[0].width);
    expect(swapped.score).toEqual({ home: 1, away: 2 });
    expect(swapped.turn).toBe('away');
  });

  it('normalizes the away team to the left when a legacy state is mirrored', () => {
    const state = createInitialMatchState('home-a', 'away-b');
    const mirrored = swapMatchSides(state);

    const normalized = normalizeAwayTeamOnLeft(mirrored);
    const awayPlayers = normalized.players.filter((player) => player.team === 'away');
    const homePlayers = normalized.players.filter((player) => player.team === 'home');
    const awayAverageX = awayPlayers.reduce((sum, player) => sum + player.pos.x, 0) / awayPlayers.length;
    const homeAverageX = homePlayers.reduce((sum, player) => sum + player.pos.x, 0) / homePlayers.length;

    expect(awayAverageX).toBeLessThan(homeAverageX);
  });

  it('normalizes goal ownership so away defends the left goal', () => {
    const state = createInitialMatchState('home-a', 'away-b');
    state.goals = [
      { ...state.goals[0], team: 'home' },
      { ...state.goals[1], team: 'away' },
    ];

    const normalized = normalizeGoalTeams(state);
    const [leftGoal, rightGoal] = [...normalized.goals].sort((a, b) => a.x - b.x);

    expect(leftGoal.team).toBe('away');
    expect(rightGoal.team).toBe('home');
  });

  it('preserves original state (immutability)', () => {
    const state = createInitialMatchState('a', 'b');
    const originalTurn = state.turn;
    const homePlayer = state.players.find((p) => p.team === 'home')!;
    const homePlayerIndex = state.players.indexOf(homePlayer);
    simulateShot(state, homePlayerIndex, -10, 0);
    expect(state.turn).toBe(originalTurn);
  });
});
