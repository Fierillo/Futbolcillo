import { nip04 } from 'nostr-tools';
import { decrypt as nip44Decrypt, encrypt as nip44Encrypt, getConversationKey } from 'nostr-tools/nip44';
import { createNostrConnectURI } from 'nostr-tools/nip46';
import { finalizeEvent, generateSecretKey, getPublicKey, type EventTemplate, type UnsignedEvent } from 'nostr-tools/pure';
import { SimplePool, type SubCloser } from 'nostr-tools/pool';

export type Nip46EncryptionVersion = 'nip44' | 'nip04';

const NOSTR_CONNECT_KIND = 24133;
const RPC_TIMEOUT_MS = 30_000;

type Listener = {
  resolve: (value: string) => void;
  reject: (error: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
};

export type PendingNostrConnectSession = {
  uri: string;
  relay: string;
  clientSecret: Uint8Array;
  secret: string;
  relays: string[];
};

type FromPendingOptions = {
  pending: PendingNostrConnectSession;
  timeoutMs: number;
  abortSignal?: AbortSignal;
  onAuthUrl?: (url: string) => void;
  onLog?: (step: string, details?: Record<string, unknown>) => void;
};

type FromStoredOptions = {
  clientSecret: Uint8Array;
  bunkerPubkey: string;
  relays: string[];
  secret?: string | null;
  encryption: Nip46EncryptionVersion;
  userPubkey: string;
  onAuthUrl?: (url: string) => void;
};

export function createPendingNostrConnectSession(relays: string[], name: string): PendingNostrConnectSession {
  const clientSecret = generateSecretKey();
  const clientPubkey = getPublicKey(clientSecret);
  const secret = Math.random().toString(36).slice(2, 14);
  const siteOrigin = typeof window !== 'undefined' ? window.location.origin : '';

  const uri = createNostrConnectURI({
    clientPubkey,
    relays,
    secret,
    name,
    url: siteOrigin,
    perms: ['get_public_key', 'sign_event', 'nip04_encrypt', 'nip04_decrypt', 'nip44_encrypt', 'nip44_decrypt'],
  });

  return { uri, relay: relays[0], clientSecret, secret, relays };
}

export class Nip46Client {
  encryptionVersion: Nip46EncryptionVersion = 'nip44';
  bunkerPubkey = '';
  relays: string[] = [];
  secret: string | null = null;
  userPubkey = '';

  private pool!: SimplePool;
  private subCloser?: SubCloser;
  private listeners: Record<string, Listener> = {};
  private serial = 0;
  private idPrefix = Math.random().toString(36).slice(2, 8);
  private isOpen = false;
  private cachedPubkey?: string;
  private clientSecret!: Uint8Array;
  private clientPubkey!: string;
  private onAuthUrl?: (url: string) => void;

  private constructor() {}

  static async fromPending(opts: FromPendingOptions): Promise<Nip46Client> {
    const client = new Nip46Client();
    client.clientSecret = opts.pending.clientSecret;
    client.clientPubkey = getPublicKey(opts.pending.clientSecret);
    client.relays = opts.pending.relays;
    client.secret = opts.pending.secret;
    client.pool = new SimplePool();
    client.onAuthUrl = opts.onAuthUrl;

    return new Promise<Nip46Client>((resolve, reject) => {
      let settled = false;
      let pendingSub: SubCloser | null = null;

      const cleanup = () => {
        try {
          pendingSub?.close();
        } catch {
          // noop
        }
      };

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error('__qr_timeout__'));
      }, opts.timeoutMs);

      opts.abortSignal?.addEventListener('abort', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        cleanup();
        reject(new Error('Cancelado por el usuario.'));
      });

      pendingSub = client.pool.subscribe(
        opts.pending.relays,
        {
          kinds: [NOSTR_CONNECT_KIND],
          '#p': [client.clientPubkey],
          limit: 0,
        },
        {
          onevent: async (event) => {
            if (settled) return;
            opts.onLog?.('qr-event', { pubkey: event.pubkey, kind: event.kind });

            let decoded: { plaintext: string; version: Nip46EncryptionVersion };
            try {
              decoded = await client.tryDecrypt(event.content, event.pubkey);
            } catch {
              opts.onLog?.('qr-event-decrypt-failed', { pubkey: event.pubkey });
              return;
            }

            let response: { id?: string; result?: string; error?: string };
            try {
              response = JSON.parse(decoded.plaintext) as { id?: string; result?: string; error?: string };
            } catch {
              opts.onLog?.('qr-event-invalid-json');
              return;
            }

            if (response.result === 'auth_url' && response.error) {
              client.onAuthUrl?.(response.error);
              opts.onLog?.('qr-auth-url', { url: response.error });
              return;
            }

            const accepted = response.result === opts.pending.secret || response.result === 'ack';
            if (!accepted) {
              opts.onLog?.('qr-event-unexpected-result', { result: response.result });
              return;
            }

            settled = true;
            clearTimeout(timer);
            cleanup();
            client.bunkerPubkey = event.pubkey;
            client.encryptionVersion = decoded.version;
            opts.onLog?.('qr-accepted', { bunkerPubkey: event.pubkey, encryption: decoded.version });

            try {
              await client.openSession();
              const userPubkey = await client.getPublicKey();
              client.userPubkey = userPubkey;
              resolve(client);
            } catch (error) {
              reject(error);
            }
          },
        },
      );
    });
  }

  static async fromStored(opts: FromStoredOptions): Promise<Nip46Client> {
    const client = new Nip46Client();
    client.clientSecret = opts.clientSecret;
    client.clientPubkey = getPublicKey(opts.clientSecret);
    client.bunkerPubkey = opts.bunkerPubkey;
    client.relays = opts.relays;
    client.secret = opts.secret ?? null;
    client.encryptionVersion = opts.encryption;
    client.userPubkey = opts.userPubkey;
    client.onAuthUrl = opts.onAuthUrl;
    client.pool = new SimplePool();
    await client.openSession();
    return client;
  }

  private async tryDecrypt(content: string, peerPubkey: string): Promise<{ plaintext: string; version: Nip46EncryptionVersion }> {
    try {
      return {
        plaintext: nip44Decrypt(content, getConversationKey(this.clientSecret, peerPubkey)),
        version: 'nip44',
      };
    } catch {
      // noop
    }

    return {
      plaintext: await nip04.decrypt(this.clientSecret, peerPubkey, content),
      version: 'nip04',
    };
  }

  private async encryptContent(plaintext: string): Promise<string> {
    if (this.encryptionVersion === 'nip44') {
      return nip44Encrypt(plaintext, getConversationKey(this.clientSecret, this.bunkerPubkey));
    }

    return nip04.encrypt(this.clientSecret, this.bunkerPubkey, plaintext);
  }

  private async openSession(): Promise<void> {
    if (this.isOpen) return;

    this.subCloser = this.pool.subscribe(
      this.relays,
      {
        kinds: [NOSTR_CONNECT_KIND],
        authors: [this.bunkerPubkey],
        '#p': [this.clientPubkey],
        limit: 0,
      },
      {
        onevent: async (event) => {
          let decoded: { plaintext: string; version: Nip46EncryptionVersion };
          try {
            decoded = await this.tryDecrypt(event.content, event.pubkey);
          } catch {
            return;
          }

          if (decoded.version !== this.encryptionVersion) {
            this.encryptionVersion = decoded.version;
          }

          let parsed: { id?: string; result?: string; error?: string };
          try {
            parsed = JSON.parse(decoded.plaintext) as { id?: string; result?: string; error?: string };
          } catch {
            return;
          }

          const { id, result, error } = parsed;
          if (result === 'auth_url' && error) {
            this.onAuthUrl?.(error);
            return;
          }

          if (!id) return;
          const handler = this.listeners[id];
          if (!handler) return;

          clearTimeout(handler.timer);
          delete this.listeners[id];
          if (error) handler.reject(new Error(error));
          else handler.resolve(result ?? '');
        },
        onclose: () => {
          this.subCloser = undefined;
          this.isOpen = false;
        },
      },
    );

    this.isOpen = true;
  }

  async connect(): Promise<void> {
    await this.openSession();
    await this.sendRequest('connect', [this.userPubkey, this.secret ?? '']);
  }

  async sendRequest(method: string, params: string[]): Promise<string> {
    if (!this.isOpen) await this.openSession();

    this.serial += 1;
    const id = `${this.idPrefix}-${this.serial}`;
    const encryptedContent = await this.encryptContent(JSON.stringify({ id, method, params }));
    const event = finalizeEvent(
      {
        kind: NOSTR_CONNECT_KIND,
        tags: [['p', this.bunkerPubkey]],
        content: encryptedContent,
        created_at: Math.floor(Date.now() / 1000),
      } as EventTemplate,
      this.clientSecret,
    );

    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        delete this.listeners[id];
        reject(new Error(`bunker did not reply to ${method} in time`));
      }, RPC_TIMEOUT_MS);

      this.listeners[id] = { resolve, reject, timer };
      Promise.race(this.pool.publish(this.relays, event)).catch((error: unknown) => {
        clearTimeout(timer);
        delete this.listeners[id];
        reject(error);
      });
    });
  }

  async getPublicKey(): Promise<string> {
    if (!this.cachedPubkey) {
      this.cachedPubkey = await this.sendRequest('get_public_key', []);
    }

    return this.cachedPubkey;
  }

  async signEvent(event: UnsignedEvent): Promise<ReturnType<typeof finalizeEvent>> {
    const response = await this.sendRequest('sign_event', [JSON.stringify(event)]);
    return JSON.parse(response) as ReturnType<typeof finalizeEvent>;
  }

  async nip04Encrypt(peer: string, plaintext: string): Promise<string> {
    return this.sendRequest('nip04_encrypt', [peer, plaintext]);
  }

  async nip04Decrypt(peer: string, ciphertext: string): Promise<string> {
    return this.sendRequest('nip04_decrypt', [peer, ciphertext]);
  }

  async nip44Encrypt(peer: string, plaintext: string): Promise<string> {
    return this.sendRequest('nip44_encrypt', [peer, plaintext]);
  }

  async nip44Decrypt(peer: string, ciphertext: string): Promise<string> {
    return this.sendRequest('nip44_decrypt', [peer, ciphertext]);
  }

  async close(): Promise<void> {
    this.isOpen = false;
    for (const id of Object.keys(this.listeners)) {
      clearTimeout(this.listeners[id].timer);
      this.listeners[id].reject(new Error('client closed'));
      delete this.listeners[id];
    }

    try {
      this.subCloser?.close();
    } catch {
      // noop
    }

    try {
      this.pool.close(this.relays);
    } catch {
      // noop
    }
  }
}
