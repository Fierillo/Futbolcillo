import type { VercelRequest, VercelResponse } from '@vercel/node';
import { query } from '../_lib/neon';
import { getJsonBody, requireMethod } from '../_lib/http';
import { simulateShot, type MatchState } from '../_lib/physics';

type ShotBody = {
  matchId: string;
  actingPubkey: string;
  playerIndex: number;
  velX: number;
  velY: number;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireMethod(req, res, 'POST')) return;

  try {
    const body = getJsonBody<ShotBody>(req);

    if (!body.matchId || !body.actingPubkey || body.playerIndex === undefined || body.velX === undefined || body.velY === undefined) {
      res.status(400).json({ ok: false, error: 'Missing required fields' });
      return;
    }

    const matchRows = await query<{
      id: string;
      status: string;
      home_pubkey: string;
      away_pubkey: string;
      current_state: string;
    }>`
      select id, status, home_pubkey, away_pubkey, current_state::text
      from matches
      where id = ${body.matchId}
      limit 1
    `;

    const match = matchRows[0];
    if (!match) {
      res.status(404).json({ ok: false, error: 'Match not found' });
      return;
    }

    if (match.status !== 'active') {
      res.status(409).json({ ok: false, error: `Match is ${match.status}` });
      return;
    }

    if (body.actingPubkey !== match.home_pubkey && body.actingPubkey !== match.away_pubkey) {
      res.status(403).json({ ok: false, error: 'Not a player in this match' });
      return;
    }

    const currentState: MatchState = JSON.parse(match.current_state);
    const actingTeam = body.actingPubkey === match.home_pubkey ? 'home' : 'away';

    if (currentState.turn !== actingTeam) {
      res.status(409).json({ ok: false, error: 'Not your turn' });
      return;
    }

    if (currentState.phase !== 'aiming') {
      res.status(409).json({ ok: false, error: 'Not in aiming phase' });
      return;
    }

    if (currentState.winner) {
      res.status(409).json({ ok: false, error: 'Match already finished' });
      return;
    }

    const newState = simulateShot(currentState, body.playerIndex, body.velX, body.velY);

    await query`
      update matches set current_state = ${JSON.stringify(newState)}::jsonb, updated_at = now() where id = ${body.matchId}
    `;

    await query`
      insert into match_shots (match_id, acting_pubkey, payload)
      values (${body.matchId}, ${body.actingPubkey}, ${JSON.stringify({
        playerIndex: body.playerIndex,
        velX: body.velX,
        velY: body.velY,
        timestamp: Date.now(),
      })}::jsonb)
    `;

    if (newState.winner) {
      await query`
        update matches set status = 'finished', updated_at = now() where id = ${body.matchId}
      `;
    }

    res.status(200).json({ ok: true, state: newState });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to submit shot',
    });
  }
}
