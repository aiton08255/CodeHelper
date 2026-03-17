import { VerifiedClaim, ResearchReport } from './types.js';
import type { PipelineContext } from './orchestrator.js';

export async function stageStore(
  ctx: PipelineContext,
  report: ResearchReport,
  claims: VerifiedClaim[],
  durationMs: number
): Promise<void> {
  // TODO: Insert claims, sources, query_log, reasoning_traces into SQLite
}
