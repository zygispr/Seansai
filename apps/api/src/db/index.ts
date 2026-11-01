import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createClient, type Client } from '@libsql/client';

/**
 * A libSQL client: Turso on Vercel (`libsql://…`), a SQLite file in Docker and development
 * (`file:…`), or `:memory:` in tests and fixture mode.
 *
 * `PRAGMA foreign_keys` is not set: Turso does not keep it across remote requests, so the
 * repository deletes dependent rows itself instead of relying on cascades.
 */
export type Db = Client;

/**
 * Migrations in order; the database's `user_version` records how many have run. Append new
 * migrations, never edit one that has shipped.
 */
const migrations: readonly string[] = [
  readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('./migration-002-movie-keys.sql', import.meta.url), 'utf8'),
];

/** How long a local write waits for another connection's lock before failing. */
const BUSY_TIMEOUT_MS = 5000;

/** Opens (creating if needed) the database at `url` and brings its schema up to date. */
export async function openDb(url: string, authToken: string | null = null): Promise<Db> {
  const isFile = url.startsWith('file:');
  if (isFile) mkdirSync(dirname(url.slice('file:'.length)), { recursive: true });
  // `timeout` is the busy timeout of every pooled connection; a PRAGMA would reach only one.
  const db = createClient({
    url,
    ...(authToken === null ? {} : { authToken }),
    timeout: BUSY_TIMEOUT_MS,
  });
  try {
    if (isFile) await db.execute('PRAGMA journal_mode = WAL');
    await migrate(db);
  } catch (error) {
    db.close();
    throw error;
  }
  return db;
}

/**
 * Applies each pending migration and its `user_version` in one batch, so it runs completely or
 * not at all.
 */
async function migrate(db: Db): Promise<void> {
  const applied = await userVersion(db);
  for (const [index, sql] of migrations.slice(applied).entries()) {
    const version = applied + index + 1;
    try {
      await db.batch(
        [...splitStatements(sql), `PRAGMA user_version = ${String(version)}`],
        'write',
      );
    } catch (error) {
      // Two new Vercel function instances can start against the same database at once; if the
      // other one applied this migration first, ours fails on the existing tables.
      if ((await userVersion(db)) >= version) continue;
      throw error;
    }
  }
}

async function userVersion(db: Db): Promise<number> {
  const { rows } = await db.execute('PRAGMA user_version');
  return Number(rows[0]?.user_version ?? 0);
}

/** Splits a migration into statements: whole-line `--` comments and empty statements dropped. */
export function splitStatements(sql: string): string[] {
  return sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement !== '');
}
