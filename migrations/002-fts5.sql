-- Add FTS5 full-text search index on claims
CREATE VIRTUAL TABLE IF NOT EXISTS claims_fts USING fts5(claim_text, content=claims, content_rowid=id);

-- Triggers to keep FTS5 in sync with claims table
CREATE TRIGGER IF NOT EXISTS claims_ai AFTER INSERT ON claims BEGIN
  INSERT INTO claims_fts(rowid, claim_text) VALUES (new.id, new.claim_text);
END;

CREATE TRIGGER IF NOT EXISTS claims_ad AFTER DELETE ON claims BEGIN
  INSERT INTO claims_fts(claims_fts, rowid, claim_text) VALUES('delete', old.id, old.claim_text);
END;

CREATE TRIGGER IF NOT EXISTS claims_au AFTER UPDATE ON claims BEGIN
  INSERT INTO claims_fts(claims_fts, rowid, claim_text) VALUES('delete', old.id, old.claim_text);
  INSERT INTO claims_fts(rowid, claim_text) VALUES (new.id, new.claim_text);
END;
