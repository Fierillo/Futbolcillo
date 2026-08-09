import { BALL_RADIUS, FIELD_HEIGHT, FIELD_WIDTH, PLAYER_RADIUS } from './types';

type FramePos = { x: number; y: number };
type AnimFrame = {
  players: FramePos[];
  ball: FramePos;
};

const CONTACT_RADIUS = PLAYER_RADIUS + BALL_RADIUS + 1;
const CONTACT_RADIUS_SQ = CONTACT_RADIUS * CONTACT_RADIUS;
const WALL_EPS = 2.5;

function distSq(a: FramePos, b: FramePos) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function isTouching(player: FramePos, ball: FramePos) {
  return distSq(player, ball) <= CONTACT_RADIUS_SQ;
}

/**
 * Scan animation frames and return every frame index where the ball begins
 * contacting a disc or bounces off a wall. Frame 0 is the pose before the shot.
 */
export function detectBallImpactFrames(frames: AnimFrame[]): number[] {
  if (frames.length < 2) return [];

  const impacts: number[] = [];

  for (let f = 1; f < frames.length; f += 1) {
    const prev = frames[f - 1];
    const curr = frames[f];
    if (!prev?.ball || !curr?.ball || !prev.players || !curr.players) continue;

    let hit = false;

    // Disc contact starts (edge): not touching → touching.
    const count = Math.min(prev.players.length, curr.players.length);
    for (let i = 0; i < count; i += 1) {
      const was = isTouching(prev.players[i], prev.ball);
      const now = isTouching(curr.players[i], curr.ball);
      if (!was && now) {
        hit = true;
        break;
      }
    }

    // Wall bounces: ball moved into a boundary this step.
    if (!hit) {
      const pb = prev.ball;
      const cb = curr.ball;
      const hitTop = cb.y <= BALL_RADIUS + WALL_EPS && pb.y > cb.y;
      const hitBottom = cb.y >= FIELD_HEIGHT - BALL_RADIUS - WALL_EPS && pb.y < cb.y;
      const hitLeft = cb.x <= BALL_RADIUS + WALL_EPS && pb.x > cb.x;
      const hitRight = cb.x >= FIELD_WIDTH - BALL_RADIUS - WALL_EPS && pb.x < cb.x;
      hit = hitTop || hitBottom || hitLeft || hitRight;
    }

    if (hit) {
      impacts.push(f);
    }
  }

  return impacts;
}

/** Map impact frame indices to animation timestamps (ms). */
export function impactFramesToSchedule(
  impactFrames: number[],
  visibleFrameCount: number,
  physicsDurationMs: number,
): number[] {
  const maxFrame = Math.max(visibleFrameCount - 1, 1);
  return impactFrames.map((frame) => {
    const clamped = Math.min(Math.max(frame, 0), maxFrame);
    return maxFrame <= 1 ? 0 : (clamped / maxFrame) * physicsDurationMs;
  });
}
