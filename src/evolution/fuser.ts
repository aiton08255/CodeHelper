/**
 * Claim Fuser — merges similar claims into stronger combined claims.
 * Removes duplicates, fuses related knowledge, prunes weak claims.
 * The KB equivalent of natural selection — only the strongest survive.
 */

import { getDb } from '../db/connection.js';
import { logEvolution } from './changelog.js';

/**
 * Fuse similar claims in the KB into stronger combined claims.
 * Claims that say the same thing from different sources get merged
 * with boosted confidence.
 */
export function fuseClaims(): { fused: number; pruned: number; before: number; after: number } {
  const db = getDb();

  const before = (db.prepare('SELECT COUNT(*) as c FROM claims').get() as any).c;

  // Get all non-skill research claims
  const claims = db.prepare(`
    SELECT c.id, c.claim_text, c.confidence, c.source_id, c.claim_type
    FROM claims c
    LEFT JOIN claim_tags ct ON c.id = ct.claim_id AND ct.tag = 'skill'
    WHERE ct.claim_id IS NULL
    ORDER BY c.confidence DESC
  `).all() as any[];

  // Group by normalized text similarity
  const groups = new Map<string, any[]>();
  for (const claim of claims) {
    const key = normalize(claim.claim_text);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(claim);
  }

  let fused = 0;
  let pruned = 0;
  const toDelete: number[] = [];

  for (const [, group] of groups) {
    if (group.length <= 1) continue;

    // Keep the highest confidence claim, boost it from agreement
    const best = group[0]; // already sorted by confidence DESC
    const agreementBoost = Math.min(0.15, group.length * 0.03);
    const newConf = Math.min(0.95, best.confidence + agreementBoost);

    db.prepare('UPDATE claims SET confidence = ? WHERE id = ?').run(newConf, best.id);

    // Delete the duplicates
    for (let i = 1; i < group.length; i++) {
      toDelete.push(group[i].id);
    }

    fused++;
  }

  // Bulk delete
  if (toDelete.length > 0) {
    const stmt = db.prepare('DELETE FROM claims WHERE id = ?');
    db.transaction(() => { for (const id of toDelete) stmt.run(id); })();
    pruned = toDelete.length;
  }

  // Also prune very low confidence non-skill claims
  const lowConf = db.prepare(`
    DELETE FROM claims WHERE id IN (
      SELECT c.id FROM claims c
      LEFT JOIN claim_tags ct ON c.id = ct.claim_id AND ct.tag = 'skill'
      WHERE ct.claim_id IS NULL AND c.confidence < 0.2
    )
  `).run();
  pruned += lowConf.changes;

  const after = (db.prepare('SELECT COUNT(*) as c FROM claims').get() as any).c;

  if (fused > 0 || pruned > 0) {
    logEvolution({
      change_type: 'fusion',
      tier: 'silent',
      parameter: 'claims',
      old_value: `${before} claims`,
      new_value: `${after} claims (fused ${fused}, pruned ${pruned})`,
      reason: 'Claim fusion: merged duplicates, boosted agreement, pruned weak',
    });
  }

  return { fused, pruned, before, after };
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}
