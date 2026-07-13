import {
  FIELD_HEIGHT,
  FIELD_WIDTH,
  MAX_SHOOT_POWER,
  PLAYER_RADIUS,
  BALL_RADIUS,
  compactMatchState,
  simulateShotWithFrames,
  type MatchState,
  type PhysicsGoal,
  type PhysicsVec2,
} from './physics';

interface TrainingAiShot {
  playerIndex: number;
  velX: number;
  velY: number;
}

interface CandidateShot extends TrainingAiShot {
  score: number;
}

function vec2(x: number, y: number): PhysicsVec2 {
  return { x, y };
}

function distance(a: PhysicsVec2, b: PhysicsVec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function normalize(vector: PhysicsVec2): PhysicsVec2 {
  const length = Math.hypot(vector.x, vector.y);
  if (length === 0) return vec2(0, 0);
  return vec2(vector.x / length, vector.y / length);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getGoalCenter(goal: PhysicsGoal): PhysicsVec2 {
  return vec2(goal.x + goal.width / 2, goal.y + goal.height / 2);
}

function getOwnGoal(state: MatchState, team: 'home' | 'away') {
  return state.goals.find((goal) => goal.team === team) ?? state.goals[0];
}

function getOpponentGoal(state: MatchState, team: 'home' | 'away') {
  return state.goals.find((goal) => goal.team !== team) ?? state.goals[0];
}

function buildShotToPoint(from: PhysicsVec2, target: PhysicsVec2, power: number) {
  const dir = normalize(vec2(target.x - from.x, target.y - from.y));
  return {
    velX: dir.x * power,
    velY: dir.y * power,
  };
}

function buildBallContactTarget(ball: PhysicsVec2, target: PhysicsVec2) {
  const toTarget = normalize(vec2(target.x - ball.x, target.y - ball.y));
  const contactDistance = PLAYER_RADIUS + BALL_RADIUS - 2;
  return vec2(
    ball.x - toTarget.x * contactDistance,
    ball.y - toTarget.y * contactDistance,
  );
}

function scoreCandidate(state: MatchState, team: 'home' | 'away', candidate: TrainingAiShot) {
  const { finalState, shotAnimation } = simulateShotWithFrames(
    state,
    candidate.playerIndex,
    candidate.velX,
    candidate.velY,
    'training-ai-eval',
  );

  const opponent: 'home' | 'away' = team === 'home' ? 'away' : 'home';
  const ownGoal = getOwnGoal(finalState, team);
  const opponentGoal = getOpponentGoal(finalState, team);
  const ownGoalCenter = getGoalCenter(ownGoal);
  const opponentGoalCenter = getGoalCenter(opponentGoal);
  const ballToOpponentGoal = distance(finalState.ball.pos, opponentGoalCenter);
  const ballToOwnGoal = distance(finalState.ball.pos, ownGoalCenter);
  const scoreDelta = (finalState.score[team] - state.score[team]) - (finalState.score[opponent] - state.score[opponent]);
  const supportDistance = Math.min(
    ...finalState.players
      .filter((player) => player.team === team)
      .map((player) => distance(player.pos, finalState.ball.pos)),
  );
  const shotDistanceToBall = distance(state.players[candidate.playerIndex].pos, state.ball.pos);
  const attackingProgress = team === 'away'
    ? finalState.ball.pos.x - state.ball.pos.x
    : state.ball.pos.x - finalState.ball.pos.x;
  const dangerPenalty = team === 'away'
    ? clamp(260 - finalState.ball.pos.x, 0, 260)
    : clamp(finalState.ball.pos.x - (FIELD_WIDTH - 260), 0, 260);

  let score = 0;
  score += scoreDelta * 120000;
  score -= ballToOpponentGoal * 8;
  score += ballToOwnGoal * 5;
  score -= supportDistance * 1.2;
  score += attackingProgress * 18;
  score -= dangerPenalty * 140;
  score -= shotDistanceToBall * 2;

  if (shotAnimation.outcome.foul) {
    score -= 90000;
  }

  if (finalState.turn !== team) {
    score -= 500;
  }

  if (team === 'away') {
    score += (finalState.ball.pos.x / FIELD_WIDTH) * 3000;
  } else {
    score += ((FIELD_WIDTH - finalState.ball.pos.x) / FIELD_WIDTH) * 3000;
  }

  if (finalState.ball.pos.y < 90 || finalState.ball.pos.y > FIELD_HEIGHT - 90) {
    score -= 400;
  }

  return score;
}

function createCandidateShots(state: MatchState, team: 'home' | 'away'): TrainingAiShot[] {
  const players = state.players
    .map((player, index) => ({ player, index }))
    .filter(({ player }) => player.team === team);
  const ball = state.ball.pos;
  const opponentGoal = getOpponentGoal(state, team);
  const ownGoal = getOwnGoal(state, team);
  const attackTargets = [
    getGoalCenter(opponentGoal),
    vec2(opponentGoal.x + opponentGoal.width / 2, opponentGoal.y + 24),
    vec2(opponentGoal.x + opponentGoal.width / 2, opponentGoal.y + opponentGoal.height - 24),
  ];
  const defensiveTargets = [
    getGoalCenter(ownGoal),
    vec2(team === 'away' ? FIELD_WIDTH - 120 : 120, FIELD_HEIGHT * 0.25),
    vec2(team === 'away' ? FIELD_WIDTH - 120 : 120, FIELD_HEIGHT * 0.75),
    vec2(FIELD_WIDTH / 2, FIELD_HEIGHT / 2),
  ];

  const candidates: TrainingAiShot[] = [];
  const powers = [8, 12, 16, MAX_SHOOT_POWER];

  for (const { player, index } of players) {
    for (const target of attackTargets) {
      const contactTarget = buildBallContactTarget(ball, target);
      for (const power of powers) {
        candidates.push({ playerIndex: index, ...buildShotToPoint(player.pos, contactTarget, power) });
      }
    }

    for (const target of defensiveTargets) {
      const contactTarget = buildBallContactTarget(ball, target);
      for (const power of powers) {
        candidates.push({ playerIndex: index, ...buildShotToPoint(player.pos, contactTarget, power) });
      }
    }

    for (const power of powers) {
      candidates.push({ playerIndex: index, ...buildShotToPoint(player.pos, ball, power) });
    }
  }

  return candidates;
}

export function chooseTrainingAiShot(state: MatchState, team: 'home' | 'away' = 'away'): TrainingAiShot | null {
  if (state.phase !== 'aiming' || state.turn !== team || state.winner) {
    return null;
  }

  const candidates = createCandidateShots(compactMatchState(state), team);
  let bestCandidate: CandidateShot | null = null;

  for (const candidate of candidates) {
    const score = scoreCandidate(state, team, candidate);
    if (!bestCandidate || score > bestCandidate.score) {
      bestCandidate = { ...candidate, score };
    }
  }

  return bestCandidate
    ? {
        playerIndex: bestCandidate.playerIndex,
        velX: bestCandidate.velX,
        velY: bestCandidate.velY,
      }
    : null;
}

export type { TrainingAiShot };
