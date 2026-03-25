/**
 * Benchmark Suite — tests Self-Evo quality against standard queries.
 * Measures: speed, claim count, source diversity, confidence, relevance.
 */

import { runPipeline, PipelineContext } from '../pipeline/orchestrator.js';
import { getDb } from '../db/connection.js';

export interface BenchmarkQuery {
  query: string;
  depth: 'instant' | 'quick' | 'standard' | 'deep';
  category: string;
  expected_min_claims: number;
  expected_min_confidence: number;
}

export interface BenchmarkResult {
  query: string;
  depth: string;
  category: string;
  status: 'pass' | 'fail' | 'error';
  duration_ms: number;
  claims: number;
  sources: number;
  confidence: number;
  issues: string[];
}

const BENCHMARK_QUERIES: BenchmarkQuery[] = [
  // Instant — simple facts
  { query: 'What is TypeScript', depth: 'instant', category: 'factual', expected_min_claims: 1, expected_min_confidence: 0.3 },
  { query: 'Who created Python', depth: 'instant', category: 'factual', expected_min_claims: 1, expected_min_confidence: 0.3 },

  // Quick — moderate
  { query: 'How does garbage collection work in Go', depth: 'quick', category: 'technical', expected_min_claims: 5, expected_min_confidence: 0.4 },
  { query: 'Best practices for REST API design', depth: 'quick', category: 'technical', expected_min_claims: 5, expected_min_confidence: 0.4 },

  // Standard — comparisons
  { query: 'Compare PostgreSQL vs MySQL for web applications', depth: 'standard', category: 'comparison', expected_min_claims: 15, expected_min_confidence: 0.45 },
  { query: 'React vs Vue vs Svelte performance 2025', depth: 'standard', category: 'comparison', expected_min_claims: 10, expected_min_confidence: 0.4 },

  // Deep — research
  { query: 'State of WebAssembly adoption in production systems 2025', depth: 'deep', category: 'research', expected_min_claims: 20, expected_min_confidence: 0.45 },
];

function noopEmit() {}

export async function runBenchmark(
  keys: Record<string, string>,
  options: { queries?: number; emit?: (msg: any) => void } = {}
): Promise<{
  results: BenchmarkResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    errors: number;
    avg_duration_ms: number;
    avg_claims: number;
    avg_confidence: number;
    score: number;
  };
}> {
  const queries = BENCHMARK_QUERIES.slice(0, options.queries || BENCHMARK_QUERIES.length);
  const emit = options.emit || noopEmit;
  const results: BenchmarkResult[] = [];

  for (const bq of queries) {
    emit({ type: 'benchmark-start', query: bq.query, depth: bq.depth });
    const start = Date.now();

    try {
      const ctx: PipelineContext = {
        query: bq.query,
        depth: bq.depth,
        emit: noopEmit,
        keys,
      };

      const report = await runPipeline(ctx);
      const duration = Date.now() - start;
      const issues: string[] = [];

      if ((report.claims?.length || 0) < bq.expected_min_claims) {
        issues.push(`Low claims: ${report.claims?.length || 0} < ${bq.expected_min_claims}`);
      }
      if ((report.overall_confidence || 0) < bq.expected_min_confidence) {
        issues.push(`Low confidence: ${((report.overall_confidence || 0) * 100).toFixed(0)}% < ${(bq.expected_min_confidence * 100).toFixed(0)}%`);
      }
      if ((report.sources?.length || 0) === 0 && bq.depth !== 'instant') {
        issues.push('No sources found');
      }

      results.push({
        query: bq.query,
        depth: bq.depth,
        category: bq.category,
        status: issues.length === 0 ? 'pass' : 'fail',
        duration_ms: duration,
        claims: report.claims?.length || 0,
        sources: report.sources?.length || 0,
        confidence: report.overall_confidence || 0,
        issues,
      });

      emit({ type: 'benchmark-done', query: bq.query, status: issues.length === 0 ? 'pass' : 'fail', duration_ms: duration });
    } catch (err) {
      results.push({
        query: bq.query,
        depth: bq.depth,
        category: bq.category,
        status: 'error',
        duration_ms: Date.now() - start,
        claims: 0,
        sources: 0,
        confidence: 0,
        issues: [(err as Error).message],
      });

      emit({ type: 'benchmark-done', query: bq.query, status: 'error', duration_ms: Date.now() - start });
    }
  }

  // Summary
  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const errors = results.filter(r => r.status === 'error').length;
  const completed = results.filter(r => r.status !== 'error');

  // Store benchmark run
  const db = getDb();
  db.exec(`CREATE TABLE IF NOT EXISTS benchmark_runs (
    id INTEGER PRIMARY KEY,
    timestamp TEXT DEFAULT (datetime('now')),
    total INTEGER, passed INTEGER, failed INTEGER, errors INTEGER,
    avg_duration_ms REAL, avg_claims REAL, avg_confidence REAL, score REAL,
    results_json TEXT
  )`);

  const score = results.length > 0 ? (passed / results.length) * 100 : 0;
  const avgDuration = completed.length > 0 ? completed.reduce((s, r) => s + r.duration_ms, 0) / completed.length : 0;
  const avgClaims = completed.length > 0 ? completed.reduce((s, r) => s + r.claims, 0) / completed.length : 0;
  const avgConf = completed.length > 0 ? completed.reduce((s, r) => s + r.confidence, 0) / completed.length : 0;

  db.prepare(`INSERT INTO benchmark_runs (total, passed, failed, errors, avg_duration_ms, avg_claims, avg_confidence, score, results_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    results.length, passed, failed, errors, avgDuration, avgClaims, avgConf, score, JSON.stringify(results)
  );

  return {
    results,
    summary: {
      total: results.length,
      passed,
      failed,
      errors,
      avg_duration_ms: Math.round(avgDuration),
      avg_claims: Math.round(avgClaims * 10) / 10,
      avg_confidence: Math.round(avgConf * 100) / 100,
      score: Math.round(score * 10) / 10,
    },
  };
}

/**
 * Get historical benchmark results.
 */
export function getBenchmarkHistory(limit: number = 10) {
  const db = getDb();
  db.exec(`CREATE TABLE IF NOT EXISTS benchmark_runs (
    id INTEGER PRIMARY KEY,
    timestamp TEXT DEFAULT (datetime('now')),
    total INTEGER, passed INTEGER, failed INTEGER, errors INTEGER,
    avg_duration_ms REAL, avg_claims REAL, avg_confidence REAL, score REAL,
    results_json TEXT
  )`);

  return db.prepare('SELECT * FROM benchmark_runs ORDER BY timestamp DESC LIMIT ?').all(limit);
}
