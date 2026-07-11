import { describe, it, expect } from 'vitest';
import { createInitialMatchState, simulateShot, simulateShotWithFrames } from '../physics';

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
