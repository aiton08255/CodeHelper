-- GitNexus-like Code Graph
CREATE TABLE IF NOT EXISTS code_symbols (
  id INTEGER PRIMARY KEY,
  file_path TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- 'function', 'class', 'method', 'variable', 'import'
  start_line INTEGER,
  end_line INTEGER,
  content TEXT, -- Snippet of the symbol
  docstring TEXT,
  signature TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(file_path, name, type, start_line)
);

CREATE TABLE IF NOT EXISTS code_relationships (
  id INTEGER PRIMARY KEY,
  from_symbol_id INTEGER NOT NULL REFERENCES code_symbols(id) ON DELETE CASCADE,
  to_symbol_id INTEGER REFERENCES code_symbols(id) ON DELETE SET NULL,
  to_name TEXT, -- Fallback if symbol not indexed yet
  type TEXT NOT NULL, -- 'calls', 'references', 'extends', 'imports'
  file_path TEXT, -- Context of the relationship
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_symbols_file ON code_symbols(file_path);
CREATE INDEX IF NOT EXISTS idx_symbols_name ON code_symbols(name);
CREATE INDEX IF NOT EXISTS idx_rels_from ON code_relationships(from_symbol_id);
CREATE INDEX IF NOT EXISTS idx_rels_to ON code_relationships(to_symbol_id);
CREATE INDEX IF NOT EXISTS idx_rels_toname ON code_relationships(to_name);
