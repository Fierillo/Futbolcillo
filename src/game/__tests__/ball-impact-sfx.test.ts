import { describe, expect, it } from 'vitest';
import { createInitialMatchState, simulateShotWithFrames } from '../physics';
import { detectBallImpactFrames } from '../ball-impact-sfx';

describe('detectBallImpactFrames', () => {
  it('detects the first disc-ball contact of a shot', () => {
    const state = createInitialMatchState('a', 'b');
    state.turn = 'home';
    const homeCentral = state.players.find((p) => p.team === 'home' && p.number === 3)!;
    const homeIdx = state.players.indexOf(homeCentral);
    homeCentral.pos.x = 540;
    homeCentral.pos.y = 300;
    state.ball.pos.x = 500;
    state.ball.pos.y = 300;

    const { shotAnimation } = simulateShotWithFrames(state, homeIdx, -14, 0, 'first-contact');
    const impacts = detectBallImpactFrames(shotAnimation.frames);

    expect(impacts.length).toBeGreaterThan(0);
    // First impact must be early in the shot (the kick), not a late wall-only event.
    expect(impacts[0]).toBeLessThan(40);
  });
});
