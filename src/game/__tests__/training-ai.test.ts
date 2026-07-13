import { describe, expect, it } from 'vitest';
import { createInitialMatchState, simulateShotWithFrames } from '../physics';
import { chooseTrainingAiShot } from '../training-ai';

describe('chooseTrainingAiShot', () => {
  it('returns a valid shot for away on its turn', () => {
    const state = createInitialMatchState('home', 'away');
    state.turn = 'away';

    const shot = chooseTrainingAiShot(state, 'away');
    expect(shot).not.toBeNull();
    expect(state.players[shot!.playerIndex]?.team).toBe('away');
    expect(Math.hypot(shot!.velX, shot!.velY)).toBeGreaterThan(0);
  });

  it('scores when it has a direct finishing touch available', () => {
    const state = createInitialMatchState('home', 'away');
    state.turn = 'away';
    state.ball.pos.x = 930;
    state.ball.pos.y = 300;

    const striker = state.players.find((player) => player.team === 'away' && player.number === 3)!;
    striker.pos.x = 885;
    striker.pos.y = 300;

    const shot = chooseTrainingAiShot(state, 'away');
    expect(shot).not.toBeNull();

    const { finalState } = simulateShotWithFrames(state, shot!.playerIndex, shot!.velX, shot!.velY, 'training-ai-finish');
    expect(finalState.score.away).toBeGreaterThan(state.score.away);
  });

  it('avoids an obvious foul when a clean option exists', () => {
    const state = createInitialMatchState('home', 'away');
    state.turn = 'away';
    state.ball.pos.x = 720;
    state.ball.pos.y = 300;

    const riskyShooter = state.players.find((player) => player.team === 'away' && player.number === 3)!;
    riskyShooter.pos.x = 620;
    riskyShooter.pos.y = 300;

    const rivalBlocker = state.players.find((player) => player.team === 'home' && player.number === 3)!;
    rivalBlocker.pos.x = 620;
    rivalBlocker.pos.y = 300;

    const safeShooter = state.players.find((player) => player.team === 'away' && player.number === 1)!;
    safeShooter.pos.x = 690;
    safeShooter.pos.y = 240;

    const shot = chooseTrainingAiShot(state, 'away');
    expect(shot).not.toBeNull();

    const { shotAnimation } = simulateShotWithFrames(state, shot!.playerIndex, shot!.velX, shot!.velY, 'training-ai-no-foul');
    expect(shotAnimation.outcome.foul).toBeNull();
  });
});
