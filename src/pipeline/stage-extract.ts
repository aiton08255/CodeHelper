import { VerifiedClaim } from './types.js';
import { TriagedSource } from './stage-triage.js';
import type { PipelineContext } from './orchestrator.js';

export async function stageExtract(ctx: PipelineContext, sources: TriagedSource[]): Promise<VerifiedClaim[]> {
  // TODO: Fetch full pages via webfetch, extract structured claims via LLM
  return [];
}
