export function getPublicAppUrl() {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }

  const configuredUrl = import.meta.env.VITE_PUBLIC_APP_URL?.trim();
  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, '');
  }

  return 'https://futbolcillo.app';
}
