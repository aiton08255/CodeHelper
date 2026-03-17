import { VerifiedClaim, ReasoningOutline, ResearchReport } from './types.js';
import type { PipelineContext } from './orchestrator.js';
import { llmCall } from '../providers/llm.js';

function getFormatInstruction(narrative: string): string {
  switch (narrative) {
    case 'comparison': return 'Use a comparison table format with pros/cons for each side.';
    case 'pros_cons': return 'Use a pros and cons list format.';
    case 'problem_solution': return 'Structure as: Problem -> Analysis -> Solution.';
    case 'chronological': return 'Use a timeline format, ordered by date.';
    default: return 'Use a direct answer format with supporting evidence.';
  }
}

const COMPOSE_PROMPT = `Write a research report. Structure: Executive Summary (2-3 sentences) -> Findings (use specified format) -> "What I Could Not Determine" section.
Use inline confidence tags: [high confidence], [moderate], [low], [disputed]. Cite sources as [1], [2]. Be concise but thorough.`;

export async function stageCompose(
  ctx: PipelineContext,
  outline: ReasoningOutline,
  claims: VerifiedClaim[]
): Promise<ResearchReport> {
  if (claims.length === 0) {
    return {
      query: ctx.query,
      depth: ctx.depth,
      executive_summary: 'No relevant information was found for this query.',
      findings: '',
      limitations: 'The search did not return usable results. Try rephrasing your query or using a deeper search level.',
      sources: [],
      overall_confidence: 0,
      claims: [],
    };
  }

  const formatInstruction = getFormatInstruction(outline.narrative_type);
  const uniqueSources = [...new Map(claims.map(c => [c.source_url, c])).values()];
  const sourceList = uniqueSources.map((c, i) => `[${i + 1}] ${c.source_url} (quality: ${c.source_quality})`).join('\n');

  const findingsList = outline.ranked_findings
    .map(f => `- ${f.finding} (confidence: ${f.confidence})`)
    .join('\n');

  const prompt = `Query: "${ctx.query}"
Format: ${formatInstruction}
Ranked findings:\n${findingsList}
Caveats: ${outline.caveats.join(', ') || 'None'}
Sources:\n${sourceList}
Overall confidence: ${outline.overall_confidence}
Disputed claims: ${claims.filter(c => c.disputed).map(c => c.claim).join('; ') || 'None'}`;

  let reportText: string;
  try {
    const response = await llmCall(
      [{ role: 'system', content: COMPOSE_PROMPT }, { role: 'user', content: prompt }],
      { tier: 'compose', keys: ctx.keys, timeout: 30_000 }
    );
    reportText = response.content;
  } catch {
    reportText = `## Executive Summary\nResearch on "${ctx.query}" found ${claims.length} claims across ${uniqueSources.length} sources with ${outline.overall_confidence.toFixed(0)}% overall confidence.\n\n## Findings\n${findingsList}\n\n## What I Could Not Determine\n${outline.caveats.join('\n') || 'N/A'}`;
  }

  const summaryMatch = reportText.match(/executive summary[:\s]*([\s\S]*?)(?=##|$)/i);
  const limitationsMatch = reportText.match(/(?:could not determine|limitations)[:\s]*([\s\S]*?)(?=##|$)/i);

  return {
    query: ctx.query,
    depth: ctx.depth,
    executive_summary: summaryMatch?.[1]?.trim() || reportText.slice(0, 300),
    findings: reportText,
    limitations: limitationsMatch?.[1]?.trim() || outline.caveats.join('\n') || 'None identified.',
    sources: uniqueSources.map((c, i) => ({
      url: c.source_url,
      title: `Source ${i + 1}`,
      quality: c.source_quality,
    })),
    overall_confidence: outline.overall_confidence,
    claims,
  };
}
