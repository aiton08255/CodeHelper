import { Hono } from 'hono';
import { runBenchmark, getBenchmarkHistory } from '../benchmark/runner.js';
import { createEmitter } from '../ws/broadcaster.js';

export const benchmarkRouter = new Hono();

// POST /api/benchmark — run benchmark suite
benchmarkRouter.post('/api/benchmark', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const keys = {
    exa: process.env.EXA_API_KEY || '',
    serper: process.env.SERPER_API_KEY || '',
    groq: process.env.GROQ_API_KEY || '',
    mistral: process.env.MISTRAL_API_KEY || '',
    googleai: process.env.GOOGLE_AI_KEY || '',
  };

  const result = await runBenchmark(keys, {
    queries: body.queries,
    emit: createEmitter(),
  });

  return c.json(result);
});

// GET /api/benchmark/history — past benchmark runs
benchmarkRouter.get('/api/benchmark/history', (c) => {
  const limit = parseInt(c.req.query('limit') || '10', 10);
  return c.json({ runs: getBenchmarkHistory(limit) });
});
