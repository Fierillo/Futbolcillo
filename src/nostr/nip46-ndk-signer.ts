import type NDK from '@nostr-dev-kit/ndk';
import type { NDKEncryptionScheme, NDKSigner, NDKUser, NostrEvent } from '@nostr-dev-kit/ndk';
import { createPendingNostrConnectSession, Nip46Client, type Nip46EncryptionVersion, type PendingNostrConnectSession } from './nip46-client';

type PersistedNip46Payload = {
  type: 'nostr-tools-nip46';
  clientSecret: number[];
  bunkerPubkey: string;
  userPubkey: string;
  relays: string[];
  secret: string | null;
  encryption: Nip46EncryptionVersion;
};

export class Nip46NdkSigner implements NDKSigner {
  private connectPromise: Promise<void> | null = null;

  constructor(
    private readonly ndk: NDK,
    private readonly client: Nip46Client,
    private readonly clientSecret: Uint8Array,
    private userRef?: NDKUser,
  ) {}

  static createPending(relays: string[], appName: string): PendingNostrConnectSession {
    return createPendingNostrConnectSession(relays, appName);
  }

  static async fromPending(
    ndk: NDK,
    pending: PendingNostrConnectSession,
    timeoutMs: number,
    abortSignal?: AbortSignal,
    onLog?: (step: string, details?: Record<string, unknown>) => void,
  ): Promise<Nip46NdkSigner> {
    const client = await Nip46Client.fromPending({ pending, timeoutMs, abortSignal, onLog });
    const user = ndk.getUser({ pubkey: client.userPubkey });
    return new Nip46NdkSigner(ndk, client, pending.clientSecret, user);
  }

  static async fromPayload(payload: string, ndk: NDK): Promise<Nip46NdkSigner> {
    const parsed = JSON.parse(payload) as PersistedNip46Payload;
    if (parsed.type !== 'nostr-tools-nip46') {
      throw new Error('Unsupported NIP-46 payload type.');
    }

    const clientSecret = Uint8Array.from(parsed.clientSecret);
    const client = await Nip46Client.fromStored({
      clientSecret,
      bunkerPubkey: parsed.bunkerPubkey,
      relays: parsed.relays,
      secret: parsed.secret,
      encryption: parsed.encryption,
      userPubkey: parsed.userPubkey,
    });
    const user = ndk.getUser({ pubkey: parsed.userPubkey });
    return new Nip46NdkSigner(ndk, client, clientSecret, user);
  }

  get pubkey(): string {
    if (!this.userRef) {
      throw new Error('Not ready');
    }

    return this.userRef.pubkey;
  }

  get userSync(): NDKUser {
    if (!this.userRef) {
      throw new Error('Not ready');
    }

    return this.userRef;
  }

  async blockUntilReady(): Promise<NDKUser> {
    if (this.userRef) return this.userRef;
    const pubkey = await this.client.getPublicKey();
    this.userRef = this.ndk.getUser({ pubkey });
    return this.userRef;
  }

  async user(): Promise<NDKUser> {
    return this.blockUntilReady();
  }

  private async ensureConnected(): Promise<void> {
    if (!this.connectPromise) {
      this.connectPromise = Promise.race([
        this.client.connect().catch(() => undefined),
        new Promise<void>((resolve) => setTimeout(resolve, 5000)),
      ]).then(() => undefined);
    }

    await this.connectPromise;
  }

  async sign(event: NostrEvent): Promise<string> {
    await this.ensureConnected();
    const signed = await this.client.signEvent(event as unknown as Parameters<Nip46Client['signEvent']>[0]);
    if (!this.userRef) {
      this.userRef = this.ndk.getUser({ pubkey: signed.pubkey });
    }
    return signed.sig;
  }

  async encryptionEnabled(scheme?: NDKEncryptionScheme): Promise<NDKEncryptionScheme[]> {
    const enabled: NDKEncryptionScheme[] = [];
    if (!scheme || scheme === 'nip04') enabled.push('nip04');
    if (!scheme || scheme === 'nip44') enabled.push('nip44');
    return enabled;
  }

  async encrypt(recipient: NDKUser, value: string, scheme?: NDKEncryptionScheme): Promise<string> {
    await this.ensureConnected();
    if (scheme === 'nip44') {
      return this.client.nip44Encrypt(recipient.pubkey, value);
    }
    return this.client.nip04Encrypt(recipient.pubkey, value);
  }

  async decrypt(sender: NDKUser, value: string, scheme?: NDKEncryptionScheme): Promise<string> {
    await this.ensureConnected();
    if (scheme === 'nip44') {
      return this.client.nip44Decrypt(sender.pubkey, value);
    }
    return this.client.nip04Decrypt(sender.pubkey, value);
  }

  async close(): Promise<void> {
    await this.client.close();
  }

  toPayload(): string {
    if (!this.userRef) {
      throw new Error('Cannot serialize signer before user is ready.');
    }

    const payload: PersistedNip46Payload = {
      type: 'nostr-tools-nip46',
      clientSecret: Array.from(this.clientSecret),
      bunkerPubkey: this.client.bunkerPubkey,
      userPubkey: this.userRef.pubkey,
      relays: this.client.relays,
      secret: this.client.secret,
      encryption: this.client.encryptionVersion,
    };

    return JSON.stringify(payload);
  }
}
