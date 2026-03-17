import { Hono } from 'hono';
import { homedir } from 'os';
import { join } from 'path';
import { deepAbsorbAllSkills } from '../absorb/deep-distiller.js';
import { getDb } from '../db/connection.js';

export const absorbRouter = new Hono();

const SKILL_DIRS = [
  join(homedir(), '.claude', 'skills'),
  join(homedir(), '.claude', 'plugins'),
];

// POST /api/absorb — deep skill absorption (full behavioral DNA)
absorbRouter.post('/api/absorb', async (c) => {
  try {
    const result = deepAbsorbAllSkills(SKILL_DIRS);
    return c.json({
      message: `Deep-absorbed ${result.total_skills} skills into ${result.total_claims} behavioral claims`,
      ...result,
    });
  } catch (err) {
    return c.json({ error: (err as Error).message, stack: (err as Error).stack?.split('\n').slice(0, 5) }, 500);
  }
});

// GET /api/absorb/status — check what's absorbed
absorbRouter.get('/api/absorb/status', async (c) => {
  const db = getDb();

  const total = (db.prepare("SELECT COUNT(DISTINCT claim_id) as c FROM claim_tags WHERE tag = 'skill'").get() as any).c;

  const byType = db.prepare(`
    SELECT ct2.tag as type, COUNT(DISTINCT ct.claim_id) as count
    FROM claim_tags ct
    JOIN claim_tags ct2 ON ct.claim_id = ct2.claim_id
    WHERE ct.tag = 'skill' AND ct2.tag IN ('workflow', 'decision', 'gate', 'iron-law', 'anti-pattern', 'trigger', 'output')
    GROUP BY ct2.tag
  `).all() as any[];

  const skills = db.prepare(`
    SELECT ct2.tag as skill_name, COUNT(DISTINCT ct.claim_id) as claim_count
    FROM claim_tags ct
    JOIN claim_tags ct2 ON ct.claim_id = ct2.claim_id
    WHERE ct.tag = 'skill' AND ct2.tag NOT IN ('skill', 'workflow', 'decision', 'gate', 'iron-law', 'anti-pattern', 'trigger', 'output', 'rule')
    GROUP BY ct2.tag
    ORDER BY claim_count DESC
  `).all() as any[];

  return c.json({
    total_absorbed_claims: total,
    by_type: Object.fromEntries(byType.map((r: any) => [r.type, r.count])),
    skills: skills.map((r: any) => ({ name: r.skill_name, claims: r.claim_count })),
  });
});

// GET /api/absorb/emulate/:skill — retrieve full skill DNA for emulation
absorbRouter.get('/api/absorb/emulate/:skill', async (c) => {
  const skillName = c.req.param('skill').toLowerCase();
  const db = getDb();

  // Find all claims for this skill, ordered by type
  const claims = db.prepare(`
    SELECT c.claim_text, c.confidence, ct2.tag as claim_type
    FROM claims c
    JOIN claim_tags ct ON c.id = ct.claim_id
    JOIN claim_tags ct2 ON c.id = ct2.claim_id
    WHERE ct.tag = ?
      AND ct2.tag IN ('trigger', 'workflow', 'decision', 'gate', 'iron-law', 'anti-pattern', 'output')
    ORDER BY
      CASE ct2.tag
        WHEN 'iron-law' THEN 1
        WHEN 'gate' THEN 2
        WHEN 'trigger' THEN 3
        WHEN 'workflow' THEN 4
        WHEN 'decision' THEN 5
        WHEN 'output' THEN 6
        WHEN 'anti-pattern' THEN 7
      END,
      c.confidence DESC
  `).all(skillName) as any[];

  if (claims.length === 0) {
    return c.json({ error: `Skill "${skillName}" not found in KB`, available: getAvailableSkills(db) }, 404);
  }

  // Group by type for clean output
  const grouped: Record<string, string[]> = {};
  for (const claim of claims) {
    if (!grouped[claim.claim_type]) grouped[claim.claim_type] = [];
    // Strip the [SKILL:name] prefix for cleaner output
    const text = claim.claim_text.replace(/\[SKILL:[^\]]+\]\s*(?:STEP \d+:\s*|TRIGGER:\s*|DECISION:\s*|GATE:\s*|AVOID:\s*|OUTPUT:\s*)?/, '').trim();
    if (!grouped[claim.claim_type].includes(text)) {
      grouped[claim.claim_type].push(text);
    }
  }

  // Build the compact emulation prompt
  const prompt = buildEmulationPrompt(skillName, grouped);

  return c.json({
    skill: skillName,
    total_claims: claims.length,
    components: grouped,
    emulation_prompt: prompt,
    emulation_tokens: Math.ceil(prompt.length / 4), // rough token estimate
  });
});

function getAvailableSkills(db: ReturnType<typeof getDb>): string[] {
  const rows = db.prepare(`
    SELECT DISTINCT ct2.tag FROM claim_tags ct
    JOIN claim_tags ct2 ON ct.claim_id = ct2.claim_id
    WHERE ct.tag = 'skill' AND ct2.tag NOT IN ('skill', 'workflow', 'decision', 'gate', 'iron-law', 'anti-pattern', 'trigger', 'output', 'rule')
  `).all() as any[];
  return rows.map((r: any) => r.tag);
}

function buildEmulationPrompt(name: string, grouped: Record<string, string[]>): string {
  const lines: string[] = [`# ${name}`];

  if (grouped['iron-law']?.length) {
    lines.push('## Non-Negotiable');
    for (const l of grouped['iron-law']) lines.push(`- ${l}`);
  }

  if (grouped['gate']?.length) {
    lines.push('## Gates (must pass before proceeding)');
    for (const g of grouped['gate']) lines.push(`- ${g}`);
  }

  if (grouped['trigger']?.length) {
    lines.push(`## When: ${grouped['trigger'][0]}`);
  }

  if (grouped['workflow']?.length) {
    lines.push('## Process');
    for (let i = 0; i < grouped['workflow'].length; i++) {
      lines.push(`${i + 1}. ${grouped['workflow'][i]}`);
    }
  }

  if (grouped['decision']?.length) {
    lines.push('## Decisions');
    for (const d of grouped['decision']) lines.push(`- ${d}`);
  }

  if (grouped['output']?.length) {
    lines.push('## Outputs');
    for (const o of grouped['output']) lines.push(`- ${o}`);
  }

  if (grouped['anti-pattern']?.length) {
    lines.push('## Avoid');
    for (const a of grouped['anti-pattern']) lines.push(`- ${a}`);
  }

  return lines.join('\n');
}
