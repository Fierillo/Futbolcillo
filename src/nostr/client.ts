import NDK, { NDKEvent, NDKKind } from '@nostr-dev-kit/ndk';

const defaultRelays = [
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://nos.lol',
  'wss://relay.nostr.band',
  'wss://relay.snort.social',
];

let sharedClient: NDK | null = null;

export function getNostrClient() {
  if (!sharedClient) {
    sharedClient = new NDK({
      explicitRelayUrls: defaultRelays,
    });
  }

  return sharedClient;
}

export function getRelayList() {
  return [...defaultRelays];
}

type MatchNotificationType = 'rematch-request' | 'rematch-accept' | 'rematch-reject' | 'terminate';

export async function sendMatchNotification(
  recipientPubkey: string,
  type: MatchNotificationType,
  matchId: string,
  senderName: string,
) {
  const ndk = getNostrClient();
  await ndk.connect(1500);

  const messages: Record<MatchNotificationType, string> = {
    'rematch-request': `⚽ ${senderName} te pide revancha en Futbolcillo.`,
    'rematch-accept': `⚽ ${senderName} aceptó tu revancha en Futbolcillo.`,
    'rematch-reject': `⚽ ${senderName} no quiere jugar revancha.`,
    'terminate': `⚽ ${senderName} terminó la partida en Futbolcillo.`,
  };

  const payload = {
    type: 'futbolcillo_match_notification',
    version: 1,
    notificationType: type,
    matchId,
    message: messages[type],
  };

  const recipient = ndk.getUser({ pubkey: recipientPubkey });

  const event = new NDKEvent(ndk, {
    kind: NDKKind.EncryptedDirectMessage,
    content: messages[type],
    tags: [
      ['p', recipientPubkey],
      ['match_notification', JSON.stringify(payload)],
    ],
  });

  await event.encrypt(recipient, undefined, 'nip04');
  event.tags.push(['encryption', 'nip04']);

  await event.publish();
}
