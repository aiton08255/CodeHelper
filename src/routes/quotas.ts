import { Hono } from 'hono';
import { getAllQuotas } from '../quotas/tracker.js';

export const quotasRouter = new Hono();

quotasRouter.get('/api/quotas', (c) => {
  const quotas = getAllQuotas();
  const result: Record<string, any> = {};
  for (const q of quotas) {
    result[q.provider] = q;
  }
  return c.json({ providers: result });
});
