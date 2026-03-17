import { VerifiedClaim } from './types.js';
import { TriagedSource } from './stage-triage.js';
import type { PipelineContext } from './orchestrator.js';
import { webFetchPage } from '../providers/webfetch.js';
import { llmCall } from '../providers/llm.js';
import { extractJsonArray } from '../utils/safe-json.js';

const EXTRACT_PROMPT = `Extract factual claims from content relevant to the query. Max 10 per source.
Be specific: exact numbers, dates, versions, benchmarks. Include context/conditions.
Types: quantitative(numbers), qualitative(properties), opinion(viewpoint), procedural(how-to).
Return JSON array only: [{"claim":"...", "claim_type":"...", "confidence":0.5-0.9, "date":"YYYY-MM|null"}]`;

export async function stageExtract(ctx: PipelineContext, sources: TriagedSource[]): Promise<VerifiedClaim[]> {
  const allClaims: VerifiedClaim[] = [];

  const extractPromises = sources.map(async (source) => {
    try {
      const content = await webFetchPage(source.url, { timeout: 10_000 });
      if (!content || content.length < 100) return [];

      const truncated = content.slice(0, 25_000);
      const prompt = `Query: "${ctx.query}"\n\nSource URL: ${source.url}\nSource content:\n${truncated}`;

      const response = await llmCall(
        [{ role: 'system', content: EXTRACT_PROMPT }, { role: 'user', content: prompt }],
        { tier: 'fast', keys: ctx.keys, timeout: 15_000 }
      );

      const rawClaims = extractJsonArray(response.content);
      if (!rawClaims) return [];

      return rawClaims.map((c: any) => ({
        claim: c.claim,
        source_url: source.url,
        source_quality: source.quality_score,
        date: c.date,
        claim_type: c.claim_type || 'qualitative',
        confidence: Math.min(0.9, c.confidence || 0.5),
        verified_confidence: 0,
        agreement_score: 0,
        disputed: false,
      } as VerifiedClaim));
    } catch (err) {
      ctx.emit({ type: 'error', message: `Extract failed for ${source.url}: ${(err as Error).message}`, recoverable: true });
      return [];
    }
  });

  const results = await Promise.allSettled(extractPromises);
  for (const result of results) {
    if (result.status === 'fulfilled') {
      for (const claim of result.value) {
        allClaims.push(claim);
        ctx.emit({ type: 'claim-extracted', claim: claim.claim, confidence: claim.confidence });
      }
    }
  }

  return allClaims;
}
