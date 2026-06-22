import { neon } from '@neondatabase/serverless';
import { getNeonUrl } from './env';

export type SqlPrimitive = string | number | boolean | null;

let sqlClient: ReturnType<typeof neon> | null = null;

export function getSql() {
  if (!sqlClient) {
    sqlClient = neon(getNeonUrl());
  }

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
