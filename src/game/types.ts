import type { ShotAnimation } from '../../shared/core-match-engine.ts';

export interface Vec2 {
  x: number;
  y: number;
}

export interface Entity {
  pos: Vec2;
  vel: Vec2;
  radius: number;
  mass: number;
  color: string;
  strokeColor: string;
}

export interface Player extends Entity {
  team: 'home' | 'away';
  number: number;
  isSelected: boolean;
  cooldown: number;
}

export interface Ball extends Entity {
  trail: Vec2[];
}

export interface Goal {
  x: number;
  y: number;
  width: number;
  height: number;
  team: 'home' | 'away';
}

export interface GameState {
  players: Player[];
  ball: Ball;
  goals: Goal[];
  score: { home: number; away: number };
  turn: 'home' | 'away';
  bonusTurnTeam: 'home' | 'away' | null;
  pendingBonusTurns: number;
  phase: 'aiming' | 'shooting' | 'resetting';
  selectedPlayer: number | null;
  activeShotPlayer: number | null;
  activeShotTouchedBall: boolean;
  activeShotCommittedFoul: boolean;
  dragStart: Vec2 | null;
  dragCurrent: Vec2 | null;
  winner: 'home' | 'away' | null;
  lastShot: { id: string; playerIndex: number; velX: number; velY: number } | null;
  lastShotAnimation: ShotAnimation | null;
  message: string;
  messageTimer: number;
  particles: Particle[];
  cameraShake: number;
}

export interface Particle {
  pos: Vec2;
  vel: Vec2;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export {
  FIELD_WIDTH,
  FIELD_HEIGHT,
  PLAYER_RADIUS,
  BALL_RADIUS,
  GOAL_WIDTH,
  GOAL_HEIGHT,
  FRICTION,
  STOP_THRESHOLD,
  MAX_SHOOT_POWER,
  MOVEMENT_SCALE,
  WIN_SCORE,
} from '../../shared/core-match-engine.ts';
