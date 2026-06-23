export type SqlPrimitive = string | number | boolean | null;

type NeonClient = Awaited<ReturnType<typeof createSqlClient>>;

let sqlClientPromise: Promise<NeonClient> | null = null;

async function createSqlClient() {
  const neonUrl = process.env.NEON_URL;
  if (!neonUrl) {
    throw new Error('NEON_URL environment variable is not configured');
  }

  const { neon } = await import('@neondatabase/serverless');
  return neon(neonUrl);
}

export async function getSql() {
  if (!sqlClientPromise) {
    sqlClientPromise = createSqlClient();
  }

  return sqlClientPromise;
}

export async function query<T extends Record<string, SqlPrimitive> = Record<string, SqlPrimitive>>(
  strings: TemplateStringsArray,
  ...values: SqlPrimitive[]
) {
  const sql = await getSql();
  return (await sql<T>(strings, ...values)) as T[];
}

export async function checkDatabaseConnection() {
  const rows = await query<{ now: string }>`select now()::text as now`;
  return rows[0] ?? null;
}
