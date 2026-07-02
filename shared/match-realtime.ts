import type { MatchState, ShotAnimation } from './match-physics.ts';

export type MatchStatus = 'active' | 'finished' | 'terminated';

export interface ActiveMatchSnapshot {
  id: string;
  challengeId: string;
  status: MatchStatus;
  homePubkey: string;
  awayPubkey: string;
  homeName?: string | null;
  awayName?: string | null;
  state: MatchState;
  latestShotAnimation?: ShotAnimation | null;
  rematchRequestedBy?: string | null;
  rematchMatchId?: string | null;
  nextChallengeId?: string | null;
  rematchRejectedBy?: string | null;
  terminatedBy?: string | null;
  updatedAt: string;
}

export type MatchControlAction = 'terminate' | 'rematch-request' | 'rematch-accept' | 'rematch-reject';

export type MatchClientEvent =
  | { type: 'sync-request' }
  | { type: 'shot'; playerIndex: number; velX: number; velY: number }
  | { type: 'terminate'; terminatedBy: string }
  | { type: 'rematch-request'; requesterPubkey: string }
  | { type: 'rematch-accept'; accepterPubkey: string }
  | { type: 'rematch-reject'; rejecterPubkey: string };

export type MatchServerEvent =
  | { type: 'match.snapshot'; match: ActiveMatchSnapshot }
  | { type: 'shot.resolved'; actingPubkey: string; match: ActiveMatchSnapshot; shotAnimation: ShotAnimation }
  | { type: 'control.resolved'; action: MatchControlAction; actorPubkey: string; match: ActiveMatchSnapshot }
  | { type: 'match.error'; message: string; match?: ActiveMatchSnapshot };
