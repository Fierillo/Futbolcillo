import { neon } from '@neondatabase/serverless';

type QueryEnv = {
  NEON_URL?: string;
};

export function getSql(env: QueryEnv) {
  const neonUrl = env.NEON_URL;
  if (!neonUrl) {
    throw new Error('NEON_URL environment variable is not configured for PartyKit');
  }

  return neon(neonUrl);
}
