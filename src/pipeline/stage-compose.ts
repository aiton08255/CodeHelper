import { VerifiedClaim, ReasoningOutline, ResearchReport } from './types.js';
import type { PipelineContext } from './orchestrator.js';

export async function stageCompose(
  ctx: PipelineContext,
  outline: ReasoningOutline,
  claims: VerifiedClaim[]
): Promise<ResearchReport> {
  // TODO: Write final report via Mistral with adaptive format
  return {
    query: ctx.query,
    depth: ctx.depth,
    executive_summary: 'Research in progress...',
    findings: claims.map(c => `- ${c.claim} [confidence: ${c.confidence}]`).join('\n'),
    limitations: 'Stub implementation — full pipeline not yet connected.',
    sources: claims.map(c => ({ url: c.source_url, title: '', quality: c.source_quality })),
    overall_confidence: outline.overall_confidence,
    claims,
  };
}
