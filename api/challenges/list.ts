import type { VercelRequest, VercelResponse } from '@vercel/node';
import { query } from '../_lib/neon';
import { requireMethod } from '../_lib/http';
import { ensureSchema } from '../_lib/schema';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireMethod(req, res, 'GET')) return;

  try {
    await ensureSchema();
    const pubkey = (req.query.pubkey as string) || '';

    if (!pubkey) {
      res.status(400).json({ ok: false, error: 'Missing pubkey' });
      return;
    }

    const owned = await query<{
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
      where owner_pubkey = ${pubkey}
      order by updated_at desc
      limit 50
    `;

    const incoming = await query<{
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
      where rival_pubkey = ${pubkey}
      order by updated_at desc
      limit 50
    `;

    res.status(200).json({
      ok: true,
      owned: owned.map((c) => ({
        id: c.id,
        accessToken: c.access_token,
        ownerPubkey: c.owner_pubkey,
        rivalPubkey: c.rival_pubkey,
        mode: c.mode,
        state: c.state,
        amountSats: c.amount_sats,
        expiresAt: c.expires_at,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
      })),
      incoming: incoming.map((c) => ({
        id: c.id,
        accessToken: c.access_token,
        ownerPubkey: c.owner_pubkey,
        rivalPubkey: c.rival_pubkey,
        mode: c.mode,
        state: c.state,
        amountSats: c.amount_sats,
        expiresAt: c.expires_at,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
      })),
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to list challenges',
    });
  }
}
