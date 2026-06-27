import type { VercelRequest, VercelResponse } from '@vercel/node';
import { query } from '../_lib/neon.js';
import { getJsonBody, requireMethod } from '../_lib/http.js';
import { createInitialMatchState } from '../_lib/physics.js';
import { ensureSchema } from '../_lib/schema.js';

type ControlBody = {
  action: 'terminate' | 'rematch-request' | 'rematch-accept' | 'rematch-reject';
  matchId: string;
  requesterPubkey?: string;
  accepterPubkey?: string;
  rejecterPubkey?: string;
  terminatedBy?: string;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireMethod(req, res, 'POST')) return;

  try {
    await ensureSchema();
    const body = getJsonBody<ControlBody>(req);

    if (!body.matchId || !body.action) {
      res.status(400).json({ ok: false, error: 'Missing required fields' });
      return;
    }

    const rows = await query<{
      id: string;
      challenge_id: string;
      mode: string;
      status: string;
      home_pubkey: string;
      away_pubkey: string;
      rematch_requested_by: string | null;
      rematch_match_id: string | null;
    }>`
      select id, challenge_id, mode, status, home_pubkey, away_pubkey, rematch_requested_by, rematch_match_id
      from matches
      where id = ${body.matchId}
      limit 1
    `;

    const match = rows[0];
    if (!match) {
      res.status(404).json({ ok: false, error: 'Match not found' });
      return;
    }

    if (body.action === 'terminate') {
      const terminatedBy = body.terminatedBy || '';
      if (!terminatedBy) {
        res.status(400).json({ ok: false, error: 'Missing terminatedBy' });
        return;
      }
      if (terminatedBy !== match.home_pubkey && terminatedBy !== match.away_pubkey) {
        res.status(403).json({ ok: false, error: 'Not a player in this match' });
        return;
      }

      await query`
        update matches
        set status = 'terminated', terminated_by = ${terminatedBy}, updated_at = now()
        where id = ${body.matchId}
      `;

      res.status(200).json({ ok: true });
      return;
    }

    if (match.status !== 'finished') {
      res.status(409).json({ ok: false, error: 'Match is not finished' });
      return;
    }

    if (body.action === 'rematch-request') {
      const requesterPubkey = body.requesterPubkey || '';
      if (!requesterPubkey) {
        res.status(400).json({ ok: false, error: 'Missing requesterPubkey' });
        return;
      }
      if (requesterPubkey !== match.home_pubkey && requesterPubkey !== match.away_pubkey) {
        res.status(403).json({ ok: false, error: 'Not a player in this match' });
        return;
      }
      if (match.rematch_match_id) {
        res.status(409).json({ ok: false, error: 'Rematch already created' });
        return;
      }
      if (match.rematch_requested_by && match.rematch_requested_by !== requesterPubkey) {
        res.status(409).json({ ok: false, error: 'Opponent already requested rematch' });
        return;
      }

      await query`
        update matches
        set rematch_requested_by = ${requesterPubkey}, rematch_requested_at = now(), rematch_rejected_by = null, updated_at = now()
        where id = ${body.matchId}
      `;

      res.status(200).json({ ok: true });
      return;
    }

    if (body.action === 'rematch-accept') {
      const accepterPubkey = body.accepterPubkey || '';
      if (!accepterPubkey) {
        res.status(400).json({ ok: false, error: 'Missing accepterPubkey' });
        return;
      }
      if (accepterPubkey !== match.home_pubkey && accepterPubkey !== match.away_pubkey) {
        res.status(403).json({ ok: false, error: 'Not a player in this match' });
        return;
      }
      if (!match.rematch_requested_by) {
        res.status(409).json({ ok: false, error: 'No rematch request exists' });
        return;
      }
      if (match.rematch_requested_by === accepterPubkey) {
        res.status(409).json({ ok: false, error: 'Requester cannot self-accept rematch' });
        return;
      }
      if (match.rematch_match_id) {
        res.status(200).json({ ok: true, matchId: match.rematch_match_id });
        return;
      }

      const rematchId = `${match.id}-rematch-${Date.now()}`;
      const initialState = createInitialMatchState(match.home_pubkey, match.away_pubkey);

      await query`
        insert into matches (id, challenge_id, mode, status, home_pubkey, away_pubkey, current_state)
        values (${rematchId}, ${match.challenge_id}, ${match.mode}, 'active', ${match.home_pubkey}, ${match.away_pubkey}, ${JSON.stringify(initialState)}::jsonb)
      `;

      await query`
        update matches
        set rematch_match_id = ${rematchId}, updated_at = now()
        where id = ${body.matchId}
      `;

      res.status(200).json({ ok: true, matchId: rematchId });
      return;
    }

    if (body.action === 'rematch-reject') {
      const rejecterPubkey = body.rejecterPubkey || '';
      if (!rejecterPubkey) {
        res.status(400).json({ ok: false, error: 'Missing rejecterPubkey' });
        return;
      }
      if (rejecterPubkey !== match.home_pubkey && rejecterPubkey !== match.away_pubkey) {
        res.status(403).json({ ok: false, error: 'Not a player in this match' });
        return;
      }
      if (!match.rematch_requested_by) {
        res.status(409).json({ ok: false, error: 'No rematch request exists' });
        return;
      }
      if (match.rematch_match_id) {
        res.status(409).json({ ok: false, error: 'Rematch already created' });
        return;
      }

      await query`
        update matches
        set rematch_requested_by = null, rematch_requested_at = null, rematch_rejected_by = ${rejecterPubkey}, updated_at = now()
        where id = ${body.matchId}
      `;

      res.status(200).json({ ok: true });
      return;
    }

    res.status(400).json({ ok: false, error: 'Unknown match control action' });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to process match control action',
    });
  }
}
