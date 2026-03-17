import { Claim } from './types.js';
import type { PipelineContext } from './orchestrator.js';
import { searchClaimsByTags, searchClaimsFTS } from '../memory/claims.js';

export async function stageRecall(ctx: PipelineContext): Promise<Claim[]> {
  // Extract keywords from query for tag-based search
  const stopWords = new Set(['what', 'how', 'why', 'when', 'where', 'is', 'are', 'the', 'a', 'an', 'in', 'of', 'to', 'and', 'or', 'for', 'with', 'does', 'do', 'can', 'vs', 'versus']);
  const tags = ctx.query
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));

  if (tags.length === 0) return [];

  // Try tag-based search first (fast)
  let results = searchClaimsByTags(tags);

  // If few results, try FTS5 full-text search
  if (results.length < 3) {
    const ftsResults = searchClaimsFTS(ctx.query);
    // Merge, deduplicate by claim text
    const seen = new Set(results.map(r => r.claim_text));
    for (const r of ftsResults) {
      if (!seen.has(r.claim_text)) {
        results.push({
          claim: r.claim_text,
          source_url: r.source_url || '',
          source_quality: r.source_quality || 0.5,
          claim_type: r.claim_type as any,
          confidence: r.confidence,
        });
      }
    }
  }

  // Convert ClaimRow to Claim format
  return results.map(r => {
    if ('claim' in r) return r as unknown as Claim;
    return {
      claim: (r as any).claim_text || '',
      source_url: (r as any).source_url || '',
      source_quality: (r as any).source_quality || 0.5,
      claim_type: (r as any).claim_type || 'qualitative',
      confidence: (r as any).confidence || 0.5,
    } as Claim;
  });
}
