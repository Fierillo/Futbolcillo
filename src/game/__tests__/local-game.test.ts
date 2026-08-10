import { describe, expect, it } from 'vitest';
import {
  consumeShotInput,
  createInitialState,
  handleDetachedPointerMove,
  handlePointerDown,
} from '../local-game';

describe('detached mobile aiming', () => {
  it('creates the shot from pointer displacement regardless of where the drag starts', () => {
    const state = createInitialState();
    const player = state.players.find((candidate) => candidate.team === state.turn)!;
    handlePointerDown(state, player.pos.x, player.pos.y);
    state.dragCurrent = { ...state.dragStart! };

    handleDetachedPointerMove(state, { x: 850, y: 500 }, 800, 500);
    const shot = consumeShotInput(state);

    expect(shot).not.toBeNull();
    expect(shot!.velX).toBeCloseTo(7.5);
    expect(shot!.velY).toBeCloseTo(0);
  });
});
