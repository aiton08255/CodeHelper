import { SearchResult } from '../providers/types.js';

export interface SubQuestion {
  question: string;
  strategy: 'semantic' | 'keyword' | 'news' | 'docs' | 'crawl' | 'reason';
  provider: string;
  temporal: 'recent' | 'any';
  confidence_required: number;
}

export interface ResearchPlan {
  intent: 'factual' | 'comparison' | 'trend' | 'technical' | 'opinion';
  sub_questions: SubQuestion[];
  budget: Record<string, number>;
  depth: 'quick' | 'standard' | 'deep';
}

export interface Claim {
  claim: string;
  source_url: string;
  source_quality: number;
  date?: string;
  claim_type: 'quantitative' | 'qualitative' | 'opinion' | 'procedural';
  confidence: number;
}

export interface VerifiedClaim extends Claim {
  verified_confidence: number;
  agreement_score: number;
  disputed: boolean;
  conflicting_claims?: Claim[];
}

export interface TrìagedSource extends SearchResult {
  quality_score: number;
  domain_tier: 'high' | 'medium' | 'low';
  freshness_score: number;
}

export interface ResearchReport {
  query: string;
  depth: string;
  executive_summary: string;
  findings: string;
  limitations: string;
  sources: { url: string; title: string; quality: number }[];
  overall_confidence: number;
  claims: VerifiedClaim[];
}

export interface ReasoningOutline {
  narrative_type: 'chronological' | 'comparison' | 'problem_solution' | 'pros_cons' | 'factual';
  ranked_findings: { finding: string; confidence: number }[];
  caveats: string[];
  overall_confidence: number;
}

export interface StageResult {
  stage: string;
  success: boolean;
  data: any;
  duration_ms: number;
}

export type WSEmitter = (msg: any) => void;
