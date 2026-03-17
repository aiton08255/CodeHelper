/**
 * Knowledge Consolidator — cleans up the KB over time.
 * Removes stale claims, merges duplicates, compresses storage.
 * Runs on-demand or scheduled.
 */

import { getDb } from '../db/connection.js';
import { logEvolution } from './changelog.js';

interface ConsolidationResult {
  stale_removed: number;
  duplicates_merged: number;
  low_confidence_pruned: number;
  total_claims_before: number;
  total_claims_after: number;
}

/**
 * Run full knowledge base consolidation.
 * Safe to run anytime — only removes clearly stale/bad data.
 */
export function consolidateKnowledge(options: {
  max_age_days?: number;
  min_confidence?: number;
} = {}): ConsolidationResult {
  const db = getDb();
  const maxAge = options.max_age_days || 90;
  const minConfidence = options.min_confidence || 0.25;

  const countBefore = (db.prepare('SELECT COUNT(*) as c FROM claims').get() as any).c;

  // 1. Remove stale claims (older than maxAge days, not skill rules)
  const staleResult = db.prepare(`
    DELETE FROM claims WHERE id IN (
      SELECT c.id FROM claims c
      LEFT JOIN claim_tags ct ON c.id = ct.claim_id AND ct.tag = 'skill'
      WHERE ct.claim_id IS NULL
        AND julianday('now') - julianday(c.date_found) > ?
        AND c.confidence < 0.7
    )
  `).run(maxAge);
  const staleRemoved = staleResult.changes;

  // 2. Merge near-duplicate claims (same first 100 chars, keep highest confidence)
  const allClaims = db.prepare(`
    SELECT id, claim_text, confidence, source_id FROM claims
    ORDER BY confidence DESC
  `).all() as any[];

  const seen = new Map<string, number>(); // normalized prefix → kept id
  const toDelete: number[] = [];

  for (const claim of allClaims) {
    const key = claim.claim_text.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().slice(0, 100);
    if (seen.has(key)) {
      toDelete.push(claim.id); // lower confidence duplicate
    } else {
      seen.set(key, claim.id);
    }
  }

  if (toDelete.length > 0) {
    const deleteStmt = db.prepare('DELETE FROM claims WHERE id = ?');
    const tx = db.transaction(() => {
      for (const id of toDelete) deleteStmt.run(id);
    });
    tx();
  }

  // 3. Prune very low confidence claims (not skill rules)
  const lowConfResult = db.prepare(`
    DELETE FROM claims WHERE id IN (
      SELECT c.id FROM claims c
      LEFT JOIN claim_tags ct ON c.id = ct.claim_id AND ct.tag = 'skill'
      WHERE ct.claim_id IS NULL AND c.confidence < ?
    )
  `).run(minConfidence);
  const lowConfPruned = lowConfResult.changes;

  const countAfter = (db.prepare('SELECT COUNT(*) as c FROM claims').get() as any).c;

  // Log the consolidation
  const totalRemoved = staleRemoved + toDelete.length + lowConfPruned;
  if (totalRemoved > 0) {
    logEvolution({
      change_type: 'consolidation',
      tier: 'silent',
      parameter: 'knowledge_base',
      old_value: `${countBefore} claims`,
      new_value: `${countAfter} claims`,
      reason: `Removed ${staleRemoved} stale, ${toDelete.length} duplicates, ${lowConfPruned} low-confidence`,
    });
  }

  return {
    stale_removed: staleRemoved,
    duplicates_merged: toDelete.length,
    low_confidence_pruned: lowConfPruned,
    total_claims_before: countBefore,
    total_claims_after: countAfter,
  };
}

/**
 * Get KB health metrics.
 */
export function getKBHealth(): {
  total_claims: number;
  skill_rules: number;
  research_claims: number;
  avg_confidence: number;
  oldest_claim_days: number;
  stale_count: number;
  duplicate_estimate: number;
} {
  const db = getDb();

  const total = (db.prepare('SELECT COUNT(*) as c FROM claims').get() as any).c;
  const skillRules = (db.prepare("SELECT COUNT(DISTINCT claim_id) as c FROM claim_tags WHERE tag = 'skill'").get() as any).c;
  const avgConf = (db.prepare('SELECT AVG(confidence) as c FROM claims').get() as any).c || 0;
  const oldest = (db.prepare("SELECT MAX(julianday('now') - julianday(date_found)) as d FROM claims").get() as any).d || 0;
  const stale = (db.prepare("SELECT COUNT(*) as c FROM claims WHERE julianday('now') - julianday(date_found) > 90 AND confidence < 0.7").get() as any).c;

  // Estimate duplicates by checking first-100-char collisions
  const dupeEstimate = (db.prepare(`
    SELECT COUNT(*) - COUNT(DISTINCT SUBSTR(LOWER(claim_text), 1, 100)) as dupes FROM claims
  `).get() as any).dupes || 0;

  return {
    total_claims: total,
    skill_rules: skillRules,
    research_claims: total - skillRules,
    avg_confidence: avgConf,
    oldest_claim_days: Math.round(oldest),
    stale_count: stale,
    duplicate_estimate: dupeEstimate,
  };
}
