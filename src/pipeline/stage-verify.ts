import { VerifiedClaim } from './types.js';
import type { PipelineContext } from './orchestrator.js';
import { pollinationsChat } from '../providers/pollinations.js';
import { groqChat } from '../providers/groq.js';
import { incrementQuota } from '../quotas/tracker.js';

const VERIFY_PROMPT = `You are a rigorous fact verification analyst. Your job is to determine the truth and reliability of each claim by cross-referencing sources.

For EACH claim, evaluate:

1. **Source Independence**: Are sources truly independent? (same company's blog + docs = 1 source, not 2)
2. **Source Authority**: Official docs (.gov, .edu, RFC, W3C) >> tech blogs >> forums >> social media
3. **Temporal Validity**: Is the claim still true? Older claims about evolving tech may be outdated.
4. **Specificity**: Vague claims get lower confidence than precise ones with numbers/dates.
5. **Contradictions**: If sources disagree, identify WHY — different contexts? Different time periods? Genuine dispute?

Confidence scoring rules (BE STRICT):
- 0.85-0.95: Multiple independent authoritative sources agree, with specific evidence
- 0.70-0.84: Single authoritative source OR multiple decent sources agree
- 0.50-0.69: Limited evidence, single non-authoritative source, or partially supported
- 0.30-0.49: Weak evidence, speculative, or poorly sourced
- NEVER give 0.9+ unless you have rock-solid multi-source agreement from authoritative sources

Return a JSON array:
[
  {
    "claim": "original claim text",
    "verified_confidence": 0.3-0.95,
    "agreement_score": 0.0-1.0,
    "disputed": true/false,
    "reasoning": "why this confidence level — cite which sources agree/disagree"
  }
]

Return valid JSON only.`;

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
