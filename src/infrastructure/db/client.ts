import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { serverEnv } from '@/lib/env';
import * as schema from './schema';

/**
 * The database handle.
 *
 * Serverless functions are short-lived and numerous, so the pool is deliberately
 * tiny — a handful of instances each holding ten connections is how a free-tier
 * Postgres runs out of slots. Neon's pooled endpoint (and Supabase's pgBouncer
 * port) does the real pooling upstream; this side just needs one connection per
 * invocation.
 *
 * In development the client is cached on `globalThis` so Fast Refresh does not
 * open a new pool on every file save.
 */

declare global {
  var __feelyricsDb: ReturnType<typeof createClient> | undefined;
}

function createClient() {
  const env = serverEnv();

  const sql = postgres(env.DATABASE_URL, {
    max: env.NODE_ENV === 'production' ? 1 : 5,
    idle_timeout: 20,
    connect_timeout: 15,
    // `prepare: false` is required by transaction-mode poolers such as
    // pgBouncer, which Supabase uses on port 6543 and Neon uses for its pooled
    // endpoint. Named prepared statements do not survive a connection that is
    // handed to a different client between statements.
    prepare: false,
  });

  return drizzle(sql, { schema, casing: 'snake_case' });
}

export type Database = ReturnType<typeof createClient>;

export function getDb(): Database {
  if (process.env.NODE_ENV === 'production') {
    globalThis.__feelyricsDb ??= createClient();
    return globalThis.__feelyricsDb;
  }

  globalThis.__feelyricsDb ??= createClient();
  return globalThis.__feelyricsDb;
}
