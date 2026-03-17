import { Context, Next } from 'hono';

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10;
const WINDOW_MS = 60_000;

export function authMiddleware(token: string) {
  return async (c: Context, next: Next) => {
    if (c.req.path === '/api/health') return next();

    const auth = c.req.header('Authorization');
    if (!auth || auth !== `Bearer ${token}`) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    return next();
  };
}

export function rateLimitMiddleware() {
  return async (c: Context, next: Next) => {
    if (!c.req.path.startsWith('/api/research') || c.req.method !== 'POST') {
      return next();
    }

    const now = Date.now();
    const key = 'global';
    const entry = rateLimitMap.get(key);

    if (!entry || now > entry.resetAt) {
      rateLimitMap.set(key, { count: 1, resetAt: now + WINDOW_MS });
      return next();
    }

    if (entry.count >= RATE_LIMIT) {
      return c.json({ error: 'Rate limit exceeded. Max 10 research requests per minute.' }, 429);
    }

    entry.count++;
    return next();
  };
}
