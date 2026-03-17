import { SearchResult } from '../providers/types.js';
import type { PipelineContext } from './orchestrator.js';

export interface TriagedSource extends SearchResult {
  quality_score: number;
}

export async function stageTriage(ctx: PipelineContext, results: SearchResult[]): Promise<TriagedSource[]> {
  // TODO: Score sources by domain authority, freshness, content type. Return top N.
  return results.map(r => ({ ...r, quality_score: 0.5 }));
}
