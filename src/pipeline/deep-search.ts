/**
 * Deep Search — recursive sub-question decomposition.
 * Instead of searching once, it decomposes → searches → finds gaps → decomposes again.
 * Inspired by GPT Researcher's tree search that beats Perplexity.
 *
 * depth=1: standard (current behavior)
 * depth=2: each sub-question generates its own sub-questions
 * depth=3: three levels deep — exhaustive coverage
 */

import { SearchResult } from '../providers/types.js';
import type { PipelineContext } from './orchestrator.js';
import { executeSearch } from '../providers/router.js';
import { llmCall } from '../providers/llm.js';
import { extractJsonObject } from '../utils/safe-json.js';
import { incrementQuota, checkQuota } from '../quotas/tracker.js';
import { domainTargetedSearch, DOMAIN_TARGETS } from '../providers/sources.js';

const DECOMPOSE_PROMPT = `Break this question into 2-4 specific sub-questions that together fully answer it. Each should target different aspects.
JSON only: {"sub_questions":["specific question 1","specific question 2"]}`;

/**
 * Recursively decompose and search — the deeper you go, the more you find.
 */
export async function deepSearch(
  ctx: PipelineContext,
  maxDepth: number = 2,
  maxTotalResults: number = 30
): Promise<SearchResult[]> {
  const allResults: SearchResult[] = [];
  const seenUrls = new Set<string>();

  async function searchLevel(query: string, depth: number): Promise<void> {
    if (depth > maxDepth || allResults.length >= maxTotalResults) return;

    // Search this query across available providers
    const providers = ['exa', 'google-search', 'duckduckgo'].filter(p => {
      if (p === 'exa' && !ctx.keys.exa) return false;
      if (p === 'google-search' && !ctx.keys.googleai) return false;
      return !checkQuota(p).exhausted;
    });

    const searchPromises = providers.map(p =>
      executeSearch(p, query, ctx.keys)
        .then(r => { incrementQuota(p); return r; })
        .catch(() => [] as SearchResult[])
    );

    const results = await Promise.allSettled(searchPromises);
    for (const r of results) {
      if (r.status === 'fulfilled') {
        for (const result of r.value) {
          if (!seenUrls.has(result.url) && allResults.length < maxTotalResults) {
            seenUrls.add(result.url);
            allResults.push(result);
            ctx.emit({ type: 'source-found', url: result.url, title: result.title, quality: 0 });
          }
        }
      }
    }

    // Decompose into sub-questions if we haven't reached max depth
    if (depth < maxDepth && allResults.length < maxTotalResults) {
      try {
        const response = await llmCall(
          [{ role: 'system', content: DECOMPOSE_PROMPT },
           { role: 'user', content: query }],
          { tier: 'fast', keys: ctx.keys, timeout: 8_000 }
        );

        const parsed = extractJsonObject(response.content);
        const subQuestions = (parsed?.sub_questions as string[]) || [];

        // Search each sub-question at the next depth level
        for (const sq of subQuestions.slice(0, 3)) {
          if (allResults.length >= maxTotalResults) break;
          await searchLevel(sq, depth + 1);
        }
      } catch {}
    }
  }

  await searchLevel(ctx.query, 1);

  // Add domain-targeted searches for deep/exhaustive
  if ((ctx.depth === 'deep' || ctx.depth === 'exhaustive') && allResults.length < maxTotalResults) {
    const targets = Object.values(DOMAIN_TARGETS).flat().slice(0, 5);
    const domainPromises = targets.map(t =>
      domainTargetedSearch(ctx.query, t, ctx.keys).catch(() => [] as SearchResult[])
    );
    const domainResults = await Promise.allSettled(domainPromises);
    for (const dr of domainResults) {
      if (dr.status === 'fulfilled') {
        for (const r of dr.value) {
          if (!seenUrls.has(r.url)) {
            seenUrls.add(r.url);
            allResults.push(r);
          }
        }
      }
    }
  }

  return allResults;
}
