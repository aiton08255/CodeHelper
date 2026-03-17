import { Claim } from './types.js';
import type { PipelineContext } from './orchestrator.js';

export async function stageRecall(ctx: PipelineContext): Promise<Claim[]> {
  // TODO: Query claims + claim_tags tables, compute freshness, return matching high-confidence claims
  return [];
}
