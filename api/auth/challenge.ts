import type { VercelRequest, VercelResponse } from '@vercel/node';
import { query } from '../_lib/neon.js';
import { getJsonBody, requireMethod } from '../_lib/http.js';

type ChallengeBody = {
  pubkey: string;
};

function createChallengeMessage(pubkey: string, nonce: string) {
  return `Futbolcillo login\npubkey:${pubkey}\nnonce:${nonce}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireMethod(req, res, 'POST')) return;

  try {
    const { pubkey } = getJsonBody<ChallengeBody>(req);
    if (!pubkey || typeof pubkey !== 'string') {
      res.status(400).json({ ok: false, error: 'Missing pubkey' });
      return;
    }

    const nonceId = crypto.randomUUID();
    const nonce = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const challenge = createChallengeMessage(pubkey, nonce);

    await query`
      insert into auth_nonces (id, pubkey, challenge, expires_at)
      values (${nonceId}, ${pubkey}, ${challenge}, ${expiresAt}::timestamptz)
    `;

    res.status(200).json({
      ok: true,
      nonceId,
      challenge,
      expiresAt,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to create auth challenge',
    });
  }
}
