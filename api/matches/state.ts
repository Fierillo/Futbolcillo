import type { VercelRequest, VercelResponse } from '@vercel/node';
import { query } from '../_lib/neon.js';
import { requireMethod } from '../_lib/http.js';
import { ensureSchema } from '../_lib/schema.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireMethod(req, res, 'GET')) return;

  try {
    await ensureSchema();
    const matchId = (req.query.matchId as string) || '';

    if (!matchId) {
      res.status(400).json({ ok: false, error: 'Missing matchId' });
      return;
    }

    const rows = await query<{
      id: string;
      status: string;
      home_pubkey: string;
      away_pubkey: string;
      current_state: string;
      rematch_requested_by: string | null;
      rematch_match_id: string | null;
      rematch_rejected_by: string | null;
      terminated_by: string | null;
      updated_at: string;
    }>`
      select id, status, home_pubkey, away_pubkey, current_state::text, rematch_requested_by, rematch_match_id, rematch_rejected_by, terminated_by, updated_at::text
      from matches
      where id = ${matchId}
      limit 1
    `;

    const match = rows[0];
    if (!match) {
      res.status(404).json({ ok: false, error: 'Match not found' });
      return;
    }

    if (!match.current_state) {
      res.status(500).json({ ok: false, error: 'Match state is null' });
      return;
    }

    let state: unknown;
    try {
      state = JSON.parse(match.current_state);
    } catch {
      res.status(500).json({ ok: false, error: 'Corrupted match state' });
      return;
    }

    res.status(200).json({
      ok: true,
      match: {
        id: match.id,
        status: match.status,
        homePubkey: match.home_pubkey,
        awayPubkey: match.away_pubkey,
        state,
        rematchRequestedBy: match.rematch_requested_by,
        rematchMatchId: match.rematch_match_id,
        rematchRejectedBy: match.rematch_rejected_by,
        terminatedBy: match.terminated_by,
        updatedAt: match.updated_at,
      },
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to get match state',
    });
  }
}
