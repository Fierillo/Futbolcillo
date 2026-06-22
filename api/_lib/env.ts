const requiredEnvKeys = ['NEON_URL'] as const;

type RequiredEnvKey = (typeof requiredEnvKeys)[number];

export function getRequiredEnv(key: RequiredEnvKey) {
  const value = process.env[key];

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}

export function getNeonUrl() {
  return getRequiredEnv('NEON_URL');
}
