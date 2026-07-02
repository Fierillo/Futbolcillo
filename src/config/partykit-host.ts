export function getPartyKitHost() {
  const configuredHost = import.meta.env.VITE_PARTYKIT_HOST?.trim();
  if (configuredHost) {
    return configuredHost.replace(/^https?:\/\//, '').replace(/\/$/, '');
  }

  if (typeof window !== 'undefined') {
    return `${window.location.hostname}:1999`;
  }

  return '';
}
