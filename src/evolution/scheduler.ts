/**
 * Continuous Learning Scheduler — runs Self-Evo research on a schedule.
 * Searches for new knowledge, tools, and improvements autonomously.
 * Stores everything in the KB for future RECALL.
 */

import { runPipeline, PipelineContext } from '../pipeline/orchestrator.js';
import { consolidateKnowledge } from './consolidator.js';
import { logEvolution } from './changelog.js';
import { getDb } from '../db/connection.js';

interface ScheduledTask {
  id: string;
  query: string;
  depth: 'instant' | 'quick' | 'standard';
  category: string;
  interval_hours: number;
  last_run?: string;
}

// Topics Self-Evo should continuously learn about
const LEARNING_TOPICS: ScheduledTask[] = [
  // Self-improvement
  { id: 'ai-search-trends', query: 'Latest AI search engine techniques and improvements 2025 2026', depth: 'quick', category: 'self-improvement', interval_hours: 24 },
  { id: 'free-ai-apis', query: 'New free AI APIs and LLM providers no credit card 2025 2026', depth: 'quick', category: 'tools', interval_hours: 48 },
  { id: 'rag-advances', query: 'RAG pipeline improvements retrieval augmented generation latest research', depth: 'quick', category: 'self-improvement', interval_hours: 72 },

  // For user's projects
  { id: 'tone-js-updates', query: 'Tone.js updates new features web audio browser music 2025', depth: 'instant', category: 'brewbeats', interval_hours: 168 },
  { id: 'babylon-updates', query: 'Babylon.js latest features 3D web rendering improvements', depth: 'instant', category: 'sceneforge', interval_hours: 168 },
  { id: 'phaser-updates', query: 'Phaser game engine updates new features tilemap 2025', depth: 'instant', category: 'spawner', interval_hours: 168 },

  // General tech knowledge
  { id: 'typescript-updates', query: 'TypeScript latest features and best practices 2025', depth: 'instant', category: 'general', interval_hours: 168 },
  { id: 'web-dev-trends', query: 'Web development trends tools frameworks 2025 2026', depth: 'instant', category: 'general', interval_hours: 168 },
];

function noopEmit() {}

/**
 * Check which tasks are due and run them.
 */
export async function runScheduledLearning(keys: Record<string, string>): Promise<{
  tasks_checked: number;
  tasks_run: number;
  tasks_skipped: number;
  results: { id: string; status: string; claims: number }[];
}> {
  const db = getDb();

  // Ensure tracking table exists
  db.exec(`CREATE TABLE IF NOT EXISTS learning_schedule (
    task_id TEXT PRIMARY KEY,
    last_run TEXT,
    last_status TEXT,
    run_count INTEGER DEFAULT 0
  )`);

  const now = new Date();
  const results: { id: string; status: string; claims: number }[] = [];
  let tasksRun = 0;
  let tasksSkipped = 0;

  for (const task of LEARNING_TOPICS) {
    // Check last run time
    const record = db.prepare('SELECT last_run FROM learning_schedule WHERE task_id = ?').get(task.id) as any;
    const lastRun = record?.last_run ? new Date(record.last_run) : null;

    // Skip if ran recently
    if (lastRun) {
      const hoursSince = (now.getTime() - lastRun.getTime()) / (1000 * 60 * 60);
      if (hoursSince < task.interval_hours) {
        tasksSkipped++;
        continue;
      }
    }

    // Run the research
    try {
      const ctx: PipelineContext = {
        query: task.query,
        depth: task.depth,
        emit: noopEmit,
        keys,
      };

      const report = await runPipeline(ctx);
      const claimCount = report.claims?.length || 0;

      // Update schedule
      db.prepare(`INSERT INTO learning_schedule (task_id, last_run, last_status, run_count)
        VALUES (?, ?, ?, 1)
        ON CONFLICT(task_id) DO UPDATE SET last_run = ?, last_status = ?, run_count = run_count + 1`
      ).run(task.id, now.toISOString(), 'success', now.toISOString(), 'success');

      results.push({ id: task.id, status: 'success', claims: claimCount });
      tasksRun++;

      logEvolution({
        change_type: 'auto_learning',
        tier: 'silent',
        parameter: task.id,
        old_value: null,
        new_value: `${claimCount} claims`,
        reason: `Scheduled learning: ${task.query.slice(0, 60)}`,
      });
    } catch (err) {
      db.prepare(`INSERT INTO learning_schedule (task_id, last_run, last_status, run_count)
        VALUES (?, ?, ?, 1)
        ON CONFLICT(task_id) DO UPDATE SET last_run = ?, last_status = ?, run_count = run_count + 1`
      ).run(task.id, now.toISOString(), 'failed', now.toISOString(), 'failed');

      results.push({ id: task.id, status: 'failed', claims: 0 });
      tasksRun++;
    }
  }

  // Run consolidation after learning
  if (tasksRun > 0) {
    consolidateKnowledge();
  }

  return {
    tasks_checked: LEARNING_TOPICS.length,
    tasks_run: tasksRun,
    tasks_skipped: tasksSkipped,
    results,
  };
}

/**
 * Get learning schedule status.
 */
export function getLearningStatus(): {
  topics: { id: string; category: string; interval_hours: number; last_run: string | null; run_count: number }[];
} {
  const db = getDb();
  db.exec(`CREATE TABLE IF NOT EXISTS learning_schedule (
    task_id TEXT PRIMARY KEY, last_run TEXT, last_status TEXT, run_count INTEGER DEFAULT 0
  )`);

  return {
    topics: LEARNING_TOPICS.map(t => {
      const record = db.prepare('SELECT last_run, run_count FROM learning_schedule WHERE task_id = ?').get(t.id) as any;
      return {
        id: t.id,
        category: t.category,
        interval_hours: t.interval_hours,
        last_run: record?.last_run || null,
        run_count: record?.run_count || 0,
      };
    }),
  };
}
