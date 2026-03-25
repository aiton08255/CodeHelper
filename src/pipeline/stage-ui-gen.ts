import { llmCall } from '../providers/llm.js';
import { PipelineContext } from './orchestrator.js';
import { logger } from '../utils/logger.js';

export async function stageUiGen(ctx: PipelineContext, report: any) {
  if (ctx.depth !== 'deep') return report; // Only for deep research

  logger.info('pipeline', 'Generating UI "Vibe" for research results...');
  ctx.emit?.('progress', { stage: 'ui-gen', status: 'started' });

  const prompt = `Based on this research report, generate a high-fidelity React component (using Tailwind CSS) that visualizes the key findings.

Research Query: "${ctx.query}"
Executive Summary: "${report.executive_summary}"

The UI should:
1. Have a "Vibe": Choose a modern, clean aesthetic (like Stripe, Vercel, or Linear).
2. Include interactive-looking sections for the "findings".
3. Use Lucide icons (placeholders as <i> tags with class name).
4. Be a single, production-ready React component in a single file.
5. Use Tailwind for all styling.

Return the code for the component only.`;

  try {
    const response = await llmCall(
      [
        { role: 'system', content: 'You are an elite UI engineer specializing in React and Tailwind. You design beautiful, data-rich dashboards based on research reports.' },
        { role: 'user', content: prompt }
      ],
      { tier: 'fast', keys: ctx.keys }
    );

    report.ui_code = response.content;
    ctx.emit?.('progress', { stage: 'ui-gen', status: 'completed' });
    return report;
  } catch (err) {
    logger.error('pipeline', 'UI Generation failed', { error: (err as Error)?.message });
    return report;
  }
}
