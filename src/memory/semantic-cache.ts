/**
 * Semantic Cache — inspired by LixSearch/NomNom's Redis semantic cache.
 * Uses simple cosine similarity on word vectors (no external embedding model needed).
 * Sub-100ms cache hits for semantically similar queries.
 *
 * How it works:
 * 1. Convert query to bag-of-words vector
 * 2. Compare against cached query vectors using cosine similarity
 * 3. If similarity > 0.85, return cached result (instant)
 * 4. Store new results in cache after pipeline completes
 */

import { getDb } from '../db/connection.js';

const SIMILARITY_THRESHOLD = 0.85;
const MAX_CACHE_SIZE = 500;

interface CachedResult {
  query: string;
  result_json: string;
  created_at: string;
}

/**
 * Ensure cache table exists.
 */
export function initSemanticCache(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS semantic_cache (
      id INTEGER PRIMARY KEY,
      query TEXT NOT NULL,
      query_vector TEXT NOT NULL,
      result_json TEXT NOT NULL,
      depth TEXT NOT NULL,
      hit_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      last_hit TEXT DEFAULT (datetime('now'))
    )
  `);
}

/**
 * Convert a query string to a simple bag-of-words vector.
 * Each unique word gets a dimension, value = word count.
 */
function queryToVector(query: string): Map<string, number> {
  const words = query.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2);

  const vec = new Map<string, number>();
  for (const word of words) {
    vec.set(word, (vec.get(word) || 0) + 1);
  }
  return vec;
}

/**
 * Cosine similarity between two bag-of-words vectors.
 */
function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  // All unique keys
  const allKeys = new Set([...a.keys(), ...b.keys()]);

  for (const key of allKeys) {
    const va = a.get(key) || 0;
    const vb = b.get(key) || 0;
    dotProduct += va * vb;
    normA += va * va;
    normB += vb * vb;
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Check if a similar query exists in cache.
 * Returns the cached result if similarity > threshold.
 */
export function checkSemanticCache(query: string, depth: string): { hit: boolean; result?: any; similarity?: number } {
  initSemanticCache();
  const db = getDb();
  const queryVec = queryToVector(query);

  // Get recent cache entries (last 30 days, matching depth or deeper)
  const depthOrder = ['instant', 'quick', 'standard', 'deep', 'exhaustive'];
  const minDepthIdx = depthOrder.indexOf(depth);

  const entries = db.prepare(`
    SELECT id, query, query_vector, result_json, depth FROM semantic_cache
    WHERE created_at > datetime('now', '-30 days')
    ORDER BY last_hit DESC LIMIT ?
  `).all(MAX_CACHE_SIZE) as any[];

  let bestMatch: { id: number; similarity: number; result: any } | null = null;

  for (const entry of entries) {
    // Only use cache if stored depth >= requested depth
    const entryDepthIdx = depthOrder.indexOf(entry.depth);
    if (entryDepthIdx < minDepthIdx) continue;

    const entryVec: Map<string, number> = new Map(JSON.parse(entry.query_vector));
    const similarity = cosineSimilarity(queryVec, entryVec);

    if (similarity >= SIMILARITY_THRESHOLD && (!bestMatch || similarity > bestMatch.similarity)) {
      bestMatch = {
        id: entry.id,
        similarity,
        result: JSON.parse(entry.result_json),
      };
    }
  }

  if (bestMatch) {
    // Update hit count
    db.prepare('UPDATE semantic_cache SET hit_count = hit_count + 1, last_hit = datetime(?) WHERE id = ?')
      .run(new Date().toISOString(), bestMatch.id);

    return { hit: true, result: bestMatch.result, similarity: bestMatch.similarity };
  }

  return { hit: false };
}

/**
 * Store a result in the semantic cache.
 */
export function storeInSemanticCache(query: string, depth: string, result: any): void {
  initSemanticCache();
  const db = getDb();
  const queryVec = queryToVector(query);
  const vecJson = JSON.stringify([...queryVec.entries()]);

  // Evict oldest entries if cache is full
  const count = (db.prepare('SELECT COUNT(*) as c FROM semantic_cache').get() as any).c;
  if (count >= MAX_CACHE_SIZE) {
    db.prepare('DELETE FROM semantic_cache WHERE id IN (SELECT id FROM semantic_cache ORDER BY last_hit ASC LIMIT 50)').run();
  }

  db.prepare(`
    INSERT INTO semantic_cache (query, query_vector, result_json, depth)
    VALUES (?, ?, ?, ?)
  `).run(query, vecJson, JSON.stringify(result), depth);
}

/**
 * Get cache stats.
 */
export function getCacheStats(): { entries: number; total_hits: number; oldest_days: number } {
  initSemanticCache();
  const db = getDb();
  const stats = db.prepare(`
    SELECT COUNT(*) as entries,
           COALESCE(SUM(hit_count), 0) as total_hits,
           COALESCE(MAX(julianday('now') - julianday(created_at)), 0) as oldest_days
    FROM semantic_cache
  `).get() as any;

  return {
    entries: stats.entries || 0,
    total_hits: stats.total_hits || 0,
    oldest_days: Math.round(stats.oldest_days || 0),
  };
}
