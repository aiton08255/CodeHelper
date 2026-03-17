import { Hono } from 'hono';
import { getRecentChanges } from '../evolution/changelog.js';
import { loadParams, resetParam } from '../evolution/params.js';

export const evolutionRouter = new Hono();

evolutionRouter.get('/api/evolution/changelog', (c) => {
  const limit = parseInt(c.req.query('limit') || '50', 10);
  const tier = c.req.query('tier') as any;
  const entries = getRecentChanges(limit, tier);
  return c.json({ entries });
});

evolutionRouter.get('/api/evolution/params', (c) => {
  return c.json(loadParams());
});

evolutionRouter.post('/api/evolution/reset', async (c) => {
  const body = await c.req.json();
  if (!body.parameter) return c.json({ error: 'parameter required' }, 400);
  resetParam(body.parameter);
  return c.json({ ok: true, reset: body.parameter });
});
