import type { VercelRequest, VercelResponse } from '@vercel/node';
import { query } from '../_lib/neon.js';
import { getJsonBody, requireMethod } from '../_lib/http.js';
import { createInitialMatchState } from '../_lib/physics.js';
import { ensureSchema } from '../_lib/schema.js';

type CreateMatchBody = {
  challengeId: string;
  accessToken: string;
  homePubkey: string;
  awayPubkey: string;
  mode: string;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireMethod(req, res, 'POST')) return;

  try {
    await ensureSchema();
    const body = getJsonBody<CreateMatchBody>(req);

    if (!body.challengeId || !body.accessToken || !body.homePubkey || !body.awayPubkey || !body.mode) {
      res.status(400).json({ ok: false, error: 'Missing required fields' });
      return;
    }

    const challengeRows = await query<{
      id: string;
      access_token: string;
      state: string;
    }>`
      select id, access_token, state
      from challenges
      where id = ${body.challengeId}
      limit 1
    `;

    const challenge = challengeRows[0];
    if (!challenge) {
      res.status(404).json({ ok: false, error: 'Challenge not found' });
      return;
    }

    if (challenge.access_token !== body.accessToken) {
      res.status(403).json({ ok: false, error: 'Invalid access token' });
      return;
    }

    if (challenge.state !== 'accepted') {
      res.status(409).json({ ok: false, error: `Challenge is ${challenge.state}, not accepted` });
      return;
    }

    const existingMatchRows = await query<{ id: string }>`
      select id from matches where challenge_id = ${body.challengeId} limit 1
    `;

    if (existingMatchRows[0]) {
      res.status(200).json({ ok: true, matchId: existingMatchRows[0].id });
      return;
    }

    const matchId = `match-${body.challengeId}`;
    const initialState = createInitialMatchState(body.homePubkey, body.awayPubkey);

    await query`
      insert into matches (id, challenge_id, mode, status, home_pubkey, away_pubkey, current_state)
      values (${matchId}, ${body.challengeId}, ${body.mode}, 'active', ${body.homePubkey}, ${body.awayPubkey}, ${JSON.stringify(initialState)}::jsonb)
    `;

    await query`
      update challenges set state = 'in_match', updated_at = now() where id = ${body.challengeId}
    `;

    res.status(200).json({ ok: true, matchId });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to create match',
    });
  }
}
