import { getDb } from '../db/connection.js';

export function upsertSource(source: {
  url: string;
  domain: string;
  quality_score: number;
  content_type?: string;
  is_primary?: boolean;
}): number {
  const db = getDb();
  const existing = db.prepare('SELECT id, times_cited FROM sources WHERE url = ?').get(source.url) as any;

  if (existing) {
    db.prepare(`
      UPDATE sources SET
        quality_score = (quality_score * times_cited + ?) / (times_cited + 1),
        times_cited = times_cited + 1,
        last_accessed = datetime('now')
      WHERE id = ?
    `).run(source.quality_score, existing.id);
    return existing.id;
  }

  const result = db.prepare(`
    INSERT INTO sources (url, domain, quality_score, content_type, is_primary, last_accessed)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `).run(source.url, source.domain, source.quality_score, source.content_type || null, source.is_primary ? 1 : 0);

  return result.lastInsertRowid as number;
}

export function getSourceByUrl(url: string) {
  const db = getDb();
  return db.prepare('SELECT * FROM sources WHERE url = ?').get(url);
}

export function getTopSources(limit: number = 20) {
  const db = getDb();
  return db.prepare('SELECT * FROM sources ORDER BY quality_score DESC, times_cited DESC LIMIT ?').all(limit);
}

export function getDomainReputation(domain: string): number {
  const db = getDb();
  const row = db.prepare(
    'SELECT AVG(quality_score) as avg_quality FROM sources WHERE domain = ?'
  ).get(domain) as any;
  return row?.avg_quality || 0.5;
}
