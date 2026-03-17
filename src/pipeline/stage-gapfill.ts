import { VerifiedClaim, ResearchPlan } from './types.js';
import type { PipelineContext } from './orchestrator.js';

export async function stageGapFill(
  ctx: PipelineContext,
  claims: VerifiedClaim[],
  plan: ResearchPlan
): Promise<{ newClaims: VerifiedClaim[]; shouldExit: boolean }> {
  // TODO: Identify gaps, reformulate queries, detect diminishing returns
  return { newClaims: [], shouldExit: true };
}
