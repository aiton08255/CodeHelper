import { ResearchPlan, Claim } from './types.js';
import type { PipelineContext } from './orchestrator.js';

export async function stagePlan(ctx: PipelineContext, priorKnowledge: Claim[]): Promise<ResearchPlan> {
  // TODO: Send to Groq to decompose query into sub-questions with strategies
  return {
    intent: 'factual',
    sub_questions: [{ question: ctx.query, strategy: 'keyword', provider: 'duckduckgo', temporal: 'any', confidence_required: 0.7 }],
    budget: { duckduckgo: 2, exa: 1 },
    depth: ctx.depth,
  };
}
