import { describe, it, expect } from 'vitest';
import { createInitialMatchState, simulateShot, type MatchState } from '../physics';

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
    const awayPlayerIndex = state.players.findIndex((p) => p.team === 'away');
    const result = simulateShot(state, awayPlayerIndex, 10, 0);
    expect(result.phase).toBe('aiming');
  });

  it('does nothing when game is won', () => {
    const state = createInitialMatchState('a', 'b');
    state.winner = 'home';
    const result = simulateShot(state, 0, 10, 0);
    expect(result.phase).toBe('aiming');
  });

  it('applies velocity and runs simulation', () => {
    const state = createInitialMatchState('a', 'b');
    const homePlayerIndex = state.players.findIndex((p) => p.team === 'home');
    const result = simulateShot(state, homePlayerIndex, 10, 0);
    expect(result.phase).toBe('aiming');
    expect(result.activeShotPlayer).toBeNull();
    const shooter = result.players[homePlayerIndex];
    expect(shooter.pos.x).toBeGreaterThan(state.players[homePlayerIndex].pos.x);
  });

  it('switches turn after shot completes', () => {
    const state = createInitialMatchState('a', 'b');
    expect(state.turn).toBe('home');
    const homePlayerIndex = state.players.findIndex((p) => p.team === 'home');
    const result = simulateShot(state, homePlayerIndex, 10, 0);
    expect(result.turn).toBe('away');
  });

  it('detects goal and updates score', () => {
    const state = createInitialMatchState('a', 'b');
    state.ball.pos.x = 990;
    state.ball.pos.y = 300;
    const awayPlayerIndex = state.players.findIndex((p) => p.team === 'away');
    state.turn = 'away';
    const result = simulateShot(state, awayPlayerIndex, 0, 0);
    expect(result.score.home).toBe(1);
  });

  it('detects foul when shooter hits rival before ball', () => {
    const state = createInitialMatchState('a', 'b');
    const shooter = state.players[0];
    const rival = state.players[3];
    shooter.pos.x = 300;
    shooter.pos.y = 300;
    state.players[1].pos.y = 100;
    state.players[2].pos.y = 500;
    rival.pos.x = 330;
    rival.pos.y = 300;
    state.ball.pos.x = 900;
    state.ball.pos.y = 300;
    const result = simulateShot(state, 0, 18, 0);
    expect(result.activeShotCommittedFoul || result.bonusTurnTeam === 'away').toBe(true);
  });

  it('preserves original state (immutability)', () => {
    const state = createInitialMatchState('a', 'b');
    const originalTurn = state.turn;
    const homePlayerIndex = state.players.findIndex((p) => p.team === 'home');
    simulateShot(state, homePlayerIndex, 10, 0);
    expect(state.turn).toBe(originalTurn);
  });
});
