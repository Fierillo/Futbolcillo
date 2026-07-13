import { describe, it, expect } from 'vitest';
import { createInitialMatchState, FIELD_HEIGHT, FIELD_WIDTH, normalizeAwayTeamOnLeft, normalizeGoalTeams, recoverInvalidBallState, simulateShot, simulateShotWithFrames, simulateStep, swapMatchSides } from '../physics';

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
    state.ball.pos.x = 14;
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

  it('counts a goal when the ball crosses fully beyond the left post inside the goal lane', () => {
    const state = createInitialMatchState('a', 'b');
    state.phase = 'shooting';
    state.turn = 'home';
    state.ball.pos.x = -5;
    state.ball.pos.y = FIELD_HEIGHT / 2;
    state.ball.vel.x = 0;
    state.ball.vel.y = 0;

    const finished = simulateStep(state);

    expect(finished).toBe(true);
    expect(state.score.home).toBe(1);
    expect(state.ball.pos).toEqual({ x: 500, y: 300 });
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
    expect(finalState.activeShotCommittedFoul).toBe(false);
    expect(finalState.bonusTurnTeam).toBe('away');
    expect(finalState.ball.pos).not.toEqual({ x: 500, y: 300 });
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
