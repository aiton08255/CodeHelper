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

  // If RECALL has enough high-confidence claims, skip search entirely
  if (priorKnowledge.length >= 5 && priorKnowledge.every(c => c.confidence > 0.7)) {
    ctx.emit({ type: 'stage-progress', stage: 'recall', progress: 100, detail: `Found ${priorKnowledge.length} cached claims, skipping search` });
    const cachedClaims: VerifiedClaim[] = priorKnowledge.map(c => ({
      ...c, verified_confidence: c.confidence, agreement_score: 0.8, disputed: false,
    }));
    const outline = await stageReason(ctx, cachedClaims);
    const report = await stageCompose(ctx, outline, cachedClaims);
    ctx.emit({ type: 'done', report_id: 0, overall_confidence: report.overall_confidence });
    return report;
  }

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

    // Deduplicate claims before verification (fixes redundancy issue)
    allClaims = deduplicateClaims(allClaims);

    ctx.emit({ type: 'stage-enter', stage: 'verify', detail: `Verifying ${allClaims.length} unique claims...` });
    allClaims = await stageVerify(ctx, allClaims);

    ctx.emit({ type: 'stage-enter', stage: 'gapfill', detail: 'Checking for gaps...' });
    const { newClaims: gapClaims, shouldExit } = await stageGapFill(ctx, allClaims, plan);
    allClaims.push(...gapClaims);

    if (shouldExit) break;
  }

  // Final deduplication pass
  allClaims = deduplicateClaims(allClaims);

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

/**
 * Deduplicates claims by semantic similarity (simple: normalize and compare).
 * Keeps the claim with the highest confidence when duplicates found.
 * Boosts confidence when multiple sources agree (agreement signal).
 */
function deduplicateClaims(claims: VerifiedClaim[]): VerifiedClaim[] {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  const seen = new Map<string, VerifiedClaim>();

  for (const claim of claims) {
    const key = normalize(claim.claim);
    // Check for exact or near-exact duplicates (first 80 chars match)
    const shortKey = key.slice(0, 140);
    const existing = seen.get(shortKey);

    if (existing) {
      // Multiple sources agree — boost confidence
      if (claim.source_url !== existing.source_url) {
        existing.agreement_score = Math.min(1.0, (existing.agreement_score || 0.5) + 0.2);
        existing.verified_confidence = Math.min(0.95, Math.max(existing.verified_confidence, claim.verified_confidence) + 0.05);
      }
      // Keep the higher-confidence version
      if (claim.verified_confidence > existing.verified_confidence) {
        seen.set(shortKey, { ...claim, agreement_score: existing.agreement_score });
      }
    } else {
      seen.set(shortKey, claim);
    }
  }

  return [...seen.values()];
}
