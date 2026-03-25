import { config as dotenvConfig } from 'dotenv';
import { join } from 'path';
import { homedir } from 'os';

// Load .env from data directory
dotenvConfig({ path: join(homedir(), '.deep-research', '.env') });

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { config, ensureToken, initEvolutionDefaults, findAvailablePort } from './config.js';
import { getDb, closeDb } from './db/connection.js';
import { authMiddleware, rateLimitMiddleware } from './auth/middleware.js';
import { setupWebSocket } from './ws/broadcaster.js';
import { researchRouter } from './routes/research.js';
import { claimsRouter } from './routes/claims.js';
import { quotasRouter } from './routes/quotas.js';
import { evolutionRouter } from './routes/evolution.js';
import { healthRouter } from './routes/health.js';
import { absorbRouter } from './routes/absorb.js';
import { benchmarkRouter } from './routes/benchmark.js';

async function main() {
  // Initialize data directory and defaults
  const token = ensureToken();
  initEvolutionDefaults();

  // Initialize database (runs migrations)
  getDb();

  // Find available port
  const port = await findAvailablePort(config.preferredPort);

  // Create Hono app
  const app = new Hono();

  // CORS
  app.use('*', cors({
    origin: (origin) => {
      if (!origin) return origin || '';
      if (origin.startsWith('http://127.0.0.1')) return origin;
      if (origin.startsWith('http://localhost')) return origin;
      if (origin.match(/^http:\/\/100\.\d+\.\d+\.\d+/)) return origin; // Tailscale
      return '';
    },
  }));

  // Auth + rate limiting
  app.use('*', authMiddleware(token));
  app.use('*', rateLimitMiddleware());

  // Routes
  app.route('/', healthRouter);
  app.route('/', researchRouter);
  app.route('/', claimsRouter);
  app.route('/', quotasRouter);
  app.route('/', evolutionRouter);
  app.route('/', absorbRouter);
  app.route('/', benchmarkRouter);

  // Start server
  // Bind to 0.0.0.0 so Tailscale network can reach us
  const server = serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (info) => {
    console.log('');
    console.log('  ┌─────────────────────────────────────┐');
    console.log('  │         Self-Evo Research Engine     │');
    console.log('  └─────────────────────────────────────┘');
    console.log('');
    console.log(`  Server:  http://127.0.0.1:${info.port}`);
    console.log(`  Token:   ${token.slice(0, 8)}...${token.slice(-4)}`);
    console.log(`  Data:    ${config.dataDir}`);
    console.log('');
    console.log('  Test with:');
    console.log(`  curl http://127.0.0.1:${info.port}/api/health`);
    console.log('');
  });

  // WebSocket setup
  setupWebSocket(server as any, token);

  // Auto-learning: run scheduled learning 30s after startup (non-blocking)
  setTimeout(async () => {
    try {
      const { runScheduledLearning } = await import('./evolution/scheduler.js');
      const keys = {
        exa: process.env.EXA_API_KEY || '',
        serper: process.env.SERPER_API_KEY || '',
        groq: process.env.GROQ_API_KEY || '',
        mistral: process.env.MISTRAL_API_KEY || '',
        googleai: process.env.GOOGLE_AI_KEY || '',
      };
      const result = await runScheduledLearning(keys);
      if (result.tasks_run > 0) {
        console.log(`  Auto-learning: ${result.tasks_run} topics researched, ${result.tasks_skipped} skipped`);
      }
    } catch {}
  }, 30_000);

  // Graceful shutdown
  const shutdown = () => {
    console.log('\nShutting down...');
    closeDb();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(err => {
  console.error('Failed to start Self-Evo:', err);
  process.exit(1);
});
