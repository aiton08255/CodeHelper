/**
 * Skill Distiller — reads SKILL.md files, extracts decision rules,
 * and stores them as compact claims in Self-Evo's knowledge base.
 *
 * This replaces ~14k lines of skill files with ~200 tokens of
 * contextual rules retrievable via RECALL.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, basename, dirname } from 'path';
import { insertClaim } from '../memory/claims.js';
import { getDb } from '../db/connection.js';

export interface DistilledSkill {
  name: string;
  trigger: string;      // when to activate
  rules: string[];      // compact decision rules
  antiPatterns: string[]; // what NOT to do
  source_path: string;
}

/**
 * Extract decision rules from a SKILL.md file.
 * No LLM needed — we parse structure directly.
 */
export function distillSkill(filePath: string): DistilledSkill | null {
  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }

  // Parse YAML frontmatter
  const frontmatter = content.match(/^---\n([\s\S]*?)\n---/);
  const name = frontmatter?.[1]?.match(/name:\s*(.+)/)?.[1]?.trim() || basename(dirname(filePath));
  const description = frontmatter?.[1]?.match(/description:\s*(.+)/)?.[1]?.trim() || '';

  // Extract trigger conditions (when to use this skill)
  const trigger = extractTrigger(content, description);

  // Extract rules (imperative statements, checklist items, requirements)
  const rules = extractRules(content);

  // Extract anti-patterns (what NOT to do)
  const antiPatterns = extractAntiPatterns(content);

  if (rules.length === 0 && antiPatterns.length === 0) return null;

  return { name, trigger, rules, antiPatterns, source_path: filePath };
}

function extractTrigger(content: string, description: string): string {
  // Look for "Use when", "Trigger when", "WHEN:" patterns
  const triggerPatterns = [
    /use\s+(?:this\s+)?(?:skill\s+)?when[:\s]+([^\n.]+)/i,
    /trigger\s+when[:\s]+([^\n.]+)/i,
    /activate\s+when[:\s]+([^\n.]+)/i,
  ];

  for (const pattern of triggerPatterns) {
    const match = content.match(pattern);
    if (match) return match[1].trim();
  }

  return description;
}

function extractRules(content: string): string[] {
  const rules: string[] = [];

  // 1. Checklist items (- [ ] or - [x])
  const checklistItems = content.match(/^-\s*\[[ x]\]\s*(.+)/gm);
  if (checklistItems) {
    for (const item of checklistItems.slice(0, 8)) {
      const text = item.replace(/^-\s*\[[ x]\]\s*/, '').trim();
      if (text.length > 10 && text.length < 200) rules.push(text);
    }
  }

  // 2. MUST/ALWAYS/NEVER/REQUIRED statements
  const imperatives = content.match(/^.*(?:MUST|ALWAYS|NEVER|REQUIRED|DO NOT)[^.\n]*[.!]/gm);
  if (imperatives) {
    for (const stmt of imperatives.slice(0, 10)) {
      const clean = stmt.replace(/^[#*\-\s]+/, '').trim();
      if (clean.length > 15 && clean.length < 200 && !rules.includes(clean)) {
        rules.push(clean);
      }
    }
  }

  // 3. Numbered steps (1. Do X, 2. Do Y)
  const numberedSteps = content.match(/^\d+\.\s+\*\*[^*]+\*\*/gm);
  if (numberedSteps) {
    for (const step of numberedSteps.slice(0, 6)) {
      const text = step.replace(/^\d+\.\s+/, '').replace(/\*\*/g, '').trim();
      if (text.length > 10 && text.length < 150 && !rules.includes(text)) {
        rules.push(text);
      }
    }
  }

  // 4. Key principles sections
  const principlesMatch = content.match(/(?:key principles|core rules|guidelines)[:\s]*\n((?:[-*]\s+.+\n?)+)/i);
  if (principlesMatch) {
    const items = principlesMatch[1].match(/[-*]\s+(.+)/g);
    if (items) {
      for (const item of items.slice(0, 6)) {
        const text = item.replace(/^[-*]\s+/, '').replace(/\*\*/g, '').trim();
        if (text.length > 10 && text.length < 200 && !rules.includes(text)) {
          rules.push(text);
        }
      }
    }
  }

  return rules.slice(0, 12); // cap at 12 rules per skill
}

function extractAntiPatterns(content: string): string[] {
  const patterns: string[] = [];

  // "Don't", "Do NOT", "Avoid", "NEVER"
  const antiLines = content.match(/^.*(?:(?:do\s+not|don't|avoid|never)\s+[^.\n]+)[.!]?/gim);
  if (antiLines) {
    for (const line of antiLines.slice(0, 5)) {
      const clean = line.replace(/^[#*\-\s|]+/, '').trim();
      if (clean.length > 15 && clean.length < 200) {
        patterns.push(clean);
      }
    }
  }

  // Anti-pattern sections
  const antiSection = content.match(/anti.?pattern[s]?[:\s]*\n((?:[-*|]\s*.+\n?)+)/i);
  if (antiSection) {
    const items = antiSection[1].match(/[-*|]\s+(.+)/g);
    if (items) {
      for (const item of items.slice(0, 5)) {
        const text = item.replace(/^[-*|]\s+/, '').trim();
        if (text.length > 10 && text.length < 200) patterns.push(text);
      }
    }
  }

  return patterns.slice(0, 6);
}

/**
 * Scan a directory recursively for SKILL.md files
 */
export function findSkillFiles(rootDir: string): string[] {
  const results: string[] = [];

  function walk(dir: string) {
    try {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        const fullPath = join(dir, entry);
        try {
          const stat = statSync(fullPath);
          if (stat.isDirectory() && !entry.startsWith('.') && entry !== 'node_modules') {
            walk(fullPath);
          } else if (entry === 'SKILL.md') {
            results.push(fullPath);
          }
        } catch {}
      }
    } catch {}
  }

  walk(rootDir);
  return results;
}

/**
 * Store a distilled skill in the knowledge base as tagged claims.
 * Uses claim_type='skill_rule' to distinguish from research claims.
 */
export function storeDistilledSkill(skill: DistilledSkill): number {
  let stored = 0;
  const today = new Date().toISOString().slice(0, 10);
  const baseTags = ['skill', skill.name.toLowerCase().replace(/[^a-z0-9-]/g, '-')];

  // Store trigger as a claim
  if (skill.trigger) {
    insertClaim({
      claim_text: `[SKILL:${skill.name}] TRIGGER: ${skill.trigger}`,
      source_id: null,
      confidence: 0.95,
      claim_type: 'procedural',
      date_found: today,
      query_id: null,
      tags: [...baseTags, 'trigger'],
    });
    stored++;
  }

  // Store rules as claims
  for (const rule of skill.rules) {
    insertClaim({
      claim_text: `[SKILL:${skill.name}] RULE: ${rule}`,
      source_id: null,
      confidence: 0.95,
      claim_type: 'procedural',
      date_found: today,
      query_id: null,
      tags: [...baseTags, 'rule'],
    });
    stored++;
  }

  // Store anti-patterns
  for (const anti of skill.antiPatterns) {
    insertClaim({
      claim_text: `[SKILL:${skill.name}] AVOID: ${anti}`,
      source_id: null,
      confidence: 0.95,
      claim_type: 'procedural',
      date_found: today,
      query_id: null,
      tags: [...baseTags, 'anti-pattern'],
    });
    stored++;
  }

  return stored;
}

/**
 * Run full absorption: find all skills, distill, store.
 * Returns summary of what was absorbed.
 */
export function absorbAllSkills(skillDirs: string[]): {
  total_skills: number;
  total_rules: number;
  skills: { name: string; rules: number; anti_patterns: number }[];
} {
  // Clear old skill claims first (re-absorb fresh)
  const db = getDb();
  const oldSkillClaims = db.prepare(
    "SELECT claim_id FROM claim_tags WHERE tag = 'skill'"
  ).all() as { claim_id: number }[];

  for (const row of oldSkillClaims) {
    db.prepare('DELETE FROM claims WHERE id = ?').run(row.claim_id);
  }

  const allFiles: string[] = [];
  for (const dir of skillDirs) {
    allFiles.push(...findSkillFiles(dir));
  }

  // Deduplicate by filename (some skills appear in both marketplace copies)
  const seen = new Set<string>();
  const uniqueFiles: string[] = [];
  for (const f of allFiles) {
    const key = basename(dirname(dirname(f))) + '/' + basename(dirname(f));
    if (!seen.has(key)) {
      seen.add(key);
      uniqueFiles.push(f);
    }
  }

  const skills: { name: string; rules: number; anti_patterns: number }[] = [];
  let totalRules = 0;

  for (const file of uniqueFiles) {
    const distilled = distillSkill(file);
    if (!distilled) continue;

    const stored = storeDistilledSkill(distilled);
    totalRules += stored;
    skills.push({
      name: distilled.name,
      rules: distilled.rules.length,
      anti_patterns: distilled.antiPatterns.length,
    });
  }

  return { total_skills: skills.length, total_rules: totalRules, skills };
}
