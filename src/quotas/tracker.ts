import { getDb } from '../db/connection.js';

export interface QuotaStatus {
  provider: string;
  calls_used: number;
  call_limit: number;
  pct_used: number;
  exhausted: boolean;
  warning: boolean;
}

const PROVIDER_LIMITS: Record<string, { limit: number; period: 'daily' | 'monthly' | 'lifetime' }> = {
  exa: { limit: 1000, period: 'monthly' },
  serper: { limit: 2500, period: 'lifetime' },
  groq: { limit: 14400, period: 'daily' },
  pollinations: { limit: 200, period: 'daily' },
  mistral: { limit: 100000, period: 'monthly' },
  duckduckgo: { limit: 150, period: 'daily' },
  openrouter: { limit: 200, period: 'daily' },
  'google-ai': { limit: 1500, period: 'daily' }, // free: 15 RPM, 1500 req/day
};

function getCurrentPeriodStart(period: 'daily' | 'monthly' | 'lifetime'): string {
  const now = new Date();
  if (period === 'daily') return now.toISOString().slice(0, 10);
  if (period === 'monthly') return now.toISOString().slice(0, 7) + '-01';
  return '2026-01-01';
}

export function checkQuota(provider: string): QuotaStatus {
  const db = getDb();
  const limits = PROVIDER_LIMITS[provider];
  if (!limits) return { provider, calls_used: 0, call_limit: Infinity, pct_used: 0, exhausted: false, warning: false };

  const periodStart = getCurrentPeriodStart(limits.period);
  const row = db.prepare(
    'SELECT calls_used FROM quota_usage WHERE provider = ? AND period_start = ?'
  ).get(provider, periodStart) as any;

  const used = row?.calls_used || 0;
  const pct = (used / limits.limit) * 100;

  return {
    provider,
    calls_used: used,
    call_limit: limits.limit,
    pct_used: Math.round(pct * 10) / 10,
    exhausted: used >= limits.limit,
    warning: pct >= 80,
  };
}

export function incrementQuota(provider: string): void {
  const db = getDb();
  const limits = PROVIDER_LIMITS[provider];
  if (!limits) return;

  const periodStart = getCurrentPeriodStart(limits.period);
  db.prepare(`
    INSERT INTO quota_usage (provider, period_start, period_type, calls_used, call_limit)
    VALUES (?, ?, ?, 1, ?)
    ON CONFLICT(provider, period_start) DO UPDATE SET calls_used = calls_used + 1
  `).run(provider, periodStart, limits.period, limits.limit);
}

export function getAllQuotas(): QuotaStatus[] {
  return Object.keys(PROVIDER_LIMITS).map(checkQuota);
}

export function estimateBudget(depth: string): Record<string, number> {
  const budgets: Record<string, Record<string, number>> = {
    instant: { exa: 1, serper: 0, groq: 1, pollinations: 0, mistral: 0 },
    quick: { exa: 2, serper: 0, groq: 3, pollinations: 2, mistral: 1 },
    standard: { exa: 5, serper: 1, groq: 6, pollinations: 5, mistral: 3 },
    deep: { exa: 10, serper: 2, groq: 10, pollinations: 10, mistral: 5 },
  };
  return budgets[depth] || budgets.standard;
}

export function canAfford(depth: string): { ok: boolean; warnings: string[] } {
  const budget = estimateBudget(depth);
  const warnings: string[] = [];
  let ok = true;

  for (const [provider, needed] of Object.entries(budget)) {
    const status = checkQuota(provider);
    const remaining = status.call_limit - status.calls_used;
    if (remaining < needed) {
      warnings.push(`${provider}: need ${needed} calls but only ${remaining} remaining`);
      ok = false;
    } else if (status.warning) {
      warnings.push(`${provider}: at ${status.pct_used}% of quota`);
    }
  }

  return { ok, warnings };
}
