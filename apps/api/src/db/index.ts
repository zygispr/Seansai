import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';

export type Db = Database.Database;

/**
 * Migrations in order; the database's `user_version` records how many have run. Append new
 * migrations, never edit one that has shipped.
 */
const migrations: readonly string[] = [
  readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'),
];

/** Opens (creating if needed) the SQLite database and brings its schema up to date. */
export function openDb(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  // The scheduler writes while requests read; wait briefly instead of failing on a busy lock.
  db.pragma('busy_timeout = 5000');
  migrate(db);
  return db;
}

function migrate(db: Db): void {
  const applied = db.pragma('user_version', { simple: true }) as number;
  migrations.slice(applied).forEach((sql, index) => {
    db.transaction(() => {
      db.exec(sql);
      db.pragma(`user_version = ${String(applied + index + 1)}`);
    })();
  });
}
