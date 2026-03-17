import { VerifiedClaim, ResearchPlan } from './types.js';
import type { PipelineContext } from './orchestrator.js';
import { groqChat } from '../providers/groq.js';
import { pollinationsChat } from '../providers/pollinations.js';
import { executeSearch } from '../providers/router.js';
import { incrementQuota } from '../quotas/tracker.js';

let previousNewClaimCounts: number[] = [];

const GAPFILL_PROMPT = `Given a research query and the claims found so far, identify what's still missing.

Generate 1-3 reformulated search queries to fill the gaps. Use different strategies:
- Try synonyms or alternative phrasings
- Broaden or narrow the scope
- Target specific authoritative sources

Return JSON:
{
  "gaps": ["description of what's missing"],
  "queries": ["reformulated search query 1", "query 2"]
}

If the claims already cover the topic well, return:
{ "gaps": [], "queries": [] }`;

export async function stageGapFill(
  ctx: PipelineContext,
  claims: VerifiedClaim[],
  plan: ResearchPlan
): Promise<{ newClaims: VerifiedClaim[]; shouldExit: boolean }> {
  // Quick depth never does gap-fill
  if (ctx.depth === 'quick') return { newClaims: [], shouldExit: true };

  const highConfidenceClaims = claims.filter(c => c.verified_confidence > 0.6);
  const claimsSummary = highConfidenceClaims.map(c => `- ${c.claim}`).join('\n');

  let gaps: any;
  try {
    const response = ctx.keys.groq
      ? await groqChat(
          [{ role: 'system', content: GAPFILL_PROMPT },
           { role: 'user', content: `Query: "${ctx.query}"\n\nClaims found:\n${claimsSummary}` }],
          ctx.keys.groq,
          { timeout: 10_000 }
        )
      : await pollinationsChat(
          [{ role: 'system', content: GAPFILL_PROMPT },
           { role: 'user', content: `Query: "${ctx.query}"\n\nClaims found:\n${claimsSummary}` }],
          'openai-fast',
          { timeout: 15_000 }
        );

    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    gaps = jsonMatch ? JSON.parse(jsonMatch[0]) : { gaps: [], queries: [] };
  } catch {
    gaps = { gaps: [], queries: [] };
  }

  // No gaps identified — exit
  if (!gaps.queries?.length) return { newClaims: [], shouldExit: true };

  // Execute reformulated searches
  const newClaims: VerifiedClaim[] = [];
  for (const query of gaps.queries.slice(0, 3)) {
    try {
      const results = await executeSearch('duckduckgo', query, ctx.keys);
      incrementQuota('duckduckgo');
      // Convert search results to basic claims (they'll get properly extracted in next loop iteration)
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
    } catch {}
  }

  // Diminishing returns detection (relaxed)
  previousNewClaimCounts.push(newClaims.length);
  if (previousNewClaimCounts.length >= 2) {
    const recent = previousNewClaimCounts.slice(-2);
    const totalExisting = claims.length || 1;
    const newPct = recent.reduce((a, b) => a + b, 0) / totalExisting;
    // Exit if less than 15% new claims for 2 consecutive iterations
    if (newPct < 0.15) {
      previousNewClaimCounts = [];
      return { newClaims, shouldExit: true };
    }
  }

  return { newClaims, shouldExit: false };
}
