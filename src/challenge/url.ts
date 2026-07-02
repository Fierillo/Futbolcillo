import { getPublicAppUrl } from '../config/public-app-url';

export function buildChallengeUrl(challengeId: string, accessToken: string, ownerPubkey: string) {
  const url = new URL(getPublicAppUrl());
  url.searchParams.set('challenge', challengeId);
  url.searchParams.set('token', accessToken);
  url.searchParams.set('owner', ownerPubkey);
  return url.toString();
}
