import { Hono } from 'hono';
import { getRecentChanges } from '../evolution/changelog.js';
import { loadParams, resetParam } from '../evolution/params.js';
import { getPerformanceSummary } from '../evolution/analyzer.js';
import { consolidateKnowledge, getKBHealth } from '../evolution/consolidator.js';
import { getCacheStats } from '../memory/semantic-cache.js';
import { discoverTools, getDiscoveries, updateToolStatus } from '../evolution/discovery.js';

export const evolutionRouter = new Hono();

// Changelog
evolutionRouter.get('/api/evolution/changelog', (c) => {
  const limit = parseInt(c.req.query('limit') || '50', 10);
  const tier = c.req.query('tier') as any;
  return c.json({ entries: getRecentChanges(limit, tier) });
});

// Current params
evolutionRouter.get('/api/evolution/params', (c) => {
  return c.json(loadParams());
});

// Reset params
evolutionRouter.post('/api/evolution/reset', async (c) => {
  const body = await c.req.json();
  if (!body.parameter) return c.json({ error: 'parameter required' }, 400);
  resetParam(body.parameter);
  return c.json({ ok: true, reset: body.parameter });
});

// Performance dashboard
evolutionRouter.get('/api/evolution/performance', (c) => {
  return c.json(getPerformanceSummary());
});

// Knowledge base health
evolutionRouter.get('/api/evolution/kb-health', (c) => {
  return c.json({ ...getKBHealth(), semantic_cache: getCacheStats() });
});

// Consolidate knowledge base (cleanup)
evolutionRouter.post('/api/evolution/consolidate', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const result = consolidateKnowledge({
    max_age_days: body.max_age_days,
    min_confidence: body.min_confidence,
  });
  return c.json(result);
});

// Discover new tools (Phase 5)
evolutionRouter.post('/api/evolution/discover', async (c) => {
  const keys = {
    exa: process.env.EXA_API_KEY || '',
    serper: process.env.SERPER_API_KEY || '',
    groq: process.env.GROQ_API_KEY || '',
    mistral: process.env.MISTRAL_API_KEY || '',
    googleai: process.env.GOOGLE_AI_KEY || '',
  };
  const result = await discoverTools(keys);
  return c.json(result);
});

// Get discovered tools
evolutionRouter.get('/api/evolution/discoveries', (c) => {
  const status = c.req.query('status');
  return c.json({ tools: getDiscoveries(status || undefined) });
});

// Approve/reject a discovered tool
evolutionRouter.post('/api/evolution/tool-review', async (c) => {
  const body = await c.req.json();
  if (!body.url || !body.status) return c.json({ error: 'url and status required' }, 400);
  if (!['approved', 'rejected', 'integrated'].includes(body.status)) {
    return c.json({ error: 'status must be approved, rejected, or integrated' }, 400);
  }
  updateToolStatus(body.url, body.status);
  return c.json({ ok: true });
});
