import type { VercelRequest, VercelResponse } from '@vercel/node';

export function requireMethod(req: VercelRequest, res: VercelResponse, method: string) {
  if (req.method === method) return true;

  res.setHeader('Allow', method);
  res.status(405).json({ ok: false, error: `Method ${req.method} not allowed` });
  return false;
}

export function getJsonBody<T>(req: VercelRequest): T {
  if (!req.body || typeof req.body !== 'object') {
    throw new Error('Invalid JSON body');
  }

  return req.body as T;
}
