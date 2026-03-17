import { SearchResult } from '../providers/types.js';
import type { PipelineContext } from './orchestrator.js';
import { getDomainReputation } from '../memory/sources.js';
import { loadParams } from '../evolution/params.js';

export interface TriagedSource extends SearchResult {
  quality_score: number;
}

// Domain tier lists (pre-fetch signals only)
const HIGH_QUALITY_DOMAINS = new Set([
  'developer.mozilla.org', 'docs.python.org', 'docs.rust-lang.org', 'go.dev',
  'reactjs.org', 'vuejs.org', 'angular.io', 'svelte.dev', 'nodejs.org',
  'arxiv.org', 'nature.com', 'science.org', 'ieee.org', 'acm.org',
  'stackoverflow.com', 'github.com', 'en.wikipedia.org',
  'web.dev', 'css-tricks.com', 'smashingmagazine.com',
]);

const LOW_QUALITY_DOMAINS = new Set([
  'pinterest.com', 'quora.com', 'medium.com', // mixed quality
  'w3schools.com', // often outdated
]);

const HIGH_TLD = new Set(['.edu', '.gov', '.org']);

const DEPTH_TO_TOP_N: Record<string, number> = {
  quick: 3,
  standard: 5,
  deep: 8,
};

export async function stageTriage(ctx: PipelineContext, results: SearchResult[]): Promise<TriagedSource[]> {
  const evoParams = loadParams();
  const topN = DEPTH_TO_TOP_N[ctx.depth] || 5;

  const scored: TriagedSource[] = results.map(r => {
    let score = 0.5; // baseline

    // Domain authority
    try {
      const domain = new URL(r.url).hostname;

      if (HIGH_QUALITY_DOMAINS.has(domain)) score += 0.25;
      if (LOW_QUALITY_DOMAINS.has(domain)) score -= 0.15;

      // TLD scoring
      const tld = '.' + domain.split('.').pop();
      if (HIGH_TLD.has(tld)) score += 0.15;

      // Evolution-learned reputation (max +/- 0.20 influence)
      const reputation = evoParams.source_reputation[domain];
      if (reputation !== undefined) {
        const influence = Math.max(-0.20, Math.min(0.20, reputation - 0.5));
        score += influence;
      }

      // Stored reputation from prior research
      const storedRep = getDomainReputation(domain);
      if (storedRep !== 0.5) {
        score += (storedRep - 0.5) * 0.1; // small influence
      }
    } catch {}

    // Freshness from snippet date
    if (r.date) {
      try {
        const dateStr = r.date;
        const year = parseInt(dateStr.match(/\d{4}/)?.[0] || '0', 10);
        if (year >= 2025) score += 0.1;
        else if (year >= 2023) score += 0.05;
        else if (year < 2020) score -= 0.1;
      } catch {}
    }

    // Snippet quality heuristic
    if (r.snippet.length > 200) score += 0.05;
    if (r.snippet.length < 50) score -= 0.05;

    // Clamp score
    score = Math.max(0.1, Math.min(1.0, score));

    return { ...r, quality_score: Math.round(score * 100) / 100 };
  });

  // Sort by quality descending, take top N
  scored.sort((a, b) => b.quality_score - a.quality_score);

  // Deduplicate by domain (max 2 per domain to avoid single-source bias)
  const domainCounts = new Map<string, number>();
  const filtered: TriagedSource[] = [];

  for (const source of scored) {
    try {
      const domain = new URL(source.url).hostname;
      const count = domainCounts.get(domain) || 0;
      if (count >= 2) continue;
      domainCounts.set(domain, count + 1);
    } catch {}
    filtered.push(source);
    if (filtered.length >= topN) break;
  }

  return filtered;
}
