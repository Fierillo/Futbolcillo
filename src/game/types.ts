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

export interface Mechero {
  pos: Vec2;
  radius: number;
  exploded: boolean;
  explodeTimer: number;
  flashTimer: number;
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
  mecheros: Mechero[];
  goals: Goal[];
  score: { home: number; away: number };
  turn: 'home' | 'away';
  phase: 'aiming' | 'shooting' | 'resetting';
  selectedPlayer: number | null;
  dragStart: Vec2 | null;
  dragCurrent: Vec2 | null;
  winner: 'home' | 'away' | null;
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

export const FIELD_WIDTH = 1000;
export const FIELD_HEIGHT = 600;
export const PLAYER_RADIUS = 22;
export const BALL_RADIUS = 14;
export const MECHERO_RADIUS = 16;
export const GOAL_WIDTH = 20;
export const GOAL_HEIGHT = 160;
export const FRICTION = 0.985;
export const STOP_THRESHOLD = 0.08;
export const MAX_SHOOT_POWER = 18;
export const WIN_SCORE = 5;
