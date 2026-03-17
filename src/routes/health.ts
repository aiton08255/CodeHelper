import { Hono } from 'hono';
import { getAllQuotas } from '../quotas/tracker.js';

const startTime = Date.now();

export const healthRouter = new Hono();

healthRouter.get('/api/health', (c) => {
  const quotas = getAllQuotas();
  const providers: Record<string, string> = {};
  for (const q of quotas) {
    providers[q.provider] = q.exhausted ? 'exhausted' : 'up';
  }

  return c.json({
    status: 'ok',
    uptime_s: Math.floor((Date.now() - startTime) / 1000),
    providers,
  });
});
