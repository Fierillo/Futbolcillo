import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  updateGame,
  handleMouseDown,
  handleMouseUp,
  applyRemoteShot,
} from '../engine';
import { FIELD_WIDTH, FIELD_HEIGHT, WIN_SCORE } from '../types';

function makeShot(state: ReturnType<typeof createInitialState>, team: 'home' | 'away', dx: number, dy: number) {
  const player = state.players.find((p) => p.team === team && p.number === 1)!;
  const playerIndex = state.players.indexOf(player);
  state.selectedPlayer = playerIndex;
  state.dragStart = { x: player.pos.x, y: player.pos.y };
  state.dragCurrent = { x: player.pos.x - dx, y: player.pos.y - dy };
  handleMouseUp(state);
  return state;
}

function runUntilStopped(state: ReturnType<typeof createInitialState>, maxFrames = 600) {
  for (let i = 0; i < maxFrames; i++) {
    updateGame(state, 1);
    if (state.phase === 'aiming') break;
  }
  return state;
}

describe('createInitialState', () => {
  it('creates 6 players, 3 per team', () => {
    const state = createInitialState();
    expect(state.players).toHaveLength(6);
    expect(state.players.filter((p) => p.team === 'home')).toHaveLength(3);
    expect(state.players.filter((p) => p.team === 'away')).toHaveLength(3);
  });

  it('starts with score 0-0', () => {
    const state = createInitialState();
    expect(state.score).toEqual({ home: 0, away: 0 });
  });

  it('starts in aiming phase with home turn', () => {
    const state = createInitialState();
    expect(state.phase).toBe('aiming');
    expect(state.turn).toBe('home');
    expect(state.winner).toBeNull();
  });

  it('places ball at center', () => {
    const state = createInitialState();
    expect(state.ball.pos.x).toBe(FIELD_WIDTH / 2);
    expect(state.ball.pos.y).toBe(FIELD_HEIGHT / 2);
  });
});

describe('handleMouseDown', () => {
  it('selects the closest player of the current team', () => {
    const state = createInitialState();
    const homePlayer = state.players.find((p) => p.team === 'home' && p.number === 1)!;
    const idx = state.players.indexOf(homePlayer);
    handleMouseDown(state, homePlayer.pos.x, homePlayer.pos.y);
    expect(state.selectedPlayer).toBe(idx);
    expect(homePlayer.isSelected).toBe(true);
  });

  it('does not select a player from the other team', () => {
    const state = createInitialState();
    const awayPlayer = state.players.find((p) => p.team === 'away' && p.number === 1)!;
    handleMouseDown(state, awayPlayer.pos.x, awayPlayer.pos.y);
    expect(state.selectedPlayer).toBeNull();
  });

  it('does nothing when game is won', () => {
    const state = createInitialState();
    state.winner = 'home';
    const homePlayer = state.players.find((p) => p.team === 'home' && p.number === 1)!;
    handleMouseDown(state, homePlayer.pos.x, homePlayer.pos.y);
    expect(state.selectedPlayer).toBeNull();
  });
});

describe('handleMouseUp', () => {
  it('sets phase to shooting when drag is long enough', () => {
    const state = createInitialState();
    const player = state.players.find((p) => p.team === 'home' && p.number === 1)!;
    const idx = state.players.indexOf(player);
    state.selectedPlayer = idx;
    state.dragStart = { x: player.pos.x, y: player.pos.y };
    state.dragCurrent = { x: player.pos.x + 100, y: player.pos.y };
    handleMouseUp(state);
    expect(state.phase).toBe('shooting');
    expect(player.vel.x).not.toBe(0);
  });

  it('does not shoot when drag is too short', () => {
    const state = createInitialState();
    const player = state.players.find((p) => p.team === 'home' && p.number === 1)!;
    const idx = state.players.indexOf(player);
    state.selectedPlayer = idx;
    state.dragStart = { x: player.pos.x, y: player.pos.y };
    state.dragCurrent = { x: player.pos.x + 1, y: player.pos.y };
    handleMouseUp(state);
    expect(state.phase).toBe('aiming');
  });
});

describe('updateGame - goals', () => {
  it('awards goal to home when ball enters away goal on left', () => {
    const state = createInitialState();
    state.phase = 'shooting';
    state.ball.pos.x = 5;
    state.ball.pos.y = FIELD_HEIGHT / 2;
    state.ball.vel.x = -5;
    state.ball.vel.y = 0;
    runUntilStopped(state);
    expect(state.score.home).toBe(1);
  });

  it('awards goal to away when ball enters home goal on right', () => {
    const state = createInitialState();
    state.phase = 'shooting';
    state.ball.pos.x = 975;
    state.ball.pos.y = FIELD_HEIGHT / 2;
    state.ball.vel.x = 10;
    state.ball.vel.y = 0;
    runUntilStopped(state);
    expect(state.score.away).toBe(1);
  });

  it('declares winner when WIN_SCORE is reached', () => {
    const state = createInitialState();
    state.score.home = WIN_SCORE - 1;
    state.phase = 'shooting';
    state.ball.pos.x = 10;
    state.ball.pos.y = FIELD_HEIGHT / 2;
    state.ball.vel.x = -10;
    state.ball.vel.y = 0;
    runUntilStopped(state);
    expect(state.winner).toBe('home');
  });
});

describe('updateGame - turns', () => {
  it('switches turn after shooting phase ends', () => {
    const state = createInitialState();
    makeShot(state, 'home', 50, 0);
    expect(state.turn).toBe('home');
    expect(state.phase).toBe('shooting');
    runUntilStopped(state);
    expect(state.turn).toBe('away');
    expect(state.phase).toBe('aiming');
  });
});

describe('updateGame - fouls', () => {
  it('detects foul when shooter hits rival before ball', () => {
    const state = createInitialState();

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
    state.phase = 'shooting';
    state.activeShotPlayer = shooterIdx;
    shooter.vel.x = -18;
    shooter.vel.y = 0;

    let foulDetected = false;
    for (let i = 0; i < 600; i++) {
      updateGame(state, 1);
      if (state.activeShotCommittedFoul) {
        foulDetected = true;
        break;
      }
      if ((state.phase as 'aiming' | 'shooting' | 'resetting') === 'aiming') break;
    }

    expect(foulDetected).toBe(true);
  });

  it('does not foul when shooter hits ball first', () => {
    const state = createInitialState();
    const shooter = state.players.find((p) => p.team === 'home' && p.number === 1)!;
    const shooterIdx = state.players.indexOf(shooter);
    state.ball.pos.x = 500;
    state.ball.pos.y = 300;
    shooter.pos.x = 540;
    shooter.pos.y = 300;
    state.phase = 'shooting';
    state.activeShotPlayer = shooterIdx;
    shooter.vel.x = -15;
    shooter.vel.y = 0;
    runUntilStopped(state);
    expect(state.activeShotCommittedFoul).toBe(false);
  });
});

describe('applyRemoteShot', () => {
  it('applies velocity to correct player', () => {
    const state = createInitialState();
    state.turn = 'away';
    const result = applyRemoteShot(state, 'away', 2, 5, -3);
    expect(result.phase).toBe('shooting');
    const away2 = state.players.find((p) => p.team === 'away' && p.number === 2);
    expect(away2?.vel.x).toBe(5);
    expect(away2?.vel.y).toBe(-3);
  });

  it('rejects shot when not that team turn', () => {
    const state = createInitialState();
    expect(state.turn).toBe('home');
    const result = applyRemoteShot(state, 'away', 1, 5, 0);
    expect(result.phase).toBe('aiming');
  });

  it('rejects shot when game is won', () => {
    const state = createInitialState();
    state.winner = 'home';
    const result = applyRemoteShot(state, 'home', 1, 5, 0);
    expect(result.phase).toBe('aiming');
  });
});
