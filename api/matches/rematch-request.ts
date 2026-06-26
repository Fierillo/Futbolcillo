import type { VercelRequest, VercelResponse } from '@vercel/node';
import { query } from '../_lib/neon.js';
import { getJsonBody, requireMethod } from '../_lib/http.js';
import { ensureSchema } from '../_lib/schema.js';

type RematchRequestBody = {
  matchId: string;
  requesterPubkey: string;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireMethod(req, res, 'POST')) return;

  try {
    await ensureSchema();
    const body = getJsonBody<RematchRequestBody>(req);

    if (!body.matchId || !body.requesterPubkey) {
      res.status(400).json({ ok: false, error: 'Missing required fields' });
      return;
    }

    const rows = await query<{
      id: string;
      status: string;
      home_pubkey: string;
      away_pubkey: string;
      rematch_requested_by: string | null;
      rematch_match_id: string | null;
    }>`
      select id, status, home_pubkey, away_pubkey, rematch_requested_by, rematch_match_id
      from matches
      where id = ${body.matchId}
      limit 1
    `;

    const match = rows[0];
    if (!match) {
      res.status(404).json({ ok: false, error: 'Match not found' });
      return;
    }

    if (match.status !== 'finished') {
      res.status(409).json({ ok: false, error: 'Match is not finished' });
      return;
    }

    if (body.requesterPubkey !== match.home_pubkey && body.requesterPubkey !== match.away_pubkey) {
      res.status(403).json({ ok: false, error: 'Not a player in this match' });
      return;
    }

    if (match.rematch_match_id) {
      res.status(409).json({ ok: false, error: 'Rematch already created' });
      return;
    }

    if (match.rematch_requested_by && match.rematch_requested_by !== body.requesterPubkey) {
      res.status(409).json({ ok: false, error: 'Opponent already requested rematch' });
      return;
    }

    await query`
      update matches
      set rematch_requested_by = ${body.requesterPubkey}, rematch_requested_at = now(), updated_at = now()
      where id = ${body.matchId}
    `;

    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to request rematch',
    });
  }
}
