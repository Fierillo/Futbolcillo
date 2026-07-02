import type { VercelRequest, VercelResponse } from '@vercel/node';
import { query } from '../_lib/neon.js';
import { getJsonBody, requireMethod } from '../_lib/http.js';
import { ensureSchema } from '../_lib/schema.js';

type AcceptChallengeBody = {
  challengeId: string;
  accessToken: string;
  rivalPubkey: string;
  ownerPubkey?: string;
  mode?: string;
  amountSats?: number;
  expiresAt?: string;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireMethod(req, res, 'POST')) return;

  try {
    await ensureSchema();
    const body = getJsonBody<AcceptChallengeBody>(req);

    if (!body.challengeId || !body.accessToken || !body.rivalPubkey) {
      res.status(400).json({ ok: false, error: 'Missing required fields' });
      return;
    }

    let rows = await query<{
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

    let challenge = rows[0];

    if (!challenge && body.ownerPubkey) {
      const expiresAt = body.expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await query`
        insert into challenges (id, access_token, owner_pubkey, rival_pubkey, mode, state, amount_sats, expires_at)
        values (${body.challengeId}, ${body.accessToken}, ${body.ownerPubkey}, ${body.rivalPubkey}, ${body.mode || 'friendly'}, 'accepted', ${body.amountSats || 0}, ${expiresAt}::timestamptz)
      `;

      rows = await query<{
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
      challenge = rows[0];
    }

    if (!challenge) {
      res.status(404).json({ ok: false, error: 'Challenge not found' });
      return;
    }

    if (challenge.access_token !== body.accessToken) {
      res.status(403).json({ ok: false, error: 'Invalid access token' });
      return;
    }

    if (challenge.rival_pubkey !== body.rivalPubkey) {
      res.status(403).json({ ok: false, error: 'Not the rival for this challenge' });
      return;
    }

    if (challenge.state !== 'sent' && challenge.state !== 'received' && challenge.state !== 'accepted') {
      res.status(409).json({ ok: false, error: `Challenge is already ${challenge.state}` });
      return;
    }

    await query`
      update challenges set state = 'accepted', updated_at = now() where id = ${body.challengeId}
    `;

    res.status(200).json({ ok: true, challengeId: body.challengeId, state: 'accepted' });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to accept challenge',
    });
  }
}
