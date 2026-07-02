import type * as Party from 'partykit/server';
import { createInitialMatchState, simulateShotWithFrames, type MatchState } from '../shared/match-physics.ts';
import type { ActiveMatchSnapshot, MatchClientEvent, MatchServerEvent, MatchStatus } from '../shared/match-realtime.ts';
import { getSql } from './neon.ts';

type MatchRow = {
  id: string;
  challenge_id: string;
  status: MatchStatus;
  home_pubkey: string;
  away_pubkey: string;
  home_name: string | null;
  away_name: string | null;
  current_state: string;
  rematch_requested_by: string | null;
  rematch_match_id: string | null;
  rematch_rejected_by: string | null;
  terminated_by: string | null;
  updated_at: string;
};

type PersistedSnapshot = Omit<ActiveMatchSnapshot, 'latestShotAnimation' | 'nextChallengeId'>;

function parseEvent(message: string | ArrayBuffer): MatchClientEvent | null {
  if (typeof message !== 'string') return null;

  try {
    return JSON.parse(message) as MatchClientEvent;
  } catch {
    return null;
  }
}

function decodePartyId(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isPlayer(snapshot: ActiveMatchSnapshot, pubkey: string) {
  return pubkey === snapshot.homePubkey || pubkey === snapshot.awayPubkey;
}

function toPersistedSnapshot(snapshot: ActiveMatchSnapshot): PersistedSnapshot {
  const { latestShotAnimation: _latestShotAnimation, nextChallengeId: _nextChallengeId, ...persisted } = snapshot;
  return persisted;
}

export default class MatchServer implements Party.Server {
  readonly options = {
    hibernate: true,
  };

  private snapshot: ActiveMatchSnapshot | null = null;
  private loadPromise: Promise<void> | null = null;

  constructor(readonly room: Party.Room) {}

  async onStart() {
    await this.ensureLoaded();
  }

  async onConnect(connection: Party.Connection, ctx: Party.ConnectionContext) {
    await this.ensureLoaded();

    const url = new URL(ctx.request.url);
    const accessToken = url.searchParams.get('accessToken') || '';
    const pubkey = url.searchParams.get('pubkey') || '';

    if (!this.snapshot) {
      this.sendTo(connection, { type: 'match.error', message: 'No se pudo cargar la partida.' });
      connection.close();
      return;
    }

    if (!accessToken || !pubkey) {
      this.sendTo(connection, { type: 'match.error', message: 'Falta accessToken o pubkey para abrir la partida.' });
      connection.close();
      return;
    }

    const rows = await this.sql`
      select c.access_token
      from matches m
      join challenges c on c.id = m.challenge_id
      where m.id = ${this.snapshot.id}
      limit 1
    ` as { access_token: string }[];

    const expectedAccessToken = rows[0]?.access_token || '';
    if (expectedAccessToken !== accessToken) {
      this.sendTo(connection, { type: 'match.error', message: 'El access token de la partida no coincide.' });
      connection.close();
      return;
    }

    if (!isPlayer(this.snapshot, pubkey)) {
      this.sendTo(connection, { type: 'match.error', message: 'Esta pubkey no pertenece a la partida.' });
      connection.close();
      return;
    }

    connection.setState({ pubkey });

    this.sendSnapshot(connection);
  }

  async onMessage(message: string | ArrayBuffer, sender: Party.Connection) {
    await this.ensureLoaded();

    const event = parseEvent(message);
    if (!event || !this.snapshot) {
      this.sendError(sender, 'Mensaje inválido.');
      return;
    }

    const actorPubkey = String(((sender.state as { pubkey?: string } | null) || {}).pubkey || '');
    if (!isPlayer(this.snapshot, actorPubkey)) {
      this.sendError(sender, 'No pertenecés a esta partida.');
      return;
    }

    switch (event.type) {
      case 'sync-request':
        this.sendSnapshot(sender);
        return;
      case 'shot':
        await this.handleShot(sender, actorPubkey, event.playerIndex, event.velX, event.velY);
        return;
      case 'terminate':
        await this.handleTerminate(sender, actorPubkey, event.terminatedBy);
        return;
      case 'rematch-request':
        await this.handleRematchRequest(sender, actorPubkey, event.requesterPubkey);
        return;
      case 'rematch-accept':
        await this.handleRematchAccept(sender, actorPubkey, event.accepterPubkey);
        return;
      case 'rematch-reject':
        await this.handleRematchReject(sender, actorPubkey, event.rejecterPubkey);
    }
  }

  async onRequest(req: Party.Request) {
    await this.ensureLoaded();

    if (req.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 });
    }

    return new Response(JSON.stringify({ ok: true, match: this.snapshot ? toPersistedSnapshot(this.snapshot) : null }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private get sql() {
    return getSql(this.room.env);
  }

  private async ensureLoaded() {
    if (!this.loadPromise) {
      this.loadPromise = this.loadSnapshot();
    }

    await this.loadPromise;
  }

  private async loadSnapshot() {
    const matchId = decodePartyId(this.room.id);
    const stored = await this.room.storage.get<PersistedSnapshot>('snapshot');
    if (stored) {
      this.snapshot = { ...stored, latestShotAnimation: null };
      return;
    }

    const rows = await this.sql`
      select id, challenge_id, status, home_pubkey, away_pubkey, home_name, away_name,
             current_state::text, rematch_requested_by, rematch_match_id, rematch_rejected_by,
             terminated_by, updated_at::text
      from matches
      where id = ${matchId}
      limit 1
    ` as MatchRow[];

    const match = rows[0];
    if (!match) return;

    this.snapshot = {
      id: match.id,
      challengeId: match.challenge_id,
      status: match.status,
      homePubkey: match.home_pubkey,
      awayPubkey: match.away_pubkey,
      homeName: match.home_name,
      awayName: match.away_name,
      state: JSON.parse(match.current_state) as MatchState,
      latestShotAnimation: null,
      rematchRequestedBy: match.rematch_requested_by,
      rematchMatchId: match.rematch_match_id,
      nextChallengeId: null,
      rematchRejectedBy: match.rematch_rejected_by,
      terminatedBy: match.terminated_by,
      updatedAt: match.updated_at,
    };

    await this.room.storage.put('snapshot', toPersistedSnapshot(this.snapshot));
  }

  private buildSnapshot() {
    if (!this.snapshot) {
      throw new Error('Match snapshot is not loaded');
    }

    return { ...this.snapshot };
  }

  private sendSnapshot(connection: Party.Connection) {
    this.sendTo(connection, {
      type: 'match.snapshot',
      match: { ...this.buildSnapshot(), latestShotAnimation: null },
    });
  }

  private sendError(connection: Party.Connection, message: string) {
    this.sendTo(connection, {
      type: 'match.error',
      message,
      match: this.snapshot ? { ...this.buildSnapshot(), latestShotAnimation: null } : undefined,
    });
  }

  private sendTo(connection: Party.Connection, event: MatchServerEvent) {
    connection.send(JSON.stringify(event));
  }

  private broadcast(event: MatchServerEvent) {
    this.room.broadcast(JSON.stringify(event));
  }

  private async persistSnapshot(status = this.snapshot?.status) {
    if (!this.snapshot) return;

    this.snapshot.updatedAt = new Date().toISOString();
    if (status) {
      this.snapshot.status = status;
    }

    await this.room.storage.put('snapshot', toPersistedSnapshot(this.snapshot));
    await this.sql`
      update matches
      set status = ${this.snapshot.status},
          current_state = ${JSON.stringify(this.snapshot.state)}::jsonb,
          rematch_requested_by = ${this.snapshot.rematchRequestedBy || null},
          rematch_match_id = ${this.snapshot.rematchMatchId || null},
          rematch_rejected_by = ${this.snapshot.rematchRejectedBy || null},
          terminated_by = ${this.snapshot.terminatedBy || null},
          updated_at = now()
      where id = ${this.snapshot.id}
    `;
  }

  private async handleShot(sender: Party.Connection, actorPubkey: string, playerIndex: number, velX: number, velY: number) {
    if (!this.snapshot) return;

    if (this.snapshot.status !== 'active') {
      this.sendError(sender, `La partida está ${this.snapshot.status}.`);
      return;
    }

    const actingTeam = actorPubkey === this.snapshot.homePubkey ? 'home' : 'away';
    if (this.snapshot.state.turn !== actingTeam) {
      this.sendError(sender, 'No es tu turno.');
      return;
    }

    if (this.snapshot.state.phase !== 'aiming') {
      this.sendError(sender, 'La jugada todavía no está lista.');
      return;
    }

    if (this.snapshot.state.winner) {
      this.sendError(sender, 'La partida ya terminó.');
      return;
    }

    const shotId = crypto.randomUUID();
    const { finalState, shotAnimation } = simulateShotWithFrames(this.snapshot.state, playerIndex, velX, velY, shotId);

    this.snapshot.state = finalState;
    this.snapshot.latestShotAnimation = shotAnimation;
    this.snapshot.status = finalState.winner ? 'finished' : 'active';
    await this.persistSnapshot(this.snapshot.status);

    this.broadcast({
      type: 'shot.resolved',
      actingPubkey: actorPubkey,
      match: this.buildSnapshot(),
      shotAnimation,
    });

    // Shot animations are transient events, not durable match state.
    this.snapshot.latestShotAnimation = null;
  }

  private async handleTerminate(sender: Party.Connection, actorPubkey: string, terminatedBy: string) {
    if (!this.snapshot) return;

    if (actorPubkey !== terminatedBy || !isPlayer(this.snapshot, terminatedBy)) {
      this.sendError(sender, 'No podés terminar esta partida.');
      return;
    }

    this.snapshot.status = 'terminated';
    this.snapshot.terminatedBy = terminatedBy;
    await this.persistSnapshot('terminated');
    await this.sql`update challenges set state = ${'terminated'}, updated_at = now() where id = ${this.snapshot.challengeId}`;

    this.broadcast({
      type: 'control.resolved',
      action: 'terminate',
      actorPubkey: terminatedBy,
      match: { ...this.buildSnapshot(), latestShotAnimation: null },
    });
  }

  private async handleRematchRequest(sender: Party.Connection, actorPubkey: string, requesterPubkey: string) {
    if (!this.snapshot) return;

    if (this.snapshot.status !== 'finished') {
      this.sendError(sender, 'La partida todavía no terminó.');
      return;
    }

    if (actorPubkey !== requesterPubkey || !isPlayer(this.snapshot, requesterPubkey)) {
      this.sendError(sender, 'No podés pedir revancha.');
      return;
    }

    if (this.snapshot.rematchMatchId) {
      this.sendError(sender, 'La revancha ya fue creada.');
      return;
    }

    if (this.snapshot.rematchRequestedBy && this.snapshot.rematchRequestedBy !== requesterPubkey) {
      this.sendError(sender, 'El rival ya pidió revancha.');
      return;
    }

    this.snapshot.rematchRequestedBy = requesterPubkey;
    this.snapshot.rematchRejectedBy = null;
    await this.persistSnapshot();

    this.broadcast({
      type: 'control.resolved',
      action: 'rematch-request',
      actorPubkey: requesterPubkey,
      match: { ...this.buildSnapshot(), latestShotAnimation: null },
    });
  }

  private async handleRematchAccept(sender: Party.Connection, actorPubkey: string, accepterPubkey: string) {
    if (!this.snapshot) return;

    if (this.snapshot.status !== 'finished') {
      this.sendError(sender, 'La partida todavía no terminó.');
      return;
    }

    if (actorPubkey !== accepterPubkey || !isPlayer(this.snapshot, accepterPubkey)) {
      this.sendError(sender, 'No podés aceptar la revancha.');
      return;
    }

    if (!this.snapshot.rematchRequestedBy) {
      this.sendError(sender, 'Todavía no existe un pedido de revancha.');
      return;
    }

    if (this.snapshot.rematchRequestedBy === accepterPubkey) {
      this.sendError(sender, 'Quien pidió la revancha no puede autoaceptarla.');
      return;
    }

    if (!this.snapshot.rematchMatchId) {
      const challengeRows = await this.sql`
        select owner_pubkey, rival_pubkey, mode, amount_sats
        from challenges
        where id = ${this.snapshot.challengeId}
        limit 1
      ` as {
        owner_pubkey: string;
        rival_pubkey: string;
        mode: string;
        amount_sats: number;
      }[];

      const originalChallenge = challengeRows[0];
      const rematchChallengeId = `rematch-${this.snapshot.challengeId}-${Date.now()}`;
      const rematchAccessToken = Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) => b.toString(16).padStart(2, '0')).join('');
      const ownerPubkey = originalChallenge?.owner_pubkey || this.snapshot.homePubkey;
      const rivalPubkey = originalChallenge?.rival_pubkey || this.snapshot.awayPubkey;
      const challengeMode = originalChallenge?.mode || 'friendly';
      const amountSats = originalChallenge?.amount_sats || 0;
      const rematchId = `${this.snapshot.id}-rematch-${Date.now()}`;
      const initialState = createInitialMatchState(this.snapshot.homePubkey, this.snapshot.awayPubkey);

      let winnerPubkey: string | null = null;
      if (this.snapshot.state.winner === 'home') winnerPubkey = this.snapshot.homePubkey;
      if (this.snapshot.state.winner === 'away') winnerPubkey = this.snapshot.awayPubkey;

      await this.sql`
        insert into challenges (id, access_token, owner_pubkey, rival_pubkey, mode, state, amount_sats, expires_at)
        values (
          ${rematchChallengeId},
          ${rematchAccessToken},
          ${ownerPubkey},
          ${rivalPubkey},
          ${challengeMode},
          ${'in_match'},
          ${amountSats},
          now() + interval '24 hours'
        )
      `;

      await this.sql`
        insert into matches (id, challenge_id, mode, status, home_pubkey, away_pubkey, home_name, away_name, current_state)
        values (
          ${rematchId},
          ${rematchChallengeId},
          ${challengeMode},
          ${'active'},
          ${this.snapshot.homePubkey},
          ${this.snapshot.awayPubkey},
          ${this.snapshot.homeName || null},
          ${this.snapshot.awayName || null},
          ${JSON.stringify(initialState)}::jsonb
        )
      `;

      await this.sql`
        update challenges
        set state = ${'finalized'},
            winner_pubkey = ${winnerPubkey},
            score_home = ${this.snapshot.state.score.home},
            score_away = ${this.snapshot.state.score.away},
            updated_at = now()
        where id = ${this.snapshot.challengeId}
      `;

      this.snapshot.rematchMatchId = rematchId;
      this.snapshot.nextChallengeId = rematchChallengeId;
      this.snapshot.rematchRejectedBy = null;
    }

    await this.persistSnapshot();

    this.broadcast({
      type: 'control.resolved',
      action: 'rematch-accept',
      actorPubkey: accepterPubkey,
      match: { ...this.buildSnapshot(), latestShotAnimation: null },
    });

    if (this.snapshot) {
      this.snapshot.nextChallengeId = null;
    }
  }

  private async handleRematchReject(sender: Party.Connection, actorPubkey: string, rejecterPubkey: string) {
    if (!this.snapshot) return;

    if (this.snapshot.status !== 'finished') {
      this.sendError(sender, 'La partida todavía no terminó.');
      return;
    }

    if (actorPubkey !== rejecterPubkey || !isPlayer(this.snapshot, rejecterPubkey)) {
      this.sendError(sender, 'No podés rechazar la revancha.');
      return;
    }

    if (!this.snapshot.rematchRequestedBy) {
      this.sendError(sender, 'Todavía no existe un pedido de revancha.');
      return;
    }

    if (this.snapshot.rematchMatchId) {
      this.sendError(sender, 'La revancha ya fue creada.');
      return;
    }

    this.snapshot.rematchRequestedBy = null;
    this.snapshot.rematchRejectedBy = rejecterPubkey;
    await this.persistSnapshot();

    this.broadcast({
      type: 'control.resolved',
      action: 'rematch-reject',
      actorPubkey: rejecterPubkey,
      match: { ...this.buildSnapshot(), latestShotAnimation: null },
    });
  }
}
