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
  amountSats?: number;
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

    await query`
      insert into users (pubkey) values (${body.homePubkey})
      on conflict (pubkey) do nothing
    `;
    await query`
      insert into users (pubkey) values (${body.awayPubkey})
      on conflict (pubkey) do nothing
    `;

    let challengeRows = await query<{
      id: string;
      access_token: string;
      state: string;
    }>`
      select id, access_token, state
      from challenges
      where id = ${body.challengeId}
      limit 1
    `;

    if (!challengeRows[0]) {
      await query`
        insert into challenges (id, access_token, owner_pubkey, rival_pubkey, mode, state, amount_sats, expires_at)
        values (${body.challengeId}, ${body.accessToken}, ${body.homePubkey}, ${body.awayPubkey}, ${body.mode}, 'accepted', ${body.amountSats || 0}, (now() + interval '24 hours'))
      `;
      challengeRows = await query<{
        id: string;
        access_token: string;
        state: string;
      }>`
        select id, access_token, state
        from challenges
        where id = ${body.challengeId}
        limit 1
      `;
    }

    const challenge = challengeRows[0];
    if (!challenge) {
      res.status(500).json({ ok: false, error: 'Challenge not found after creation' });
      return;
    }

    if (challenge.access_token !== body.accessToken) {
      res.status(403).json({ ok: false, error: 'Invalid access token' });
      return;
    }

    if (challenge.state !== 'accepted' && challenge.state !== 'in_match') {
      await query`
        update challenges set state = 'accepted', updated_at = now() where id = ${body.challengeId}
      `;
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
