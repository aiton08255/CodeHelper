import { randomBytes } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { createServer } from 'net';

const DATA_DIR = join(homedir(), '.deep-research');
const ENV_PATH = join(DATA_DIR, '.env');

export function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

export function ensureToken(): string {
  ensureDataDir();
  if (existsSync(ENV_PATH)) {
    const content = readFileSync(ENV_PATH, 'utf-8');
    const match = content.match(/^AUTH_TOKEN=(.+)$/m);
    if (match) return match[1];
  }
  const token = randomBytes(32).toString('hex');
  writeFileSync(ENV_PATH, `AUTH_TOKEN=${token}\n`, { mode: 0o600 });
  return token;
}

export function initEvolutionDefaults(): void {
  ensureDataDir();
  const evoPath = join(DATA_DIR, 'evolution.json');
  if (!existsSync(evoPath)) {
    writeFileSync(evoPath, JSON.stringify({
      routing_weights: {
        news: { duckduckgo: 1.0, exa: 0.5, serper: 0.2 },
        academic: { exa: 1.0, duckduckgo: 0.6, serper: 0.3 },
        general: { duckduckgo: 1.0, exa: 0.7, serper: 0.3 },
        code: { duckduckgo: 0.8, exa: 0.9, serper: 0.2 },
      },
      source_reputation: {},
      reformulation_patterns: [],
    }, null, 2));
  }
  const clPath = join(DATA_DIR, 'changelog.md');
  if (!existsSync(clPath)) {
    writeFileSync(clPath, '# Deep Research Evolution Changelog\n\n');
  }
}

export function findAvailablePort(preferred: number): Promise<number> {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(preferred, '0.0.0.0', () => {
      server.close(() => resolve(preferred));
    });
    server.on('error', () => {
      const fallback = createServer();
      fallback.listen(0, '0.0.0.0', () => {
        const port = (fallback.address() as any).port;
        fallback.close(() => resolve(port));
      });
    });
  });
}

export const config = {
  preferredPort: parseInt(process.env.PORT || '13742', 10),
  dataDir: DATA_DIR,
  dbPath: join(DATA_DIR, 'knowledge.db'),
  evolutionPath: join(DATA_DIR, 'evolution.json'),
  changelogPath: join(DATA_DIR, 'changelog.md'),
  envPath: ENV_PATH,
};
