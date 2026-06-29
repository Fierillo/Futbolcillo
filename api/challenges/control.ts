import type { VercelRequest, VercelResponse } from '@vercel/node';
import { query } from '../_lib/neon.js';
import { getJsonBody, requireMethod } from '../_lib/http.js';
import { ensureSchema } from '../_lib/schema.js';

type ControlBody = {
  action: 'reject' | 'finalize' | 'update_state';
  challengeId: string;
  accessToken?: string;
  pubkey?: string;
  state?: string;
  winnerPubkey?: string;
  scoreHome?: number;
  scoreAway?: number;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireMethod(req, res, 'POST')) return;

  try {
    await ensureSchema();
    const body = getJsonBody<ControlBody>(req);

    if (!body.challengeId || !body.action) {
      res.status(400).json({ ok: false, error: 'Missing required fields' });
      return;
    }

    const rows = await query<{
      id: string;
      access_token: string;
      owner_pubkey: string;
      rival_pubkey: string;
      state: string;
    }>`
      select id, access_token, owner_pubkey, rival_pubkey, state
      from challenges
      where id = ${body.challengeId}
      limit 1
    `;

    const challenge = rows[0];
    if (!challenge) {
      res.status(404).json({ ok: false, error: 'Challenge not found' });
      return;
    }

    if (body.action === 'reject') {
      if (!body.accessToken || !body.pubkey) {
        res.status(400).json({ ok: false, error: 'Missing accessToken or pubkey' });
        return;
      }
      if (challenge.access_token !== body.accessToken) {
        res.status(403).json({ ok: false, error: 'Invalid access token' });
        return;
      }
      if (challenge.rival_pubkey !== body.pubkey) {
        res.status(403).json({ ok: false, error: 'Not the rival for this challenge' });
        return;
      }
      if (challenge.state !== 'sent' && challenge.state !== 'received') {
        res.status(409).json({ ok: false, error: `Challenge is already ${challenge.state}` });
        return;
      }

      await query`
        update challenges set state = 'rejected', updated_at = now() where id = ${body.challengeId}
      `;

      res.status(200).json({ ok: true, challengeId: body.challengeId, state: 'rejected' });
      return;
    }

    if (body.action === 'finalize') {
      if (challenge.state !== 'in_match' && challenge.state !== 'accepted') {
        res.status(409).json({ ok: false, error: `Challenge is already ${challenge.state}` });
        return;
      }

      const winnerPubkey = body.winnerPubkey || null;
      const scoreHome = body.scoreHome ?? null;
      const scoreAway = body.scoreAway ?? null;

      await query`
        update challenges
        set state = 'finalized',
            winner_pubkey = ${winnerPubkey},
            score_home = ${scoreHome},
            score_away = ${scoreAway},
            updated_at = now()
        where id = ${body.challengeId}
      `;

      res.status(200).json({ ok: true, challengeId: body.challengeId, state: 'finalized' });
      return;
    }

    if (body.action === 'update_state') {
      if (!body.state) {
        res.status(400).json({ ok: false, error: 'Missing state' });
        return;
      }

      await query`
        update challenges set state = ${body.state}, updated_at = now() where id = ${body.challengeId}
      `;

      res.status(200).json({ ok: true, challengeId: body.challengeId, state: body.state });
      return;
    }

    res.status(400).json({ ok: false, error: 'Unknown challenge control action' });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to process challenge control action',
    });
  }
}
