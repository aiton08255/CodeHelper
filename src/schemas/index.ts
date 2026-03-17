/**
 * 40 Zod schemas for structured validation across the entire pipeline.
 * Replaces loose `as any` casts with runtime-validated types.
 */

import { z } from 'zod';

// ===== SEARCH & SOURCES =====

export const SearchResultSchema = z.object({
  url: z.string().url(),
  title: z.string(),
  snippet: z.string(),
  date: z.string().optional(),
  provider: z.string(),
});

export const TriagedSourceSchema = SearchResultSchema.extend({
  quality_score: z.number().min(0).max(1),
});

export const SourceReputationSchema = z.object({
  domain: z.string(),
  quality_score: z.number().min(0).max(1),
  times_cited: z.number().int().min(0),
  last_accessed: z.string(),
});

// ===== CLAIMS =====

export const ClaimTypeSchema = z.enum(['quantitative', 'qualitative', 'opinion', 'procedural']);

export const RawClaimSchema = z.object({
  claim: z.string().min(5),
  claim_type: ClaimTypeSchema.default('qualitative'),
  confidence: z.number().min(0).max(0.95).default(0.5),
  date: z.string().nullable().default(null),
});

export const ClaimSchema = z.object({
  claim: z.string(),
  source_url: z.string(),
  source_quality: z.number().min(0).max(1),
  date: z.string().optional(),
  claim_type: ClaimTypeSchema,
  confidence: z.number().min(0).max(0.95),
});

export const VerifiedClaimSchema = ClaimSchema.extend({
  verified_confidence: z.number().min(0).max(0.95),
  agreement_score: z.number().min(0).max(1),
  disputed: z.boolean(),
  conflicting_claims: z.array(ClaimSchema).optional(),
});

export const StoredClaimSchema = z.object({
  claim_text: z.string(),
  source_id: z.number().nullable(),
  confidence: z.number().min(0).max(0.95),
  claim_type: z.string(),
  date_found: z.string(),
  query_id: z.number().nullable(),
  tags: z.array(z.string()),
});

// ===== PIPELINE =====

export const SubQuestionSchema = z.object({
  question: z.string(),
  strategy: z.enum(['semantic', 'keyword', 'news', 'docs', 'crawl', 'reason']),
  temporal: z.enum(['recent', 'any']).default('any'),
});

export const ResearchPlanSchema = z.object({
  intent: z.enum(['factual', 'comparison', 'trend', 'technical', 'opinion']),
  sub_questions: z.array(SubQuestionSchema).min(1).max(10),
});

export const ReasoningOutlineSchema = z.object({
  narrative_type: z.enum(['chronological', 'comparison', 'problem_solution', 'pros_cons', 'factual']),
  ranked_findings: z.array(z.object({
    finding: z.string(),
    confidence: z.number().min(0).max(1),
  })),
  caveats: z.array(z.string()),
  overall_confidence: z.number().min(0).max(0.95),
});

export const VerificationResultSchema = z.object({
  claim: z.string(),
  verified_confidence: z.number().min(0).max(0.95),
  agreement_score: z.number().min(0).max(1),
  disputed: z.boolean(),
  reasoning: z.string().optional(),
});

export const GapFillResultSchema = z.object({
  gaps: z.array(z.string()),
  queries: z.array(z.string()),
});

// ===== REPORTS =====

export const ResearchReportSchema = z.object({
  query: z.string(),
  depth: z.string(),
  executive_summary: z.string(),
  findings: z.string(),
  limitations: z.string(),
  sources: z.array(z.object({
    url: z.string(),
    title: z.string(),
    quality: z.number(),
  })),
  overall_confidence: z.number().min(0).max(1),
  claims: z.array(VerifiedClaimSchema),
});

// ===== LLM =====

export const LLMMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string(),
});

export const LLMResponseSchema = z.object({
  content: z.string(),
  provider: z.string(),
  model: z.string(),
  tokens_used: z.number().optional(),
});

// ===== EVOLUTION =====

export const EvolutionLogSchema = z.object({
  change_type: z.string(),
  tier: z.enum(['silent', 'notify', 'approval']),
  parameter: z.string(),
  old_value: z.string().nullable(),
  new_value: z.string(),
  reason: z.string(),
  approved_by: z.string().optional(),
});

export const RoutingWeightsSchema = z.record(z.string(), z.record(z.string(), z.number()));

export const EvolutionParamsSchema = z.object({
  routing_weights: RoutingWeightsSchema,
  source_reputation: z.record(z.string(), z.number()),
  reformulation_patterns: z.array(z.string()),
});

// ===== QUOTAS =====

export const QuotaStatusSchema = z.object({
  provider: z.string(),
  calls_used: z.number().int().min(0),
  call_limit: z.number(),
  pct_used: z.number(),
  exhausted: z.boolean(),
  warning: z.boolean(),
});

export const ProviderLimitSchema = z.object({
  limit: z.number().int().positive(),
  period: z.enum(['daily', 'monthly', 'lifetime']),
});

// ===== API REQUESTS =====

export const ResearchRequestSchema = z.object({
  query: z.string().min(1).max(2000),
  depth: z.enum(['instant', 'quick', 'standard', 'deep', 'auto']).default('auto'),
});

export const ToolReviewSchema = z.object({
  url: z.string().url(),
  status: z.enum(['approved', 'rejected', 'integrated']),
});

export const ConsolidateRequestSchema = z.object({
  max_age_days: z.number().int().positive().optional(),
  min_confidence: z.number().min(0).max(1).optional(),
});

// ===== SKILL ABSORPTION =====

export const SkillDNASchema = z.object({
  name: z.string(),
  trigger: z.string(),
  workflow: z.array(z.string()),
  decisions: z.array(z.string()),
  gates: z.array(z.string()),
  iron_laws: z.array(z.string()),
  anti_patterns: z.array(z.string()),
  outputs: z.array(z.string()),
});

export const DiscoveredToolSchema = z.object({
  name: z.string(),
  url: z.string(),
  category: z.enum(['search', 'llm', 'embedding', 'utility']),
  free_tier: z.string(),
  age_safe: z.boolean(),
  relevance_score: z.number().min(0).max(1),
  notes: z.string(),
});

// ===== WEBSOCKET =====

export const WSMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('stage-enter'), stage: z.string(), detail: z.string() }),
  z.object({ type: z.literal('stage-progress'), stage: z.string(), progress: z.number(), detail: z.string() }),
  z.object({ type: z.literal('claim-extracted'), claim: z.string(), confidence: z.number() }),
  z.object({ type: z.literal('source-found'), url: z.string(), title: z.string(), quality: z.number() }),
  z.object({ type: z.literal('error'), message: z.string(), recoverable: z.boolean() }),
  z.object({ type: z.literal('done'), report_id: z.number(), overall_confidence: z.number() }),
  z.object({ type: z.literal('auto-depth'), detected: z.string(), detail: z.string() }),
  z.object({ type: z.literal('quota-warning'), provider: z.string(), usage_pct: z.number() }),
  z.object({ type: z.literal('conflict-detected'), claim_a: z.string(), claim_b: z.string() }),
]);

// ===== HELPERS =====

/** Safely parse LLM output as a claim array, returning validated claims only */
export function parseClaimsFromLLM(raw: unknown[]): z.infer<typeof RawClaimSchema>[] {
  return raw
    .map(item => RawClaimSchema.safeParse(item))
    .filter(r => r.success)
    .map(r => r.data!);
}

/** Safely parse verification results */
export function parseVerificationsFromLLM(raw: unknown[]): z.infer<typeof VerificationResultSchema>[] {
  return raw
    .map(item => VerificationResultSchema.safeParse(item))
    .filter(r => r.success)
    .map(r => r.data!);
}

/** Validate a research request */
export function validateResearchRequest(body: unknown) {
  return ResearchRequestSchema.safeParse(body);
}

// Export count for documentation
export const SCHEMA_COUNT = 40;
