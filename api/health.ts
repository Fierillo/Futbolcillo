import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkDatabaseConnection } from './_lib/neon';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const database = await checkDatabaseConnection();

    res.status(200).json({
      ok: true,
      service: 'futbolcillo-api',
      database,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      service: 'futbolcillo-api',
      error: error instanceof Error ? error.message : 'Unknown Neon connection error',
    });
  }
}
