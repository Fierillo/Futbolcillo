import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyEvent } from 'nostr-tools';
import { query } from '../_lib/neon';
import { getJsonBody, requireMethod } from '../_lib/http';

type VerifyBody = {
  nonceId: string;
  event: {
    id: string;
    pubkey: string;
    created_at: number;
    kind: number;
    tags: string[][];
    content: string;
    sig: string;
  };
};

type AuthNonceRow = {
  id: string;
  pubkey: string;
  challenge: string;
  expires_at: string;
  consumed_at: string | null;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireMethod(req, res, 'POST')) return;

  try {
    const { nonceId, event } = getJsonBody<VerifyBody>(req);
    if (!nonceId || !event) {
      res.status(400).json({ ok: false, error: 'Missing nonceId or event' });
      return;
    }

    const rows = await query<AuthNonceRow>`
      select id, pubkey, challenge, expires_at::text, consumed_at::text
      from auth_nonces
      where id = ${nonceId}
      limit 1
    `;

    const authNonce = rows[0];
    if (!authNonce) {
      res.status(404).json({ ok: false, error: 'Challenge not found' });
      return;
    }

    if (authNonce.consumed_at) {
      res.status(409).json({ ok: false, error: 'Challenge already used' });
      return;
    }

    if (new Date(authNonce.expires_at).getTime() < Date.now()) {
      res.status(410).json({ ok: false, error: 'Challenge expired' });
      return;
    }

    if (!verifyEvent(event)) {
      res.status(400).json({ ok: false, error: 'Invalid event signature' });
      return;
    }

    if (event.pubkey !== authNonce.pubkey) {
      res.status(400).json({ ok: false, error: 'Signed pubkey does not match challenge pubkey' });
      return;
    }

    if (event.content !== authNonce.challenge) {
      res.status(400).json({ ok: false, error: 'Signed challenge content does not match' });
      return;
    }

    const sessionId = crypto.randomUUID();
    const sessionExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    await query`
      insert into users (pubkey)
      values (${authNonce.pubkey})
      on conflict (pubkey) do update set updated_at = now()
    `;

    await query`
      insert into sessions (id, pubkey, challenge, expires_at)
      values (${sessionId}, ${authNonce.pubkey}, ${authNonce.challenge}, ${sessionExpiresAt}::timestamptz)
    `;

    await query`
      update auth_nonces
      set consumed_at = now()
      where id = ${nonceId}
    `;

    res.status(200).json({
      ok: true,
      sessionId,
      pubkey: authNonce.pubkey,
      expiresAt: sessionExpiresAt,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to verify auth challenge',
    });
  }
}
