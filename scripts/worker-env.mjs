import { readFileSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

export function getWorkerDevEnv() {
  let fileEnv = {};

  try {
    fileEnv = parseEnv(readFileSync('.env', 'utf8'));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  const neonUrl = process.env.NEON_URL || fileEnv.NEON_URL || '';
  writeFileSync('.dev.vars', `NEON_URL=${JSON.stringify(neonUrl)}\n`, { mode: 0o600 });

  const workerEnv = { ...process.env };
  delete workerEnv.CLOUDFLARE_ACCOUNT_ID;
  delete workerEnv.CLOUDFLARE_API_TOKEN;
  return workerEnv;
}
