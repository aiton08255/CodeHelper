/**
 * SEARCH stage — multi-provider parallel search with techniques from:
 * - GPT Researcher: parallel sub-question crawling
 * - OpenDeepSearch: two-mode (quick SERP + deep scraping)
 * - LixSearch: concurrent tool dispatch
 */

import { SearchResult } from '../providers/types.js';
import { ResearchPlan } from './types.js';
import type { PipelineContext } from './orchestrator.js';
import { executeSearch } from '../providers/router.js';
import { incrementQuota, checkQuota } from '../quotas/tracker.js';
import { domainTargetedSearch, DOMAIN_TARGETS } from '../providers/sources.js';

export async function stageSearch(ctx: PipelineContext, plan: ResearchPlan): Promise<SearchResult[]> {
  const allResults: SearchResult[] = [];

  // === TECHNIQUE 1: Parallel sub-question dispatch (from GPT Researcher) ===
  // Instead of grouping by provider, fire ALL sub-questions across ALL available providers simultaneously
  const searchPromises: Promise<SearchResult[]>[] = [];

  for (const sq of plan.sub_questions) {
    const provider = sq.provider;
    const [providerName] = provider.split(':');
    if (checkQuota(providerName).exhausted) continue;

    searchPromises.push(
      executeSearch(provider, sq.question, ctx.keys)
        .then(results => {
          incrementQuota(providerName);
          for (const r of results) ctx.emit({ type: 'source-found', url: r.url, title: r.title, quality: 0 });
          return results;
        })
        .catch(() => [] as SearchResult[])
    );
  }

  // === TECHNIQUE 2: Multi-provider same query (from OpenDeepSearch) ===
  // For standard+, search the SAME main query across multiple providers for broader coverage
  if (ctx.depth !== 'quick' && ctx.depth !== 'instant') {
    const providers = ['exa', 'google-search', 'duckduckgo'].filter(p => {
      if (p === 'exa' && !ctx.keys.exa) return false;
      if (p === 'google-search' && !ctx.keys.googleai) return false;
      return !checkQuota(p).exhausted;
    });

    for (const provider of providers) {
      searchPromises.push(
        executeSearch(provider, ctx.query, ctx.keys)
          .then(results => {
            incrementQuota(provider);
            for (const r of results) ctx.emit({ type: 'source-found', url: r.url, title: r.title, quality: 0 });
            return results;
          })
          .catch(() => [] as SearchResult[])
      );
    }
  }

  // === TECHNIQUE 3: Domain-targeted parallel searches for deep/exhaustive (from DeepSearcher) ===
  if (ctx.depth === 'deep' || ctx.depth === 'exhaustive') {
    const category = plan.intent === 'technical' ? 'tech_docs' :
                     plan.intent === 'factual' ? 'reference' :
                     plan.intent === 'trend' ? 'news' :
                     plan.intent === 'comparison' ? 'tech_docs' : 'academic';
    const targets = (DOMAIN_TARGETS[category] || []).slice(0, 4);
    for (const t of targets) {
      searchPromises.push(
        domainTargetedSearch(ctx.query, t, ctx.keys).catch(() => [] as SearchResult[])
      );
    }
  }

  // Fire ALL searches in parallel with 12s global timeout
  const results = await Promise.allSettled(
    searchPromises.map(p =>
      Promise.race([p, new Promise<SearchResult[]>(resolve => setTimeout(() => resolve([]), 12_000))])
    )
  );

  for (const result of results) {
    if (result.status === 'fulfilled') allResults.push(...result.value);
  }

  // Deduplicate by URL
  const seen = new Set<string>();
  return allResults.filter(r => {
    if (seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });
}
