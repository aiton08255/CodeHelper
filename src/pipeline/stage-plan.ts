import { ResearchPlan, Claim, SubQuestion } from './types.js';
import type { PipelineContext } from './orchestrator.js';
import { llmCall } from '../providers/llm.js';
import { canAfford } from '../quotas/tracker.js';
import { extractJsonObject } from '../utils/safe-json.js';

const PLAN_PROMPT = `Decompose query into 2-5 sub-questions. Assign strategy(semantic/keyword/news/docs/crawl/reason) and temporal(recent/any) to each. Classify intent: factual/comparison/trend/technical/opinion.
JSON only: {"intent":"...", "sub_questions":[{"question":"...", "strategy":"keyword", "temporal":"any"}]}`;

const STRATEGY_TO_PROVIDER: Record<string, string> = {
  semantic: 'exa',
  keyword: 'duckduckgo',
  news: 'duckduckgo:news',
  docs: 'exa',
  crawl: 'webfetch',
  reason: 'pollinations:gemini-search',
};

export async function stagePlan(ctx: PipelineContext, priorKnowledge: Claim[]): Promise<ResearchPlan> {
  const priorContext = priorKnowledge.length > 0
    ? `\n\nI already know these facts (skip searching for these):\n${priorKnowledge.map(c => `- ${c.claim} [confidence: ${c.confidence}]`).join('\n')}`
    : '';

  let parsed: Record<string, unknown> | null;

  try {
    const response = await llmCall(
      [{ role: 'system', content: PLAN_PROMPT }, { role: 'user', content: ctx.query + priorContext }],
      { tier: 'fast', keys: ctx.keys, timeout: 10_000 }
    );
    parsed = extractJsonObject(response.content);
  } catch {
    parsed = null;
  }

  if (!parsed || !(parsed.sub_questions as any[])?.length) {
    parsed = {
      intent: 'factual',
      sub_questions: [{ question: ctx.query, strategy: 'keyword', temporal: 'any' }],
    };
  }

  const sub_questions: SubQuestion[] = (parsed.sub_questions as any[]).map((sq: any) => ({
    question: sq.question,
    strategy: sq.strategy || 'keyword',
    provider: STRATEGY_TO_PROVIDER[sq.strategy] || 'duckduckgo',
    temporal: sq.temporal || 'any',
    confidence_required: 0.7,
  }));

  const { ok, warnings } = canAfford(ctx.depth);
  if (!ok) {
    ctx.emit({ type: 'quota-warning', provider: 'budget', usage_pct: 100 });
  }
  for (const w of warnings) {
    ctx.emit({ type: 'quota-warning', provider: w.split(':')[0], usage_pct: 80 });
  }

  return {
    intent: ((parsed.intent as string) || 'factual') as ResearchPlan['intent'],
    sub_questions,
    budget: {},
    depth: ctx.depth,
  };
}
