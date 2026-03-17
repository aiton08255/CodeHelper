import { SearchResult } from '../providers/types.js';
import { ResearchPlan } from './types.js';
import type { PipelineContext } from './orchestrator.js';
import { executeSearch } from '../providers/router.js';
import { incrementQuota, checkQuota } from '../quotas/tracker.js';

export async function stageSearch(ctx: PipelineContext, plan: ResearchPlan): Promise<SearchResult[]> {
  const allResults: SearchResult[] = [];

  // Group sub-questions by provider for efficiency
  const providerGroups = new Map<string, string[]>();
  for (const sq of plan.sub_questions) {
    const provider = sq.provider;
    if (!providerGroups.has(provider)) providerGroups.set(provider, []);
    providerGroups.get(provider)!.push(sq.question);
  }

  // Execute all provider groups in parallel
  const searchPromises: Promise<SearchResult[]>[] = [];

  for (const [provider, questions] of providerGroups) {
    const [providerName] = provider.split(':');

    // Check quota before searching
    const quota = checkQuota(providerName);
    if (quota.exhausted) {
      ctx.emit({ type: 'quota-warning', provider: providerName, usage_pct: 100 });
      continue;
    }

    for (const question of questions) {
      const promise = executeSearch(provider, question, ctx.keys)
        .then(results => {
          incrementQuota(providerName);
          for (const r of results) {
            ctx.emit({ type: 'source-found', url: r.url, title: r.title, quality: 0 });
          }
          return results;
        })
        .catch(err => {
          ctx.emit({ type: 'error', message: `Search failed (${providerName}): ${err.message}`, recoverable: true });
          return [] as SearchResult[];
        });

      searchPromises.push(promise);
    }
  }

  // Wait for all searches with 10s timeout per promise
  const results = await Promise.allSettled(
    searchPromises.map(p =>
      Promise.race([p, new Promise<SearchResult[]>(resolve => setTimeout(() => resolve([]), 10_000))])
    )
  );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      allResults.push(...result.value);
    }
  }

  // Deduplicate by URL
  const seen = new Set<string>();
  return allResults.filter(r => {
    if (seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });
}
