import { VerifiedClaim, ReasoningOutline } from './types.js';
import type { PipelineContext } from './orchestrator.js';
import { llmCall } from '../providers/llm.js';
import { extractJsonObject } from '../utils/safe-json.js';

const REASON_PROMPT = `Analyze verified claims. Pick narrative(chronological/comparison/problem_solution/pros_cons/factual), rank findings by importance, list caveats, assign confidence 0.3-0.95.
JSON: {"narrative_type":"...", "ranked_findings":[{"finding":"...", "confidence":0.85}], "caveats":["..."], "overall_confidence":0.78}`;

export async function stageReason(ctx: PipelineContext, claims: VerifiedClaim[]): Promise<ReasoningOutline> {
  if (claims.length === 0) {
    return { narrative_type: 'factual', ranked_findings: [], caveats: ['No claims found'], overall_confidence: 0 };
  }

  const claimsSummary = claims.map(c =>
    `- "${c.claim}" [confidence: ${c.verified_confidence}, ${c.disputed ? 'DISPUTED' : 'agreed'}]`
  ).join('\n');

  try {
    const response = await llmCall(
      [{ role: 'system', content: REASON_PROMPT },
       { role: 'user', content: `Query: "${ctx.query}"\n\nVerified claims:\n${claimsSummary}` }],
      { tier: 'reason', keys: ctx.keys, timeout: 30_000 }
    );

    const parsed = extractJsonObject(response.content);
    if (parsed) {
      return {
        narrative_type: ((parsed.narrative_type as string) || 'factual') as ReasoningOutline['narrative_type'],
        ranked_findings: (parsed.ranked_findings as any[]) || [],
        caveats: (parsed.caveats as string[]) || [],
        overall_confidence: Math.min(0.95, (parsed.overall_confidence as number) || 0.5),
      };
    }
  } catch (err) {
    ctx.emit({ type: 'error', message: `Reasoning failed: ${(err as Error).message}`, recoverable: true });
  }

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
