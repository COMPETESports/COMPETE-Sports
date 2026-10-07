import postgres from 'postgres';

/**
 * One pooled Postgres client per server process.
 *
 * `prepare: false` is required when talking to Supabase through the
 * transaction pooler (port 6543), which does not support prepared
 * statements. Next dev-mode hot reloads would otherwise open a new pool
 * on every edit, so the client is cached on globalThis.
 */

declare global {
  // eslint-disable-next-line no-var
  var __competeSql: postgres.Sql | undefined;
}

function create(): postgres.Sql {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env and paste your ' +
        'Supabase connection string into it.',
    );
  }
  return postgres(url, {
    prepare: false,
    max: Number(process.env.DB_POOL_MAX ?? 8),
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {},
  });
}

export const sql: postgres.Sql =
  globalThis.__competeSql ?? (globalThis.__competeSql = create());
