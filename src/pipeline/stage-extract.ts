import { VerifiedClaim } from './types.js';
import { TriagedSource } from './stage-triage.js';
import type { PipelineContext } from './orchestrator.js';
import { webFetchPage } from '../providers/webfetch.js';
import { groqChat } from '../providers/groq.js';
import { pollinationsChat } from '../providers/pollinations.js';
import { incrementQuota } from '../quotas/tracker.js';

const EXTRACT_PROMPT = `Extract key claims from this web page content related to the research query.

Return a JSON array of claims:
[
  {
    "claim": "specific factual statement",
    "claim_type": "quantitative|qualitative|opinion|procedural",
    "confidence": 0.5-0.9,
    "date": "YYYY-MM or null"
  }
]

Rules:
- Extract only claims directly relevant to the query
- Be specific — include numbers, names, versions
- Set confidence based on how clearly the source states the claim
- Max 8 claims per source
- Return valid JSON only`;

export async function stageExtract(ctx: PipelineContext, sources: TriagedSource[]): Promise<VerifiedClaim[]> {
  const allClaims: VerifiedClaim[] = [];

  // Fetch and extract from each source in parallel
  const extractPromises = sources.map(async (source) => {
    try {
      // Fetch page content
      const content = await webFetchPage(source.url, { timeout: 10_000 });
      if (!content || content.length < 100) return [];

      // Truncate to avoid token limits
      const truncated = content.slice(0, 15_000);

      const prompt = `Query: "${ctx.query}"\n\nSource URL: ${source.url}\nSource content:\n${truncated}`;

      // Use Groq for speed, fall back to Pollinations
      let response;
      try {
        if (ctx.keys.groq) {
          response = await groqChat(
            [{ role: 'system', content: EXTRACT_PROMPT }, { role: 'user', content: prompt }],
            ctx.keys.groq,
            { timeout: 15_000 }
          );
          incrementQuota('groq');
        } else {
          throw new Error('no groq key');
        }
      } catch {
        response = await pollinationsChat(
          [{ role: 'system', content: EXTRACT_PROMPT }, { role: 'user', content: prompt }],
          'openai-fast',
          { timeout: 20_000 }
        );
        incrementQuota('pollinations');
      }

      // Parse claims from response
      const jsonMatch = response.content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return [];

      const rawClaims = JSON.parse(jsonMatch[0]);
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
