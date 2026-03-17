import { Context, Next } from 'hono';
import { timingSafeEqual } from 'crypto';

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10;
const WINDOW_MS = 60_000;

export function authMiddleware(token: string) {
  return async (c: Context, next: Next) => {
    if (c.req.path === '/api/health') return next();

    const auth = c.req.header('Authorization');
    if (!auth) return c.json({ error: 'Unauthorized' }, 401);
    const provided = auth.replace('Bearer ', '');
    // Timing-safe comparison to prevent timing attacks
    try {
      const a = Buffer.from(provided);
      const b = Buffer.from(token);
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        return c.json({ error: 'Unauthorized' }, 401);
      }
    } catch {
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
