import { Claim } from './types.js';
import type { PipelineContext } from './orchestrator.js';
import { searchClaimsByTags, searchClaimsFTS, ClaimRow } from '../memory/claims.js';

function claimRowToClaim(r: ClaimRow): Claim {
  return {
    claim: r.claim_text,
    source_url: r.source_url || '',
    source_quality: r.source_quality || 0.5,
    claim_type: (r.claim_type || 'qualitative') as Claim['claim_type'],
    confidence: r.confidence,
  };
}

export async function stageRecall(ctx: PipelineContext): Promise<Claim[]> {
  const stopWords = new Set(['what', 'how', 'why', 'when', 'where', 'is', 'are', 'the', 'a', 'an', 'in', 'of', 'to', 'and', 'or', 'for', 'with', 'does', 'do', 'can', 'vs', 'versus']);
  const tags = ctx.query
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));

  if (tags.length === 0) return [];

  // Try tag-based search first
  const tagResults = searchClaimsByTags(tags);
  const results: Claim[] = tagResults.map(claimRowToClaim);

  // If few results, supplement with FTS5
  if (results.length < 3) {
    const ftsResults = searchClaimsFTS(ctx.query);
    const seen = new Set(results.map(r => r.claim));
    for (const r of ftsResults) {
      const claim = claimRowToClaim(r);
      if (!seen.has(claim.claim)) {
        results.push(claim);
        seen.add(claim.claim);
      }
    }
  }

  return results;
}
