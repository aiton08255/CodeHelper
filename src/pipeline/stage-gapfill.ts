import { VerifiedClaim, ResearchPlan } from './types.js';
import type { PipelineContext } from './orchestrator.js';
import { llmCall } from '../providers/llm.js';
import { executeSearch } from '../providers/router.js';
import { incrementQuota } from '../quotas/tracker.js';
import { extractJsonObject } from '../utils/safe-json.js';

// Per-pipeline tracking (keyed by query, not global)
const claimHistory = new Map<string, number[]>();

const GAPFILL_PROMPT = `Identify gaps in research claims. Generate 1-3 reformulated queries using synonyms, broader/narrower scope, or authoritative source targeting.
JSON: {"gaps":["missing topic"], "queries":["new query"]}. If complete: {"gaps":[], "queries":[]}`;

export async function stageGapFill(
  ctx: PipelineContext,
  claims: VerifiedClaim[],
  plan: ResearchPlan
): Promise<{ newClaims: VerifiedClaim[]; shouldExit: boolean }> {
  if (ctx.depth === 'quick') return { newClaims: [], shouldExit: true };

  const highConfidenceClaims = claims.filter(c => c.verified_confidence > 0.6);
  const claimsSummary = highConfidenceClaims.map(c => `- ${c.claim}`).join('\n');

  let gaps: Record<string, unknown>;
  try {
    const response = await llmCall(
      [{ role: 'system', content: GAPFILL_PROMPT },
       { role: 'user', content: `Query: "${ctx.query}"\n\nClaims found:\n${claimsSummary}` }],
      { tier: 'fast', keys: ctx.keys, timeout: 10_000 }
    );
    gaps = extractJsonObject(response.content) || { gaps: [], queries: [] };
  } catch {
    gaps = { gaps: [], queries: [] };
  }

  if (!(gaps.queries as string[])?.length) return { newClaims: [], shouldExit: true };

  const newClaims: VerifiedClaim[] = [];
  for (const query of (gaps.queries as string[]).slice(0, 3)) {
    try {
      const results = await executeSearch('duckduckgo', query, ctx.keys);
      incrementQuota('duckduckgo');
      for (const r of results.slice(0, 2)) {
        newClaims.push({
          claim: r.snippet,
          source_url: r.url,
          source_quality: 0.5,
          claim_type: 'qualitative',
          confidence: 0.4,
          verified_confidence: 0.3,
          agreement_score: 0,
          disputed: false,
        });
      }
    } catch (err) {
      ctx.emit({ type: 'error', message: `Gap-fill search failed: ${(err as Error).message}`, recoverable: true });
    }
  }

  // Diminishing returns detection (per-query, not global)
  const histKey = ctx.query;
  if (!claimHistory.has(histKey)) claimHistory.set(histKey, []);
  const history = claimHistory.get(histKey)!;
  history.push(newClaims.length);

  if (history.length >= 2) {
    const recent = history.slice(-2);
    const totalExisting = claims.length || 1;
    const newPct = recent.reduce((a, b) => a + b, 0) / totalExisting;
    if (newPct < 0.15) {
      claimHistory.delete(histKey);
      return { newClaims, shouldExit: true };
    }
  }

  return { newClaims, shouldExit: false };
}
