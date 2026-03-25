-- Self-Evo: Initial schema
-- NOTE: PRAGMA foreign_keys is set in connection.ts, not here

CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY,
  url TEXT UNIQUE NOT NULL,
  domain TEXT NOT NULL,
  quality_score REAL NOT NULL CHECK(quality_score >= 0.0 AND quality_score <= 1.0),
  content_type TEXT,
  last_accessed TEXT NOT NULL,
  times_cited INTEGER DEFAULT 1,
  is_primary BOOLEAN DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sources_domain ON sources(domain);
CREATE INDEX IF NOT EXISTS idx_sources_url ON sources(url);

CREATE TABLE IF NOT EXISTS query_log (
  id INTEGER PRIMARY KEY,
  query_text TEXT NOT NULL,
  depth_level TEXT NOT NULL,
  total_searches INTEGER,
  stages_completed TEXT,
  satisfaction_score REAL,
  latency_ms INTEGER,
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS claims (
  id INTEGER PRIMARY KEY,
  claim_text TEXT NOT NULL,
  source_id INTEGER REFERENCES sources(id) ON DELETE SET NULL,
  confidence REAL NOT NULL CHECK(confidence >= 0.0 AND confidence <= 0.95),
  claim_type TEXT NOT NULL,
  date_found TEXT NOT NULL,
  query_id INTEGER REFERENCES query_log(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_claims_date ON claims(date_found);

CREATE TABLE IF NOT EXISTS claim_tags (
  claim_id INTEGER REFERENCES claims(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY (claim_id, tag)
);
CREATE INDEX IF NOT EXISTS idx_claim_tags_tag ON claim_tags(tag);

CREATE TABLE IF NOT EXISTS query_providers (
  query_id INTEGER REFERENCES query_log(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  calls_made INTEGER DEFAULT 1,
  PRIMARY KEY (query_id, provider)
);

CREATE TABLE IF NOT EXISTS provider_perf (
  id INTEGER PRIMARY KEY,
  provider TEXT NOT NULL,
  query_type TEXT NOT NULL,
  success_rate REAL,
  avg_quality REAL,
  avg_latency_ms INTEGER,
  sample_count INTEGER,
  last_updated TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(provider, query_type)
);

CREATE TABLE IF NOT EXISTS quota_usage (
  id INTEGER PRIMARY KEY,
  provider TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_type TEXT NOT NULL,
  calls_used INTEGER DEFAULT 0,
  tokens_used INTEGER DEFAULT 0,
  call_limit INTEGER NOT NULL,
  token_limit INTEGER,
  UNIQUE(provider, period_start)
);

CREATE TABLE IF NOT EXISTS evolution_log (
  id INTEGER PRIMARY KEY,
  change_type TEXT NOT NULL,
  tier TEXT NOT NULL,
  parameter TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  reason TEXT,
  approved_by TEXT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reasoning_traces (
  id INTEGER PRIMARY KEY,
  query_id INTEGER REFERENCES query_log(id) ON DELETE CASCADE,
  outline TEXT NOT NULL,
  confidence_overall REAL,
  narrative_type TEXT,
  pipeline_metadata TEXT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);
