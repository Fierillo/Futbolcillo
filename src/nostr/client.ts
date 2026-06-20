import NDK from '@nostr-dev-kit/ndk';

const defaultRelays = [
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://nos.lol',
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
