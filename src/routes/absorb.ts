import { Hono } from 'hono';
import { homedir } from 'os';
import { join } from 'path';
import { absorbAllSkills } from '../absorb/distiller.js';

export const absorbRouter = new Hono();

// POST /api/absorb — trigger skill absorption
absorbRouter.post('/api/absorb', async (c) => {
  const skillDirs = [
    join(homedir(), '.claude', 'skills'),
    join(homedir(), '.claude', 'plugins'),
  ];

  const result = absorbAllSkills(skillDirs);

  return c.json({
    message: `Absorbed ${result.total_skills} skills into ${result.total_rules} knowledge base rules`,
    ...result,
  });
});

// GET /api/absorb/status — check absorption state
absorbRouter.get('/api/absorb/status', async (c) => {
  const { getDb } = await import('../db/connection.js');
  const db = getDb();

  const skillClaimCount = db.prepare(
    "SELECT COUNT(*) as count FROM claim_tags WHERE tag = 'skill'"
  ).get() as { count: number };

  const skillNames = db.prepare(
    "SELECT DISTINCT tag FROM claim_tags WHERE tag != 'skill' AND tag != 'trigger' AND tag != 'rule' AND tag != 'anti-pattern' AND claim_id IN (SELECT claim_id FROM claim_tags WHERE tag = 'skill')"
  ).all() as { tag: string }[];

  return c.json({
    absorbed_rules: skillClaimCount.count,
    skills: skillNames.map(r => r.tag),
  });
});
