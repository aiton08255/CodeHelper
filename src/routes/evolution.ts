import { Hono } from 'hono';
import { getRecentChanges } from '../evolution/changelog.js';
import { loadParams, resetParam } from '../evolution/params.js';
import { getPerformanceSummary } from '../evolution/analyzer.js';
import { consolidateKnowledge, getKBHealth } from '../evolution/consolidator.js';

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
  return c.json(getKBHealth());
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
