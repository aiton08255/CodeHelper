/**
 * Instant pipeline — the pistol, not the nuke.
 * For simple factual queries: RECALL → 1 search → direct LLM answer.
 * Skips: plan, triage scoring, verify, gapfill, reason stages.
 * Target: 2-5 seconds.
 */

import { SearchResult } from '../providers/types.js';
import { ResearchReport, VerifiedClaim } from './types.js';
import type { PipelineContext } from './orchestrator.js';
import { stageRecall } from './stage-recall.js';
import { executeSearch } from '../providers/router.js';
import { llmCall } from '../providers/llm.js';
import { webFetchPage } from '../providers/webfetch.js';
import { incrementQuota } from '../quotas/tracker.js';
import { stageStore } from './stage-store.js';

const INSTANT_PROMPT = `Answer the question concisely using the provided search results. Be direct. Include key facts, numbers, dates. If results are insufficient, say so. No fluff.`;

export async function runInstantPipeline(ctx: PipelineContext): Promise<ResearchReport> {
  const startTime = Date.now();

  // 1. RECALL — check if we already know this
  ctx.emit({ type: 'stage-enter', stage: 'recall', detail: 'Checking cache...' });
  const prior = await stageRecall(ctx);

  const queryTerms = ctx.query.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 3);
  const relevant = prior.filter(c => {
    const cl = c.claim.toLowerCase();
    return queryTerms.filter(t => cl.includes(t)).length >= Math.max(1, queryTerms.length * 0.3);
  });

  // If we have 3+ relevant cached claims, answer from cache only (sub-second)
  if (relevant.length >= 3) {
    ctx.emit({ type: 'stage-progress', stage: 'recall', progress: 100, detail: `Cache hit: ${relevant.length} claims` });
    const answer = relevant.map(c => c.claim).join('\n\n');
    const report: ResearchReport = {
      query: ctx.query,
      depth: 'instant',
      executive_summary: answer.slice(0, 500),
      findings: answer,
      limitations: 'Answered from cached knowledge. May not reflect latest information.',
      sources: [],
      overall_confidence: relevant.reduce((s, c) => s + c.confidence, 0) / relevant.length,
      claims: relevant.map(c => ({ ...c, verified_confidence: c.confidence, agreement_score: 0.7, disputed: false })),
    };
    ctx.emit({ type: 'done', report_id: 0, overall_confidence: report.overall_confidence });
    return report;
  }

  // 2. Single search — Exa if available (better results), DDG as fallback
  ctx.emit({ type: 'stage-enter', stage: 'search', detail: 'Quick search...' });
  let searchResults: SearchResult[] = [];
  try {
    const provider = ctx.keys.exa ? 'exa' : 'duckduckgo';
    searchResults = await executeSearch(provider, ctx.query, ctx.keys);
    incrementQuota(provider);
  } catch {
    // Fallback to DDG if Exa fails
    try {
      searchResults = await executeSearch('duckduckgo', ctx.query, ctx.keys);
      incrementQuota('duckduckgo');
    } catch {
      searchResults = [];
    }
  }

  // 3. Grab top 2 pages quickly (parallel, 5s timeout)
  ctx.emit({ type: 'stage-enter', stage: 'extract', detail: 'Reading top results...' });
  const topResults = searchResults.slice(0, 2);
  const pageContents = await Promise.allSettled(
    topResults.map(r => webFetchPage(r.url, { timeout: 5_000 }).catch(() => ''))
  );

  const context = topResults.map((r, i) => {
    const content = pageContents[i].status === 'fulfilled' ? (pageContents[i] as any).value : '';
    const snippet = content ? content.slice(0, 3_000) : r.snippet;
    return `[${i + 1}] ${r.title} (${r.url})\n${snippet}`;
  }).join('\n\n');

  // 4. Direct LLM answer — no verify, no reason, no compose overhead
  ctx.emit({ type: 'stage-enter', stage: 'compose', detail: 'Answering...' });
  let answer: string;
  try {
    const response = await llmCall(
      [{ role: 'system', content: INSTANT_PROMPT },
       { role: 'user', content: `Question: ${ctx.query}\n\nSearch results:\n${context}` }],
      { tier: 'fast', keys: ctx.keys, timeout: 10_000 }
    );
    answer = response.content;
  } catch {
    answer = searchResults.length > 0
      ? searchResults.map(r => `**${r.title}**: ${r.snippet}`).join('\n\n')
      : 'Could not find an answer. Try a deeper search.';
  }

  // Build minimal claims from search results
  const claims: VerifiedClaim[] = topResults.map(r => ({
    claim: r.snippet,
    source_url: r.url,
    source_quality: 0.5,
    claim_type: 'qualitative' as const,
    confidence: 0.5,
    verified_confidence: 0.5,
    agreement_score: 0.5,
    disputed: false,
  }));

  const report: ResearchReport = {
    query: ctx.query,
    depth: 'instant',
    executive_summary: answer.slice(0, 500),
    findings: answer,
    limitations: 'Instant mode: single search, no verification. Use standard/deep for critical decisions.',
    sources: topResults.map((r, i) => ({ url: r.url, title: r.title || `Source ${i + 1}`, quality: 0.5 })),
    overall_confidence: 0.5,
    claims,
  };

  // 5. Store (lightweight, non-blocking)
  ctx.emit({ type: 'stage-enter', stage: 'store', detail: 'Caching...' });
  stageStore(ctx, report, claims, Date.now() - startTime).catch(() => {});

  ctx.emit({ type: 'done', report_id: 0, overall_confidence: report.overall_confidence });
  return report;
}
