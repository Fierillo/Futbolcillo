import type { VercelRequest, VercelResponse } from '@vercel/node';
import { query } from '../_lib/neon.js';
import { getJsonBody, requireMethod } from '../_lib/http.js';
import { ensureSchema } from '../_lib/schema.js';

type CreateChallengeBody = {
  id: string;
  accessToken: string;
  ownerPubkey: string;
  rivalPubkey: string;
  mode: string;
  amountSats: number;
  expiresAt: string;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireMethod(req, res, 'POST')) return;

  try {
    await ensureSchema();
    const body = getJsonBody<CreateChallengeBody>(req);

    if (!body.id || !body.accessToken || !body.ownerPubkey || !body.rivalPubkey || !body.mode) {
      res.status(400).json({ ok: false, error: 'Missing required fields' });
      return;
    }

    await query`
      insert into challenges (id, access_token, owner_pubkey, rival_pubkey, mode, state, amount_sats, expires_at)
      values (${body.id}, ${body.accessToken}, ${body.ownerPubkey}, ${body.rivalPubkey}, ${body.mode}, 'sent', ${body.amountSats}, ${body.expiresAt}::timestamptz)
    `;

    res.status(200).json({ ok: true, id: body.id });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to create challenge',
    });
  }
}
