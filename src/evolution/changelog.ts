import { appendFileSync } from 'fs';
import { config } from '../config.js';
import { getDb } from '../db/connection.js';

type Tier = 'silent' | 'notify' | 'approval';

export function logEvolution(entry: {
  change_type: string;
  tier: Tier;
  parameter: string;
  old_value: string | null;
  new_value: string;
  reason: string;
  approved_by?: string;
}): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO evolution_log (change_type, tier, parameter, old_value, new_value, reason, approved_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(entry.change_type, entry.tier, entry.parameter, entry.old_value, entry.new_value, entry.reason, entry.approved_by || null);

  const now = new Date().toISOString().replace('T', ' ').slice(0, 16);
  const tierLabel = `TIER ${entry.tier === 'silent' ? '1' : entry.tier === 'notify' ? '2' : '3'} - ${entry.tier.toUpperCase()}`;
  const line = `- [${tierLabel}] ${entry.change_type}: ${entry.parameter}: ${entry.old_value || 'none'} → ${entry.new_value} (reason: ${entry.reason})\n`;

  appendFileSync(config.changelogPath, `\n## ${now}\n${line}`);
}

export function getRecentChanges(limit: number = 50, tier?: Tier) {
  const db = getDb();
  if (tier) {
    return db.prepare('SELECT * FROM evolution_log WHERE tier = ? ORDER BY timestamp DESC LIMIT ?').all(tier, limit);
  }
  return db.prepare('SELECT * FROM evolution_log ORDER BY timestamp DESC LIMIT ?').all(limit);
}
