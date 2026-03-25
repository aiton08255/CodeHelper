/**
 * Performance Analyzer — tracks pipeline metrics and auto-tunes.
 * Runs after each research to learn what works.
 */

import { getDb } from '../db/connection.js';
import { updateRoutingWeight, updateSourceReputation } from './params.js';
import { logEvolution } from './changelog.js';

interface PipelineMetrics {
  query: string;
  depth: string;
  duration_ms: number;
  claim_count: number;
  source_count: number;
  overall_confidence: number;
  sources: { url: string; quality: number }[];
}

/**
 * Analyze completed research and apply learnings.
 * Called automatically after each pipeline run.
 */
export function analyzeAndLearn(metrics: PipelineMetrics): void {
  const db = getDb();

  // 1. Track success/failure rate by depth
  trackDepthPerformance(db, metrics);

  // 2. Learn source reputation from results
  learnSourceReputation(metrics);

  // 3. Detect patterns (slow queries, empty results)
  detectPatterns(db, metrics);
}

function trackDepthPerformance(db: ReturnType<typeof getDb>, metrics: PipelineMetrics): void {
  // Get recent performance for this depth level
  const recent = db.prepare(`
    SELECT AVG(latency_ms) as avg_latency, AVG(satisfaction_score) as avg_confidence,
           COUNT(*) as total, SUM(CASE WHEN satisfaction_score > 0.5 THEN 1 ELSE 0 END) as good
    FROM query_log WHERE depth_level = ? AND timestamp > datetime('now', '-7 days')
  `).get(metrics.depth) as any;

  if (!recent || recent.total < 3) return;

  const successRate = (recent.good || 0) / (recent.total || 1);

  // If success rate drops below 60%, log a warning
  if (successRate < 0.6 && recent.total >= 5) {
    logEvolution({
      change_type: 'performance_alert',
      tier: 'notify',
      parameter: `depth:${metrics.depth}`,
      old_value: `${(successRate * 100).toFixed(0)}% success`,
      new_value: 'below threshold',
      reason: `Only ${recent.good}/${recent.total} queries succeeded in last 7 days`,
    });
  }
}

function learnSourceReputation(metrics: PipelineMetrics): void {
  if (metrics.overall_confidence < 0.3) return; // Don't learn from bad results

  for (const source of metrics.sources) {
    try {
      const domain = new URL(source.url).hostname;

      // Good results → boost reputation; bad → decrease
      if (metrics.overall_confidence > 0.7 && source.quality > 0.6) {
        updateSourceReputation(domain, Math.min(0.7, 0.5 + source.quality * 0.2));
      } else if (metrics.overall_confidence < 0.4) {
        updateSourceReputation(domain, Math.max(0.3, 0.5 - 0.1));
      }
    } catch {}
  }
}

function detectPatterns(db: ReturnType<typeof getDb>, metrics: PipelineMetrics): void {
  // Pattern: consistently slow queries → suggest faster tier
  if (metrics.duration_ms > 30_000 && metrics.depth === 'quick') {
    logEvolution({
      change_type: 'performance_note',
      tier: 'silent',
      parameter: 'speed',
      old_value: `${metrics.duration_ms}ms`,
      new_value: 'slow for quick tier',
      reason: `Query "${metrics.query.slice(0, 50)}" took ${(metrics.duration_ms / 1000).toFixed(1)}s on quick`,
    });
  }

  // Pattern: zero claims → search provider may be failing
  if (metrics.claim_count === 0 && metrics.depth !== 'instant') {
    logEvolution({
      change_type: 'search_failure',
      tier: 'notify',
      parameter: 'claims',
      old_value: '0 claims',
      new_value: 'empty result',
      reason: `No claims extracted for "${metrics.query.slice(0, 80)}"`,
    });
  }
}

/**
 * Get performance summary for the dashboard.
 */
export function getPerformanceSummary(): {
  total_queries: number;
  success_rate: number;
  avg_latency_ms: number;
  avg_confidence: number;
  by_depth: Record<string, { count: number; avg_confidence: number; avg_latency: number }>;
  top_sources: { domain: string; avg_quality: number; usage_count: number }[];
} {
  const db = getDb();

  const overall = db.prepare(`
    SELECT COUNT(*) as total,
           AVG(satisfaction_score) as avg_conf,
           AVG(latency_ms) as avg_lat,
           SUM(CASE WHEN satisfaction_score > 0.5 THEN 1 ELSE 0 END) as good
    FROM query_log WHERE timestamp > datetime('now', '-30 days')
  `).get() as any;

  const byDepth = db.prepare(`
    SELECT depth_level, COUNT(*) as count,
           AVG(satisfaction_score) as avg_conf,
           AVG(latency_ms) as avg_lat
    FROM query_log WHERE timestamp > datetime('now', '-30 days')
    GROUP BY depth_level
  `).all() as any[];

  const topSources = db.prepare(`
    SELECT domain, AVG(quality_score) as avg_quality, COUNT(*) as usage_count
    FROM sources WHERE last_accessed > datetime('now', '-30 days')
    GROUP BY domain ORDER BY usage_count DESC LIMIT 10
  `).all() as any[];

  const depthMap: Record<string, any> = {};
  for (const d of byDepth) {
    depthMap[d.depth_level] = {
      count: d.count,
      avg_confidence: d.avg_conf || 0,
      avg_latency: d.avg_lat || 0,
    };
  }

  return {
    total_queries: overall?.total || 0,
    success_rate: overall?.total ? (overall.good || 0) / overall.total : 0,
    avg_latency_ms: overall?.avg_lat || 0,
    avg_confidence: overall?.avg_conf || 0,
    by_depth: depthMap,
    top_sources: topSources.map((s: any) => ({
      domain: s.domain,
      avg_quality: s.avg_quality || 0,
      usage_count: s.usage_count || 0,
    })),
  };
}
