import { getDb } from '../db/connection.js';

export interface ClaimRow {
  id: number;
  claim_text: string;
  confidence: number;
  claim_type: string;
  date_found: string;
  source_url?: string;
  source_quality?: number;
  tags: string[];
}

export function insertClaim(claim: {
  claim_text: string;
  source_id: number | null;
  confidence: number;
  claim_type: string;
  date_found: string;
  query_id: number | null;
  tags: string[];
}): number {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO claims (claim_text, source_id, confidence, claim_type, date_found, query_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(claim.claim_text, claim.source_id, claim.confidence, claim.claim_type, claim.date_found, claim.query_id);

  const claimId = result.lastInsertRowid as number;

  const tagStmt = db.prepare('INSERT OR IGNORE INTO claim_tags (claim_id, tag) VALUES (?, ?)');
  for (const tag of claim.tags) {
    tagStmt.run(claimId, tag.toLowerCase().trim());
  }

  return claimId;
}

export function searchClaimsByTags(tags: string[]): ClaimRow[] {
  const db = getDb();
  const placeholders = tags.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT DISTINCT c.id, c.claim_text, c.confidence, c.claim_type, c.date_found,
           s.url as source_url, s.quality_score as source_quality
    FROM claims c
    LEFT JOIN sources s ON c.source_id = s.id
    INNER JOIN claim_tags ct ON c.id = ct.claim_id
    WHERE ct.tag IN (${placeholders})
      AND c.confidence > 0.7
      AND julianday('now') - julianday(c.date_found) < 30
    ORDER BY c.confidence DESC
  `).all(...tags.map(t => t.toLowerCase().trim())) as any[];

  return rows.map(r => ({
    ...r,
    tags: getTagsForClaim(r.id),
  }));
}

export function searchClaimsFTS(query: string): ClaimRow[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT c.id, c.claim_text, c.confidence, c.claim_type, c.date_found,
           s.url as source_url, s.quality_score as source_quality
    FROM claims c
    LEFT JOIN sources s ON c.source_id = s.id
    WHERE c.id IN (SELECT rowid FROM claims_fts WHERE claims_fts MATCH ?)
    ORDER BY c.confidence DESC
    LIMIT 50
  `).all(query) as any[];

  return rows.map(r => ({
    ...r,
    tags: getTagsForClaim(r.id),
  }));
}

function getTagsForClaim(claimId: number): string[] {
  const db = getDb();
  return (db.prepare('SELECT tag FROM claim_tags WHERE claim_id = ?').all(claimId) as any[])
    .map(r => r.tag);
}

export function deleteClaim(id: number): void {
  const db = getDb();
  db.prepare('DELETE FROM claims WHERE id = ?').run(id);
}
