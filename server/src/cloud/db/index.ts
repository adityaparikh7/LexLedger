import path from 'path';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';
import { MIGRATIONS_DIR, REPO_ROOT } from '../paths';

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;
/** A transaction handle; it has the same query API as DB. */
export type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];

let instance: DB | null = null;
let close: (() => Promise<void>) | null = null;

/** The connected database. connectDatabase() must have run first (it does, in index.ts). */
export function getDb(): DB {
  if (!instance) throw new Error('Database is not connected');
  return instance;
}

/** Connect and apply pending migrations.
 *  DATABASE_URL is a postgres:// URL in production. For local development without a Postgres
 *  server it can be `pglite:<dir>` (or `pglite:memory`), an embedded Postgres; that is the
 *  default outside production. */
export async function connectDatabase(): Promise<void> {
  let url = process.env.DATABASE_URL;
  if (!url) {
    if (process.env.NODE_ENV === 'production') throw new Error('DATABASE_URL is required in production');
    url = `pglite:${path.join(REPO_ROOT, 'data', 'pglite')}`;
  }

  if (url.startsWith('pglite:')) {
    const { PGlite } = await import('@electric-sql/pglite');
    const { drizzle } = await import('drizzle-orm/pglite');
    const { migrate } = await import('drizzle-orm/pglite/migrator');
    const dir = url.slice('pglite:'.length);
    const client = new PGlite(dir === 'memory' ? undefined : dir);
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
    instance = db as unknown as DB;
    close = () => client.close();
    console.log(`Database: embedded PGlite (${dir})`);
  } else {
    const { Pool } = await import('pg');
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    // DATABASE_CA_CERT (PEM) verifies a host whose certificate comes from its own CA, as
    // Supabase's does. TLS settings in the URL would override it, so they're dropped then.
    const ca = process.env.DATABASE_CA_CERT;
    const pool = new Pool({
      connectionString: ca ? withoutTlsParams(url) : url,
      ssl: ca ? { ca } : undefined,
      max: Number(process.env.DB_POOL_SIZE) || 10,
    });
    const db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
    instance = db as unknown as DB;
    close = () => pool.end();
    console.log('Database: Postgres');
  }
}

function withoutTlsParams(url: string): string {
  const parsed = new URL(url);
  for (const key of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'uselibpqcompat']) parsed.searchParams.delete(key);
  return parsed.toString();
}

export async function closeDatabase(): Promise<void> {
  await close?.();
  instance = null;
  close = null;
}

export { schema };
