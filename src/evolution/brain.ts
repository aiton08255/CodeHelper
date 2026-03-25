/**
 * Self-Evo Brain — autonomous self-improvement engine.
 *
 * Unlike the scheduler (which just researches), the brain ACTS on what it learns:
 * 1. Re-absorbs skills automatically → flags fully replicated ones as redundant
 * 2. Auto-tunes routing based on performance data
 * 3. Applies learned patterns from competitors
 * 4. Tracks what it knows vs what it's missing
 */

import { getDb } from '../db/connection.js';
import { deepAbsorbAllSkills } from '../absorb/deep-distiller.js';
import { consolidateKnowledge, getKBHealth } from './consolidator.js';
import { getPerformanceSummary } from './analyzer.js';
import { updateRoutingWeight, loadParams } from './params.js';
import { logEvolution } from './changelog.js';
import { fuseClaims } from './fuser.js';
import { setStatus } from './status.js';
import { homedir } from 'os';
import { join } from 'path';

interface BrainReport {
  actions_taken: string[];
  skills_absorbed: number;
  skills_redundant: string[];
  routing_adjustments: number;
  kb_health: { claims: number; confidence: number };
  recommendations: string[];
}

/**
 * Run the brain — analyze everything, act on findings, report what it did.
 * Call this periodically (every few hours) or after learning cycles.
 */
export async function runBrain(): Promise<BrainReport> {
  const actions: string[] = [];
  const recommendations: string[] = [];

  setStatus('brain', 'Brain cycle: analyzing and self-improving...');

  // === 1. RE-ABSORB SKILLS — catch new/updated skills ===
  setStatus('absorbing', 'Re-absorbing skills into knowledge base');
  const skillDirs = [
    join(homedir(), '.claude', 'skills'),
    join(homedir(), '.claude', 'plugins'),
  ];

  let skillsAbsorbed = 0;
  try {
    const result = deepAbsorbAllSkills(skillDirs);
    skillsAbsorbed = result.total_claims;
    actions.push(`Re-absorbed ${result.total_skills} skills → ${result.total_claims} claims`);
  } catch {
    actions.push('Skill absorption skipped (error)');
  }

  // === 2. CHECK SKILL REDUNDANCY — which skills are fully replicated? ===
  const redundant = checkSkillRedundancy();
  if (redundant.length > 0) {
    actions.push(`${redundant.length} skills fully replicated and redundant: ${redundant.join(', ')}`);
    logEvolution({
      change_type: 'skill_redundancy',
      tier: 'notify',
      parameter: 'skills',
      old_value: `${redundant.length} skills loaded`,
      new_value: `${redundant.length} skills replicated in KB`,
      reason: `These skills can be unloaded: ${redundant.join(', ')}`,
    });
  }

  // === 3. AUTO-TUNE ROUTING — based on performance data ===
  const routingAdjustments = autoTuneRouting();
  if (routingAdjustments > 0) {
    actions.push(`Auto-tuned ${routingAdjustments} routing weights based on performance`);
  }

  setStatus('fusing', 'Fusing similar claims and pruning weak knowledge');
  // === 4. FUSE CLAIMS — merge similar knowledge, boost agreement, prune weak ===
  const fused = fuseClaims();
  if (fused.fused > 0 || fused.pruned > 0) {
    actions.push(`Fused KB: merged ${fused.fused} claim groups, pruned ${fused.pruned} weak claims (${fused.before}→${fused.after})`);
  }

  // === 4b. CONSOLIDATE KB — clean stale data ===
  const consolidated = consolidateKnowledge();
  if (consolidated.duplicates_merged + consolidated.stale_removed + consolidated.low_confidence_pruned > 0) {
    actions.push(`Consolidated: -${consolidated.duplicates_merged} dupes, -${consolidated.stale_removed} stale, -${consolidated.low_confidence_pruned} low-conf`);
  }

  // === 5. SELF-DIAGNOSE — check what's weak ===
  const perf = getPerformanceSummary();
  const health = getKBHealth();

  // Low success rate?
  if (perf.success_rate < 0.6 && perf.total_queries > 5) {
    recommendations.push(`Success rate is ${(perf.success_rate * 100).toFixed(0)}% — consider tuning prompts or adding providers`);
  }

  // Low confidence?
  if (perf.avg_confidence < 0.4 && perf.total_queries > 5) {
    recommendations.push(`Average confidence is ${(perf.avg_confidence * 100).toFixed(0)}% — search quality needs improvement`);
  }

  // KB too small?
  if (health.research_claims < 50) {
    recommendations.push(`Only ${health.research_claims} research claims in KB — run more learning cycles`);
  }

  // Stale claims?
  if (health.stale_count > 20) {
    recommendations.push(`${health.stale_count} stale claims — consolidation interval may need shortening`);
  }

  // === 6. UPGRADE OWN BRAIN — generate new learning topics from KB insights ===
  const newTopics = upgradeOwnBrain();
  if (newTopics > 0) {
    actions.push(`Brain self-upgraded: added ${newTopics} new learning topics from KB insights`);
  }

  // Log brain run
  logEvolution({
    change_type: 'brain_run',
    tier: 'silent',
    parameter: 'self-improvement',
    old_value: null,
    new_value: `${actions.length} actions, ${recommendations.length} recommendations`,
    reason: actions.slice(0, 3).join('; '),
  });

  return {
    actions_taken: actions,
    skills_absorbed: skillsAbsorbed,
    skills_redundant: redundant,
    routing_adjustments: routingAdjustments,
    kb_health: { claims: health.total_claims, confidence: health.avg_confidence },
    recommendations,
  };
}

/**
 * Check which skills have enough KB coverage to be fully redundant.
 * A skill is redundant if it has 5+ workflow steps + 2+ decisions + 1+ anti-patterns in KB.
 */
function checkSkillRedundancy(): string[] {
  const db = getDb();
  const redundant: string[] = [];

  // Get all unique skill names from KB
  const skills = db.prepare(`
    SELECT DISTINCT ct2.tag as skill_name
    FROM claim_tags ct
    JOIN claim_tags ct2 ON ct.claim_id = ct2.claim_id
    WHERE ct.tag = 'skill'
      AND ct2.tag NOT IN ('skill', 'workflow', 'decision', 'gate', 'iron-law', 'anti-pattern', 'trigger', 'output', 'rule')
  `).all() as any[];

  for (const { skill_name } of skills) {
    // Count each type for this skill
    const counts = db.prepare(`
      SELECT ct2.tag as type, COUNT(*) as count
      FROM claim_tags ct
      JOIN claim_tags ct2 ON ct.claim_id = ct2.claim_id
      WHERE ct.tag = ?
        AND ct2.tag IN ('workflow', 'decision', 'gate', 'iron-law', 'anti-pattern', 'trigger')
      GROUP BY ct2.tag
    `).all(skill_name) as any[];

    const typeMap: Record<string, number> = {};
    for (const c of counts) typeMap[c.type] = c.count;

    const hasWorkflow = (typeMap['workflow'] || 0) >= 3;
    const hasDecisions = (typeMap['decision'] || 0) >= 1;
    const hasAntiPatterns = (typeMap['anti-pattern'] || 0) >= 1;
    const hasTrigger = (typeMap['trigger'] || 0) >= 1;

    if (hasWorkflow && hasDecisions && hasAntiPatterns && hasTrigger) {
      redundant.push(skill_name);
    }
  }

  return redundant;
}

/**
 * Auto-tune routing weights based on actual performance data.
 * Boosts providers that produce high-confidence results, reduces others.
 */
function autoTuneRouting(): number {
  const db = getDb();
  let adjustments = 0;

  // Get provider performance from recent queries
  const providerPerf = db.prepare(`
    SELECT qp.provider, AVG(ql.satisfaction_score) as avg_score, COUNT(*) as usage
    FROM query_providers qp
    JOIN query_log ql ON qp.query_id = ql.id
    WHERE ql.timestamp > datetime('now', '-7 days')
    GROUP BY qp.provider
    HAVING usage >= 3
  `).all() as any[];

  for (const pp of providerPerf) {
    const domain = pp.provider;
    const score = pp.avg_score || 0.5;

    // Map domain to provider name
    let provider = 'duckduckgo';
    if (domain.includes('exa')) provider = 'exa';
    else if (domain.includes('dev.to') || domain.includes('github') || domain.includes('stackoverflow')) provider = 'exa';
    else if (domain.includes('wikipedia')) provider = 'duckduckgo';

    // Boost good performers, reduce bad ones
    if (score > 0.6) {
      if (updateRoutingWeight('general', provider, 0.005)) adjustments++;
    } else if (score < 0.3) {
      if (updateRoutingWeight('general', provider, -0.005)) adjustments++;
    }
  }

  return adjustments;
}

/**
 * The brain upgrades its own brain.
 * Scans KB for high-value claims about tools/techniques it hasn't learned yet,
 * and creates new learning topics to investigate them deeper.
 */
function upgradeOwnBrain(): number {
  const db = getDb();

  // Ensure dynamic topics table
  db.exec(`CREATE TABLE IF NOT EXISTS dynamic_learning_topics (
    id TEXT PRIMARY KEY,
    query TEXT NOT NULL,
    depth TEXT DEFAULT 'quick',
    category TEXT DEFAULT 'auto-discovered',
    source_claim TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    times_run INTEGER DEFAULT 0
  )`);

  // Find high-confidence claims mentioning tools/APIs/techniques we don't know about
  const discoveries = db.prepare(`
    SELECT DISTINCT c.claim_text FROM claims c
    WHERE c.confidence >= 0.7
      AND (c.claim_text LIKE '%API%' OR c.claim_text LIKE '%framework%' OR c.claim_text LIKE '%technique%'
           OR c.claim_text LIKE '%algorithm%' OR c.claim_text LIKE '%model%' OR c.claim_text LIKE '%tool%')
      AND c.date_found > date('now', '-7 days')
      AND c.id NOT IN (SELECT claim_id FROM claim_tags WHERE tag = 'skill')
    ORDER BY c.confidence DESC
    LIMIT 5
  `).all() as any[];

  let added = 0;
  for (const disc of discoveries) {
    const text = disc.claim_text as string;

    // Extract key terms to build a follow-up query
    const keywords = text
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .split(/\s+/)
      .filter((w: string) => w.length > 4)
      .slice(0, 5)
      .join(' ');

    if (keywords.length < 10) continue;

    const topicId = `auto-${keywords.slice(0, 30).replace(/\s+/g, '-').toLowerCase()}`;

    // Don't add if we already have this topic
    const exists = db.prepare('SELECT 1 FROM dynamic_learning_topics WHERE id = ?').get(topicId);
    if (exists) continue;

    db.prepare(`INSERT INTO dynamic_learning_topics (id, query, depth, category, source_claim)
      VALUES (?, ?, 'quick', 'auto-discovered', ?)`
    ).run(topicId, `${keywords} how it works best practices implementation`, text.slice(0, 200));

    added++;

    logEvolution({
      change_type: 'brain_upgrade',
      tier: 'silent',
      parameter: topicId,
      old_value: null,
      new_value: keywords,
      reason: `Brain discovered new topic to learn: ${keywords.slice(0, 60)}`,
    });
  }

  return added;
}
