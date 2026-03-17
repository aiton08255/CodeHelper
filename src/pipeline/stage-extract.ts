/**
 * EXTRACT stage — reads pages and extracts claims with techniques from:
 * - RAGFlow: smart document chunking for long pages
 * - GPT Researcher: parallel extraction across all sources
 * - OpenDeepSearch: higher claim density extraction
 */

import { VerifiedClaim } from './types.js';
import { TriagedSource } from './stage-triage.js';
import type { PipelineContext } from './orchestrator.js';
import { webFetchPage } from '../providers/webfetch.js';
import { llmCall } from '../providers/llm.js';
import { extractJsonArray } from '../utils/safe-json.js';
import { parseClaimsFromLLM } from '../schemas/index.js';

const EXTRACT_PROMPT = `Extract factual claims from content relevant to the query. Max 10 per chunk.
Be specific: exact numbers, dates, versions, benchmarks. Include context/conditions.
Types: quantitative(numbers), qualitative(properties), opinion(viewpoint), procedural(how-to).
Return JSON array only: [{"claim":"...", "claim_type":"...", "confidence":0.5-0.9, "date":"YYYY-MM|null"}]`;

// Smart chunking — split long pages into overlapping chunks (from RAGFlow)
function chunkContent(content: string, chunkSize: number = 12_000, overlap: number = 1_000): string[] {
  if (content.length <= chunkSize) return [content];

  const chunks: string[] = [];
  let start = 0;
  while (start < content.length) {
    const end = Math.min(start + chunkSize, content.length);
    chunks.push(content.slice(start, end));
    start = end - overlap;
    if (chunks.length >= 3) break; // max 3 chunks per page
  }
  return chunks;
}

export async function stageExtract(ctx: PipelineContext, sources: TriagedSource[]): Promise<VerifiedClaim[]> {
  const allClaims: VerifiedClaim[] = [];

  // Parallel extraction across ALL sources simultaneously (from GPT Researcher)
  const extractPromises = sources.map(async (source) => {
    try {
      const content = await webFetchPage(source.url, { timeout: 10_000 });
      if (!content || content.length < 100) return [];

      // Smart chunking for long pages (from RAGFlow)
      const chunks = chunkContent(content);
      const chunkClaims: VerifiedClaim[] = [];

      // Process chunks in parallel for speed
      const chunkPromises = chunks.map(async (chunk, i) => {
        const prompt = `Query: "${ctx.query}"\nSource: ${source.url} (part ${i + 1}/${chunks.length})\nContent:\n${chunk}`;
        try {
          const response = await llmCall(
            [{ role: 'system', content: EXTRACT_PROMPT }, { role: 'user', content: prompt }],
            { tier: 'fast', keys: ctx.keys, timeout: 15_000 }
          );

          const rawJson = extractJsonArray(response.content);
          if (!rawJson) return [];

          return parseClaimsFromLLM(rawJson).map((c) => ({
            claim: c.claim,
            source_url: source.url,
            source_quality: source.quality_score,
            date: c.date,
            claim_type: c.claim_type || 'qualitative',
            confidence: Math.min(0.9, c.confidence || 0.5),
            verified_confidence: 0,
            agreement_score: 0,
            disputed: false,
          } as VerifiedClaim));
        } catch {
          return [];
        }
      });

      const results = await Promise.allSettled(chunkPromises);
      for (const r of results) {
        if (r.status === 'fulfilled') chunkClaims.push(...r.value);
      }
      return chunkClaims;
    } catch (err) {
      ctx.emit({ type: 'error', message: `Extract failed for ${source.url}: ${(err as Error).message}`, recoverable: true });
      return [];
    }
  });

  const results = await Promise.allSettled(extractPromises);
  for (const result of results) {
    if (result.status === 'fulfilled') {
      for (const claim of result.value) {
        allClaims.push(claim);
        ctx.emit({ type: 'claim-extracted', claim: claim.claim, confidence: claim.confidence });
      }
    }
  }

  return allClaims;
}
