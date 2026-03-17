import { ResearchPlan, ResearchReport, VerifiedClaim, ReasoningOutline, WSEmitter } from './types.js';
import { stageRecall } from './stage-recall.js';
import { stagePlan } from './stage-plan.js';
import { stageSearch } from './stage-search.js';
import { stageTriage } from './stage-triage.js';
import { stageExtract } from './stage-extract.js';
import { stageVerify } from './stage-verify.js';
import { stageGapFill } from './stage-gapfill.js';
import { stageReason } from './stage-reason.js';
import { stageCompose } from './stage-compose.js';
import { stageStore } from './stage-store.js';

export interface PipelineContext {
  query: string;
  depth: 'quick' | 'standard' | 'deep';
  emit: WSEmitter;
  keys: Record<string, string>;
}

const MAX_LOOPS: Record<string, number> = { quick: 1, standard: 2, deep: 3 };

export async function runPipeline(ctx: PipelineContext): Promise<ResearchReport> {
  const startTime = Date.now();

  // Stage 0: RECALL
  ctx.emit({ type: 'stage-enter', stage: 'recall', detail: 'Checking knowledge base...' });
  const priorKnowledge = await stageRecall(ctx);

  // Stage 1: PLAN
  ctx.emit({ type: 'stage-enter', stage: 'plan', detail: 'Decomposing query...' });
  const plan = await stagePlan(ctx, priorKnowledge);

  let allClaims: VerifiedClaim[] = [];
  const maxLoops = MAX_LOOPS[ctx.depth] || 2;

  // Stages 2-6: Research loop
  for (let loop = 0; loop < maxLoops; loop++) {
    ctx.emit({ type: 'stage-enter', stage: 'search', detail: `Search loop ${loop + 1}/${maxLoops}` });
    const searchResults = await stageSearch(ctx, plan);

    ctx.emit({ type: 'stage-enter', stage: 'triage', detail: 'Scoring sources...' });
    const triaged = await stageTriage(ctx, searchResults);

    ctx.emit({ type: 'stage-enter', stage: 'extract', detail: `Reading ${triaged.length} sources...` });
    const newClaims = await stageExtract(ctx, triaged);
    allClaims.push(...newClaims);

    ctx.emit({ type: 'stage-enter', stage: 'verify', detail: 'Cross-referencing...' });
    allClaims = await stageVerify(ctx, allClaims);

    ctx.emit({ type: 'stage-enter', stage: 'gapfill', detail: 'Checking for gaps...' });
    const { newClaims: gapClaims, shouldExit } = await stageGapFill(ctx, allClaims, plan);
    allClaims.push(...gapClaims);

    if (shouldExit) break;
  }

  // Stage 7: REASON
  ctx.emit({ type: 'stage-enter', stage: 'reason', detail: 'Building argument...' });
  const outline = await stageReason(ctx, allClaims);

  // Stage 8: COMPOSE
  ctx.emit({ type: 'stage-enter', stage: 'compose', detail: 'Writing report...' });
  const report = await stageCompose(ctx, outline, allClaims);

  // Stage 9: STORE
  ctx.emit({ type: 'stage-enter', stage: 'store', detail: 'Saving to knowledge base...' });
  await stageStore(ctx, report, allClaims, Date.now() - startTime);

  ctx.emit({ type: 'done', report_id: 0, overall_confidence: report.overall_confidence });
  return report;
}
