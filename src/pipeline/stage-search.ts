import { SearchResult } from '../providers/types.js';
import { ResearchPlan } from './types.js';
import type { PipelineContext } from './orchestrator.js';

export async function stageSearch(ctx: PipelineContext, plan: ResearchPlan): Promise<SearchResult[]> {
  // TODO: Execute parallel searches across providers using Promise.allSettled
  return [];
}
