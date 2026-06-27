import type { VercelRequest, VercelResponse } from '@vercel/node';
import { query } from '../_lib/neon.js';
import { getJsonBody, requireMethod } from '../_lib/http.js';
import { ensureSchema } from '../_lib/schema.js';

type TerminateBody = {
  matchId: string;
  terminatedBy: string;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireMethod(req, res, 'POST')) return;

  try {
    await ensureSchema();
    const body = getJsonBody<TerminateBody>(req);

    if (!body.matchId || !body.terminatedBy) {
      res.status(400).json({ ok: false, error: 'Missing required fields' });
      return;
    }

    const rows = await query<{
      id: string;
      status: string;
      home_pubkey: string;
      away_pubkey: string;
    }>`
      select id, status, home_pubkey, away_pubkey
      from matches
      where id = ${body.matchId}
      limit 1
    `;

    const match = rows[0];
    if (!match) {
      res.status(404).json({ ok: false, error: 'Match not found' });
      return;
    }

    if (body.terminatedBy !== match.home_pubkey && body.terminatedBy !== match.away_pubkey) {
      res.status(403).json({ ok: false, error: 'Not a player in this match' });
      return;
    }

    await query`
      update matches
      set status = 'terminated', terminated_by = ${body.terminatedBy}, updated_at = now()
      where id = ${body.matchId}
    `;

    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to terminate match',
    });
  }
}
