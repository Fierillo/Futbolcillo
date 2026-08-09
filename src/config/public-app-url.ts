export function getPublicAppUrl() {
  const configuredUrl = import.meta.env.VITE_PUBLIC_APP_URL?.trim();
  if (import.meta.env.PROD && configuredUrl) {
    return configuredUrl.replace(/\/$/, '');
  }

  if (typeof window !== 'undefined') {
    return window.location.origin;
  }

  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, '');
  }

  return 'https://futbolcillo.app';
}
