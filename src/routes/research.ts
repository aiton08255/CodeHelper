import { Hono } from 'hono';
import { runPipeline, PipelineContext } from '../pipeline/orchestrator.js';
import { createEmitter } from '../ws/broadcaster.js';
import { getDb } from '../db/connection.js';
import { validateResearchRequest } from '../schemas/index.js';

export const researchRouter = new Hono();

const activeResearch = new Map<number, { status: string; report?: any; timestamp: number }>();
let nextId = 1;

// Cleanup old entries (keep last 100)
function cleanupResearch() {
  if (activeResearch.size > 100) {
    const entries = [...activeResearch.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
    for (const [id] of entries.slice(0, entries.length - 100)) {
      activeResearch.delete(id);
    }
  }
}

researchRouter.post('/api/research', async (c) => {
  const body = await c.req.json();
  const parsed = validateResearchRequest(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues.map(i => i.message).join(', ') }, 400);
  }
  const { query, depth } = parsed.data;

  const researchId = nextId++;
  activeResearch.set(researchId, { status: 'running', timestamp: Date.now() });
  cleanupResearch();

  const ctx: PipelineContext = {
    query,
    depth,
    emit: createEmitter(),
    keys: {
      exa: process.env.EXA_API_KEY || '',
      serper: process.env.SERPER_API_KEY || '',
      groq: process.env.GROQ_API_KEY || '',
      mistral: process.env.MISTRAL_API_KEY || '',
      googleai: process.env.GOOGLE_AI_KEY || '',
    },
  };

  runPipeline(ctx)
    .then(report => {
      activeResearch.set(researchId, { status: 'completed', report, timestamp: Date.now() });
    })
    .catch(err => {
      activeResearch.set(researchId, { status: 'failed', report: { error: err.message }, timestamp: Date.now() });
    });

  return c.json({ research_id: researchId });
});

// IMPORTANT: history route BEFORE :id to avoid route conflict
researchRouter.get('/api/research/history', (c) => {
  const limit = parseInt(c.req.query('limit') || '20', 10);
  const offset = parseInt(c.req.query('offset') || '0', 10);
  const db = getDb();
  const results = db.prepare('SELECT * FROM query_log ORDER BY timestamp DESC LIMIT ? OFFSET ?').all(limit, offset);
  const total = (db.prepare('SELECT COUNT(*) as count FROM query_log').get() as any).count;
  return c.json({ results, total });
});

researchRouter.get('/api/research/:id', (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const entry = activeResearch.get(id);
  if (!entry) return c.json({ error: 'Not found' }, 404);
  return c.json({ id, ...entry });
});

researchRouter.get('/api/research/:id/report', (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const entry = activeResearch.get(id);
  if (!entry) return c.json({ error: 'Not found' }, 404);
  if (entry.status !== 'completed') return c.json({ error: 'Not ready', status: entry.status }, 202);
  return c.json(entry.report);
});
