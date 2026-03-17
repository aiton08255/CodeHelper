/**
 * Deep Skill Distiller — captures the FULL behavioral DNA of skills.
 *
 * Unlike the basic distiller (rules/anti-patterns), this extracts:
 * - Complete workflows (step-by-step process)
 * - Decision trees (if X then Y)
 * - Quality gates (what must be true before proceeding)
 * - Iron laws (non-negotiable rules)
 * - Output formats (what the skill produces)
 *
 * The goal: Claude should perform IDENTICALLY to having the skill loaded,
 * using only the KB claims from RECALL. Once verified, the skill becomes
 * redundant and can be retired.
 */

import { readFileSync } from 'fs';
import { basename, dirname } from 'path';
import { insertClaim } from '../memory/claims.js';
import { getDb } from '../db/connection.js';
import { findSkillFiles } from './distiller.js';

interface SkillDNA {
  name: string;
  trigger: string;
  workflow: string[];      // ordered steps
  decisions: string[];     // if/then rules
  gates: string[];         // must-pass conditions
  iron_laws: string[];     // non-negotiable absolutes
  anti_patterns: string[]; // what NOT to do
  outputs: string[];       // what the skill produces
  source_path: string;
}

/**
 * Extract the complete behavioral DNA from a skill file.
 */
export function extractSkillDNA(filePath: string): SkillDNA | null {
  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }

  const frontmatter = content.match(/^---\n([\s\S]*?)\n---/);
  const name = frontmatter?.[1]?.match(/name:\s*(.+)/)?.[1]?.trim() || basename(dirname(filePath));
  const description = frontmatter?.[1]?.match(/description:\s*(.+)/)?.[1]?.trim() || '';
  const body = content.replace(/^---\n[\s\S]*?\n---\n?/, '');

  return {
    name,
    trigger: extractTrigger(body, description),
    workflow: extractWorkflow(body),
    decisions: extractDecisions(body),
    gates: extractGates(body),
    iron_laws: extractIronLaws(body),
    anti_patterns: extractAntiPatterns(body),
    outputs: extractOutputs(body),
    source_path: filePath,
  };
}

function extractTrigger(body: string, description: string): string {
  const patterns = [
    /use\s+(?:this\s+)?(?:skill\s+)?when[:\s]+([^\n]+)/i,
    /trigger\s+when[:\s]+([^\n]+)/i,
  ];
  for (const p of patterns) {
    const m = body.match(p);
    if (m) return m[1].trim();
  }
  return description;
}

function extractWorkflow(body: string): string[] {
  const steps: string[] = [];

  // Numbered process steps: "1. Do X", "2. Do Y"
  const numbered = body.match(/^\d+\.\s+\*\*[^*]+\*\*[^\n]*/gm);
  if (numbered) {
    for (const s of numbered) {
      const text = s.replace(/^\d+\.\s+/, '').replace(/\*\*/g, '').trim();
      if (text.length > 10 && text.length < 300) steps.push(text);
    }
  }

  // Checklist steps: "- [ ] Step"
  const checklists = body.match(/^-\s*\[[ x]\]\s+\*\*[^*]+\*\*[^\n]*/gm);
  if (checklists && steps.length < 3) {
    for (const s of checklists) {
      const text = s.replace(/^-\s*\[[ x]\]\s+/, '').replace(/\*\*/g, '').trim();
      if (text.length > 10 && text.length < 300 && !steps.includes(text)) steps.push(text);
    }
  }

  // Section headers as workflow: "## Phase 1: X", "### Step 1: Y"
  const headers = body.match(/^#{2,3}\s+(?:Phase|Step|Stage)\s+\d+[:\s]+[^\n]+/gm);
  if (headers && steps.length < 3) {
    for (const h of headers) {
      const text = h.replace(/^#+\s+/, '').trim();
      if (text.length > 5 && !steps.includes(text)) steps.push(text);
    }
  }

  return steps.slice(0, 15);
}

function extractDecisions(body: string): string[] {
  const decisions: string[] = [];

  // "If X then Y" patterns
  const ifThen = body.match(/(?:^|\n)\s*[-*]?\s*(?:if|when)\s+[^,.\n]+[,:]?\s*(?:then|→|->|—)\s*[^\n]+/gi);
  if (ifThen) {
    for (const d of ifThen) {
      const text = d.replace(/^[\s\-*]+/, '').trim();
      if (text.length > 15 && text.length < 300) decisions.push(text);
    }
  }

  // Table rows with conditions (| condition | action |)
  const tableRows = body.match(/\|[^|]+\|[^|]+\|/g);
  if (tableRows) {
    for (const row of tableRows.slice(0, 10)) {
      const cells = row.split('|').filter(c => c.trim()).map(c => c.trim());
      if (cells.length >= 2 && cells[0].length > 5 && !cells[0].includes('---')) {
        decisions.push(`When "${cells[0]}" → ${cells[1]}`);
      }
    }
  }

  return decisions.slice(0, 12);
}

function extractGates(body: string): string[] {
  const gates: string[] = [];

  // HARD-GATE, GATE, gate function patterns
  const gateSection = body.match(/<HARD[_-]?GATE>([\s\S]*?)<\/HARD[_-]?GATE>/i);
  if (gateSection) {
    const lines = gateSection[1].split('\n').filter(l => l.trim().length > 10);
    gates.push(...lines.map(l => l.trim()).slice(0, 3));
  }

  // "before proceeding", "must be true", "gate:" patterns
  const gatePatterns = body.match(/(?:before\s+(?:proceeding|continuing|moving)|must\s+(?:be\s+true|pass|verify|confirm))[^\n]*/gi);
  if (gatePatterns) {
    for (const g of gatePatterns) {
      const text = g.replace(/^[\s\-*]+/, '').trim();
      if (text.length > 15 && text.length < 300 && !gates.includes(text)) gates.push(text);
    }
  }

  return gates.slice(0, 6);
}

function extractIronLaws(body: string): string[] {
  const laws: string[] = [];

  // "Iron Law:", "IRON LAW:", explicitly labeled
  const ironLaws = body.match(/iron\s+law[:\s]+([^\n]+)/gi);
  if (ironLaws) {
    for (const l of ironLaws) {
      const text = l.replace(/^iron\s+law[:\s]+/i, '').trim();
      if (text.length > 10) laws.push(`IRON LAW: ${text}`);
    }
  }

  // ALL-CAPS imperative sentences (NEVER, MUST, ALWAYS, REQUIRED)
  const imperatives = body.match(/^[^a-z\n]*(?:NEVER|MUST|ALWAYS|REQUIRED|DO NOT|CRITICAL)[^.\n]*[.!]/gm);
  if (imperatives) {
    for (const s of imperatives) {
      const text = s.replace(/^[#*\-\s|]+/, '').trim();
      if (text.length > 15 && text.length < 250 && !laws.some(l => l.includes(text))) {
        laws.push(text);
      }
    }
  }

  return laws.slice(0, 8);
}

function extractAntiPatterns(body: string): string[] {
  const patterns: string[] = [];

  // Red flags sections
  const redFlags = body.match(/(?:red\s+flags?|anti.?patterns?|common\s+(?:mistakes|rationalizations))[:\s]*\n((?:[\s\S]*?\n){1,15})/i);
  if (redFlags) {
    const items = redFlags[1].match(/[-*|]\s+[^\n]+/g);
    if (items) {
      for (const item of items.slice(0, 8)) {
        const text = item.replace(/^[-*|]\s+/, '').replace(/\*\*/g, '').trim();
        if (text.length > 10 && text.length < 250) patterns.push(text);
      }
    }
  }

  // "Don't", "Do NOT", "Avoid", "Never" in body
  const avoidLines = body.match(/^.*(?:(?:do\s+not|don't|avoid|never)\s+[^.\n]+)[.!]?/gim);
  if (avoidLines) {
    for (const line of avoidLines.slice(0, 6)) {
      const text = line.replace(/^[#*\-\s|]+/, '').trim();
      if (text.length > 15 && text.length < 250 && !patterns.some(p => p.includes(text.slice(0, 50)))) {
        patterns.push(text);
      }
    }
  }

  return patterns.slice(0, 10);
}

function extractOutputs(body: string): string[] {
  const outputs: string[] = [];

  // "Save to", "Output:", "Produces:", "Creates:"
  const outputPatterns = body.match(/(?:save\s+(?:to|as)|output[s]?[:\s]|produce[s]?[:\s]|create[s]?[:\s]|write[s]?\s+(?:to|the))[^\n]*/gi);
  if (outputPatterns) {
    for (const o of outputPatterns.slice(0, 4)) {
      const text = o.trim();
      if (text.length > 10) outputs.push(text);
    }
  }

  return outputs.slice(0, 4);
}

/**
 * Store a complete skill DNA in the KB.
 * Each component is stored with specific tags for targeted retrieval.
 */
export function storeSkillDNA(dna: SkillDNA): number {
  let stored = 0;
  const today = new Date().toISOString().slice(0, 10);
  const skillTag = dna.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const base = { source_id: null, date_found: today, query_id: null, confidence: 0.95, claim_type: 'procedural' as const };

  // Trigger
  if (dna.trigger) {
    insertClaim({ ...base, claim_text: `[SKILL:${dna.name}] TRIGGER: ${dna.trigger}`, tags: ['skill', skillTag, 'trigger'] });
    stored++;
  }

  // Workflow (ordered — prefix with step number)
  for (let i = 0; i < dna.workflow.length; i++) {
    insertClaim({ ...base, claim_text: `[SKILL:${dna.name}] STEP ${i + 1}: ${dna.workflow[i]}`, tags: ['skill', skillTag, 'workflow'] });
    stored++;
  }

  // Decisions
  for (const d of dna.decisions) {
    insertClaim({ ...base, claim_text: `[SKILL:${dna.name}] DECISION: ${d}`, tags: ['skill', skillTag, 'decision'] });
    stored++;
  }

  // Gates
  for (const g of dna.gates) {
    insertClaim({ ...base, claim_text: `[SKILL:${dna.name}] GATE: ${g}`, tags: ['skill', skillTag, 'gate'] });
    stored++;
  }

  // Iron laws (highest confidence — non-negotiable)
  for (const l of dna.iron_laws) {
    insertClaim({ ...base, claim_text: `[SKILL:${dna.name}] ${l}`, tags: ['skill', skillTag, 'iron-law'] });
    stored++;
  }

  // Anti-patterns
  for (const a of dna.anti_patterns) {
    insertClaim({ ...base, claim_text: `[SKILL:${dna.name}] AVOID: ${a}`, tags: ['skill', skillTag, 'anti-pattern'] });
    stored++;
  }

  // Outputs
  for (const o of dna.outputs) {
    insertClaim({ ...base, claim_text: `[SKILL:${dna.name}] OUTPUT: ${o}`, tags: ['skill', skillTag, 'output'] });
    stored++;
  }

  return stored;
}

/**
 * Deep absorb all skills — replaces the basic distiller.
 */
export function deepAbsorbAllSkills(skillDirs: string[]): {
  total_skills: number;
  total_claims: number;
  skills: { name: string; workflow: number; decisions: number; gates: number; iron_laws: number; anti_patterns: number }[];
} {
  const db = getDb();

  // Clear old skill claims
  try {
    const old = db.prepare("SELECT claim_id FROM claim_tags WHERE tag = 'skill'").all() as { claim_id: number }[];
    if (old.length > 0) {
      const delStmt = db.prepare('DELETE FROM claims WHERE id = ?');
      db.transaction(() => { for (const r of old) delStmt.run(r.claim_id); })();
    }
  } catch (err) {
    console.error('Failed to clear old skill claims:', err);
  }

  const allFiles: string[] = [];
  for (const dir of skillDirs) allFiles.push(...findSkillFiles(dir));

  // Deduplicate
  const seen = new Set<string>();
  const unique = allFiles.filter(f => {
    const key = basename(dirname(dirname(f))) + '/' + basename(dirname(f));
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const skills: { name: string; workflow: number; decisions: number; gates: number; iron_laws: number; anti_patterns: number }[] = [];
  let totalClaims = 0;

  for (const file of unique) {
    const dna = extractSkillDNA(file);
    if (!dna) continue;
    if (dna.workflow.length + dna.decisions.length + dna.gates.length + dna.iron_laws.length + dna.anti_patterns.length === 0) continue;

    const stored = storeSkillDNA(dna);
    totalClaims += stored;
    skills.push({
      name: dna.name,
      workflow: dna.workflow.length,
      decisions: dna.decisions.length,
      gates: dna.gates.length,
      iron_laws: dna.iron_laws.length,
      anti_patterns: dna.anti_patterns.length,
    });
  }

  return { total_skills: skills.length, total_claims: totalClaims, skills };
}
