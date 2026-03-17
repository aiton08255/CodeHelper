import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import Database from 'better-sqlite3';

export function runMigrations(db: Database.Database, migrationsDir: string): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  const current = db.prepare('SELECT MAX(version) as v FROM schema_version').get() as any;
  const currentVersion = current?.v || 0;

  const files = readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const version = parseInt(file.split('-')[0], 10);
    if (version <= currentVersion) continue;

    const sql = readFileSync(join(migrationsDir, file), 'utf-8');
    db.exec(sql);
    db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(version);
  }
}
