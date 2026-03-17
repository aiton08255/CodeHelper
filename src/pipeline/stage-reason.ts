import { VerifiedClaim, ReasoningOutline } from './types.js';
import type { PipelineContext } from './orchestrator.js';
import { pollinationsChat } from '../providers/pollinations.js';
import { groqChat } from '../providers/groq.js';
import { incrementQuota } from '../quotas/tracker.js';

const REASON_PROMPT = `You are a research analyst. Given verified claims about a topic, build a structured analysis.

Determine:
1. The best narrative structure (chronological, comparison, problem_solution, pros_cons, factual)
2. Rank findings by importance and confidence
3. Identify caveats or limitations
4. Assign overall confidence (0.3-0.95)

Return JSON:
{
  "narrative_type": "comparison",
  "ranked_findings": [
    { "finding": "key insight", "confidence": 0.85 }
  ],
  "caveats": ["limitation 1"],
  "overall_confidence": 0.78
}`;

export async function stageReason(ctx: PipelineContext, claims: VerifiedClaim[]): Promise<ReasoningOutline> {
  if (claims.length === 0) {
    return { narrative_type: 'factual', ranked_findings: [], caveats: ['No claims found'], overall_confidence: 0 };
  }

  const claimsSummary = claims.map(c =>
    `- "${c.claim}" [confidence: ${c.verified_confidence}, ${c.disputed ? 'DISPUTED' : 'agreed'}]`
  ).join('\n');

  try {
    let response;
    try {
      response = await pollinationsChat(
        [{ role: 'system', content: REASON_PROMPT },
         { role: 'user', content: `Query: "${ctx.query}"\n\nVerified claims:\n${claimsSummary}` }],
        'deepseek',
        { timeout: 30_000 }
      );
      incrementQuota('pollinations');
    } catch {
      if (ctx.keys.groq) {
        response = await groqChat(
          [{ role: 'system', content: REASON_PROMPT },
           { role: 'user', content: `Query: "${ctx.query}"\n\nVerified claims:\n${claimsSummary}` }],
          ctx.keys.groq,
          { timeout: 20_000 }
        );
        incrementQuota('groq');
      } else {
        throw new Error('No reasoning provider available');
      }
    }

    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        narrative_type: parsed.narrative_type || 'factual',
        ranked_findings: parsed.ranked_findings || [],
        caveats: parsed.caveats || [],
        overall_confidence: Math.min(0.95, parsed.overall_confidence || 0.5),
      };
    }
  } catch {}

  // Fallback: basic outline from claims
  return {
    narrative_type: 'factual',
    ranked_findings: claims
      .sort((a, b) => b.verified_confidence - a.verified_confidence)
      .map(c => ({ finding: c.claim, confidence: c.verified_confidence })),
    caveats: claims.some(c => c.disputed) ? ['Some findings are disputed across sources'] : [],
    overall_confidence: claims.reduce((s, c) => s + c.verified_confidence, 0) / claims.length,
  };
}
