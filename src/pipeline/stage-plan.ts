import { ResearchPlan, Claim, SubQuestion } from './types.js';
import type { PipelineContext } from './orchestrator.js';
import { groqChat } from '../providers/groq.js';
import { pollinationsChat } from '../providers/pollinations.js';
import { canAfford } from '../quotas/tracker.js';

const PLAN_PROMPT = `You are a research planner. Given a query, decompose it into 2-5 sub-questions that together would fully answer the query.

For each sub-question, assign:
- strategy: one of "semantic", "keyword", "news", "docs", "crawl", "reason"
- temporal: "recent" if needs current data, "any" if established knowledge is fine

Classify the overall query intent as: factual, comparison, trend, technical, or opinion

Respond in JSON only:
{
  "intent": "factual|comparison|trend|technical|opinion",
  "sub_questions": [
    { "question": "...", "strategy": "keyword", "temporal": "any" }
  ]
}`;

const STRATEGY_TO_PROVIDER: Record<string, string> = {
  semantic: 'exa',
  keyword: 'duckduckgo',
  news: 'duckduckgo:news',
  docs: 'duckduckgo',
  crawl: 'webfetch',
  reason: 'pollinations:gemini-search',
};

export async function stagePlan(ctx: PipelineContext, priorKnowledge: Claim[]): Promise<ResearchPlan> {
  const priorContext = priorKnowledge.length > 0
    ? `\n\nI already know these facts (skip searching for these):\n${priorKnowledge.map(c => `- ${c.claim} [confidence: ${c.confidence}]`).join('\n')}`
    : '';

  let parsed: any;

  try {
    const response = ctx.keys.groq
      ? await groqChat(
          [{ role: 'system', content: PLAN_PROMPT }, { role: 'user', content: ctx.query + priorContext }],
          ctx.keys.groq,
          { timeout: 10_000 }
        )
      : await pollinationsChat(
          [{ role: 'system', content: PLAN_PROMPT }, { role: 'user', content: ctx.query + priorContext }],
          'openai-fast',
          { timeout: 15_000 }
        );

    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
  } catch {
    parsed = null;
  }

  if (!parsed || !parsed.sub_questions?.length) {
    parsed = {
      intent: 'factual',
      sub_questions: [{ question: ctx.query, strategy: 'keyword', temporal: 'any' }],
    };
  }

  const sub_questions: SubQuestion[] = parsed.sub_questions.map((sq: any) => ({
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
    intent: parsed.intent || 'factual',
    sub_questions,
    budget: {},
    depth: ctx.depth,
  };
}
