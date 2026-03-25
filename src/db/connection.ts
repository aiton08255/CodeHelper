import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config.js';
import { runMigrations } from './migrations.js';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  db = new Database(config.dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  runMigrations(db, join(projectRoot, 'migrations'));

  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
