import { VerifiedClaim } from './types.js';
import type { PipelineContext } from './orchestrator.js';
import { llmCall } from '../providers/llm.js';
import { extractJsonArray } from '../utils/safe-json.js';

const VERIFY_PROMPT = `Verify each claim's reliability. Check: source independence, authority(.gov/.edu>blogs>forums), temporal validity, specificity, contradictions.
Scoring: 0.85-0.95=multi-source authoritative; 0.70-0.84=single authoritative; 0.50-0.69=limited; 0.30-0.49=weak. Never 0.9+ without rock-solid evidence.
Return JSON array: [{"claim":"...", "verified_confidence":0.3-0.95, "agreement_score":0-1, "disputed":bool, "reasoning":"..."}]`;

export async function stageVerify(ctx: PipelineContext, claims: VerifiedClaim[]): Promise<VerifiedClaim[]> {
  if (claims.length === 0) return claims;

  const claimsSummary = claims.map((c, i) => `[${i}] "${c.claim}" (source: ${c.source_url}, quality: ${c.source_quality})`).join('\n');

  try {
    const response = await llmCall(
      [{ role: 'system', content: VERIFY_PROMPT }, { role: 'user', content: `Query: "${ctx.query}"\n\nClaims:\n${claimsSummary}` }],
      { tier: 'reason', keys: ctx.keys, timeout: 30_000 }
    );

    const verifiedData = extractJsonArray(response.content) as any[] | null;
    if (!verifiedData) return claims;

    return claims.map((claim, i) => {
      const verification = verifiedData[i] || verifiedData.find((v: any) => v.claim === claim.claim);
      if (verification) {
        const updated = {
          ...claim,
          verified_confidence: Math.min(0.95, verification.verified_confidence || claim.confidence),
          agreement_score: verification.agreement_score || 0.5,
          disputed: verification.disputed || false,
        };
        if (updated.disputed) {
          ctx.emit({ type: 'conflict-detected', claim_a: claim.claim, claim_b: verification.reasoning || 'conflicting source' });
        }
        return updated;
      }
      return { ...claim, verified_confidence: claim.confidence, agreement_score: 0.5 };
    });
  } catch {
    return claims.map(c => ({
      ...c,
      verified_confidence: c.confidence * c.source_quality,
      agreement_score: 0.5,
    }));
  }
}
