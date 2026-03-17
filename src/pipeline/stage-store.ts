import { VerifiedClaim, ResearchReport } from './types.js';
import type { PipelineContext } from './orchestrator.js';
import { getDb } from '../db/connection.js';
import { insertClaim } from '../memory/claims.js';
import { upsertSource } from '../memory/sources.js';
import { updateRoutingWeight } from '../evolution/params.js';

export async function stageStore(
  ctx: PipelineContext,
  report: ResearchReport,
  claims: VerifiedClaim[],
  durationMs: number
): Promise<void> {
  const db = getDb();

  // 1. Insert query log
  const queryResult = db.prepare(`
    INSERT INTO query_log (query_text, depth_level, total_searches, latency_ms, satisfaction_score)
    VALUES (?, ?, ?, ?, ?)
  `).run(ctx.query, ctx.depth, claims.length, durationMs, report.overall_confidence);
  const queryId = queryResult.lastInsertRowid as number;

  // 2. Insert sources and claims
  for (const claim of claims) {
    let sourceId: number | null = null;

    if (claim.source_url) {
      try {
        const domain = new URL(claim.source_url).hostname;
        sourceId = upsertSource({
          url: claim.source_url,
          domain,
          quality_score: claim.source_quality,
          content_type: 'secondary',
        });
      } catch {}
    }

    // Generate tags from claim text
    const tags = extractTags(claim.claim, ctx.query);

    insertClaim({
      claim_text: claim.claim,
      source_id: sourceId,
      confidence: Math.min(0.95, claim.verified_confidence || claim.confidence),
      claim_type: claim.claim_type,
      date_found: new Date().toISOString().slice(0, 10),
      query_id: queryId,
      tags,
    });
  }

  // 3. Track provider usage
  const providers = new Set(claims.map(c => {
    try { return new URL(c.source_url).hostname; } catch { return 'unknown'; }
  }));
  for (const provider of providers) {
    db.prepare(`
      INSERT INTO query_providers (query_id, provider, calls_made)
      VALUES (?, ?, 1)
      ON CONFLICT(query_id, provider) DO UPDATE SET calls_made = calls_made + 1
    `).run(queryId, provider);
  }

  // 4. Store reasoning trace
  db.prepare(`
    INSERT INTO reasoning_traces (query_id, outline, confidence_overall, narrative_type, pipeline_metadata)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    queryId,
    JSON.stringify(report.findings),
    report.overall_confidence,
    'auto',
    JSON.stringify({ depth: ctx.depth, claims_count: claims.length, duration_ms: durationMs })
  );

  // 5. Lightweight self-evolution: update provider routing based on result quality
  if (report.overall_confidence > 0.7) {
    // Good results — slightly boost the providers used
    const usedProviders = claims.map(c => c.source_url?.includes('exa.ai') ? 'exa' : 'duckduckgo');
    for (const p of new Set(usedProviders)) {
      updateRoutingWeight('general', p, 0.01); // small positive nudge
    }
  }
}

function extractTags(claim: string, query: string): string[] {
  const stopWords = new Set(['the', 'is', 'are', 'was', 'were', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as', 'it', 'its', 'this', 'that', 'has', 'have', 'had', 'not', 'can', 'will', 'does', 'do', 'than', 'more', 'most', 'very', 'also', 'been']);
  const combined = `${query} ${claim}`.toLowerCase();
  const words = combined.replace(/[^a-z0-9\s-]/g, '').split(/\s+/);
  const tags = [...new Set(words.filter(w => w.length > 3 && !stopWords.has(w)))];
  return tags.slice(0, 10);
}
