import type { VercelRequest, VercelResponse } from '@vercel/node';
import { query } from '../_lib/neon.js';
import { requireMethod } from '../_lib/http.js';
import { ensureSchema } from '../_lib/schema.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireMethod(req, res, 'GET')) return;

  try {
    await ensureSchema();
    const challengeId = (req.query.id as string) || '';

    if (!challengeId) {
      res.status(400).json({ ok: false, error: 'Missing challenge id' });
      return;
    }

    const rows = await query<{
      id: string;
      access_token: string;
      owner_pubkey: string;
      rival_pubkey: string;
      mode: string;
      state: string;
      amount_sats: number;
      expires_at: string;
      created_at: string;
      updated_at: string;
    }>`
      select id, access_token, owner_pubkey, rival_pubkey, mode, state, amount_sats, expires_at::text, created_at::text, updated_at::text
      from challenges
      where id = ${challengeId}
      limit 1
    `;

    const challenge = rows[0];

    if (!challenge) {
      res.status(404).json({ ok: false, error: 'Challenge not found' });
      return;
    }

    res.status(200).json({
      ok: true,
      challenge: {
        id: challenge.id,
        accessToken: challenge.access_token,
        ownerPubkey: challenge.owner_pubkey,
        rivalPubkey: challenge.rival_pubkey,
        mode: challenge.mode,
        state: challenge.state,
        amountSats: challenge.amount_sats,
        expiresAt: challenge.expires_at,
        createdAt: challenge.created_at,
        updatedAt: challenge.updated_at,
      },
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to get challenge status',
    });
  }
}
