import { neon } from '@neondatabase/serverless';

export type SqlPrimitive = string | number | boolean | null;

let sqlClient: ReturnType<typeof neon> | null = null;

export function getSql() {
  if (sqlClient) return sqlClient;

  const neonUrl = process.env.NEON_URL;
  if (!neonUrl) {
    throw new Error('NEON_URL environment variable is not configured');
  }

  sqlClient = neon(neonUrl);
  return sqlClient;
}

export async function query<T extends Record<string, SqlPrimitive> = Record<string, SqlPrimitive>>(
  strings: TemplateStringsArray,
  ...values: SqlPrimitive[]
) {
  const sql = getSql();
  return (await sql<T>(strings, ...values)) as T[];
}

export async function checkDatabaseConnection() {
  const rows = await query<{ now: string }>`select now()::text as now`;
  return rows[0] ?? null;
}
