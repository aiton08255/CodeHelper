import { VerifiedClaim } from './types.js';
import type { PipelineContext } from './orchestrator.js';
import { pollinationsChat } from '../providers/pollinations.js';
import { groqChat } from '../providers/groq.js';
import { incrementQuota } from '../quotas/tracker.js';

const VERIFY_PROMPT = `You are a fact verification assistant. Given a list of claims from different sources about the same topic, analyze them for:

1. Agreement: do multiple independent sources say the same thing?
2. Contradictions: do any sources directly disagree?
3. Confidence: how certain should we be about each claim?

Return a JSON array with each claim updated:
[
  {
    "claim": "the original claim text",
    "verified_confidence": 0.3-0.95,
    "agreement_score": 0.0-1.0,
    "disputed": true/false,
    "reasoning": "brief explanation"
  }
]

Rules:
- A single authoritative source (.gov, official docs, peer-reviewed) can justify 0.7+ confidence alone
- Multiple agreeing blog posts max out at 0.7 unless backed by primary sources
- Contradictions should set disputed=true with both sides preserved
- Return valid JSON only`;

export async function stageVerify(ctx: PipelineContext, claims: VerifiedClaim[]): Promise<VerifiedClaim[]> {
  if (claims.length === 0) return claims;

  // Group claims by similarity (simple: by source_url domain)
  const claimsSummary = claims.map((c, i) => `[${i}] "${c.claim}" (source: ${c.source_url}, quality: ${c.source_quality})`).join('\n');

  try {
    let response;
    try {
      response = await pollinationsChat(
        [{ role: 'system', content: VERIFY_PROMPT }, { role: 'user', content: `Query: "${ctx.query}"\n\nClaims:\n${claimsSummary}` }],
        'perplexity-reasoning',
        { timeout: 30_000 }
      );
      incrementQuota('pollinations');
    } catch {
      // Fallback to Groq
      if (ctx.keys.groq) {
        response = await groqChat(
          [{ role: 'system', content: VERIFY_PROMPT }, { role: 'user', content: `Query: "${ctx.query}"\n\nClaims:\n${claimsSummary}` }],
          ctx.keys.groq,
          { timeout: 20_000 }
        );
        incrementQuota('groq');
      } else {
        // No verification available — return claims with basic scoring
        return claims.map(c => ({
          ...c,
          verified_confidence: c.confidence * c.source_quality,
          agreement_score: 0.5,
        }));
      }
    }

    const jsonMatch = response.content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return claims;

    const verifiedData = JSON.parse(jsonMatch[0]);

    // Merge verification results back into claims
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
    // Verification failed — return claims with basic scoring
    return claims.map(c => ({
      ...c,
      verified_confidence: c.confidence * c.source_quality,
      agreement_score: 0.5,
    }));
  }
}
