import { VerifiedClaim, ReasoningOutline } from './types.js';
import type { PipelineContext } from './orchestrator.js';

export async function stageReason(ctx: PipelineContext, claims: VerifiedClaim[]): Promise<ReasoningOutline> {
  // TODO: Build argument structure via Pollinations deepseek
  return {
    narrative_type: 'factual',
    ranked_findings: claims.map(c => ({ finding: c.claim, confidence: c.confidence })),
    caveats: [],
    overall_confidence: claims.length > 0 ? claims.reduce((s, c) => s + c.confidence, 0) / claims.length : 0,
  };
}
