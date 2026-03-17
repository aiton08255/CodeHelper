/**
 * Unified LLM call with automatic fallback chain.
 * Eliminates the repeated try/groq → catch/pollinations pattern
 * that was duplicated across 5 pipeline stages.
 */

import { groqChat } from './groq.js';
import { pollinationsChat } from './pollinations.js';
import { mistralChat } from './mistral.js';
import { incrementQuota } from '../quotas/tracker.js';

interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface LLMOptions {
  /** Which model tier to prefer */
  tier: 'fast' | 'reason' | 'compose';
  /** API keys */
  keys: Record<string, string>;
  /** Timeout per attempt in ms */
  timeout?: number;
}

interface LLMResult {
  content: string;
  provider: string;
}

const TIER_CHAINS: Record<string, { provider: string; model?: string }[]> = {
  fast: [
    { provider: 'groq' },
    { provider: 'pollinations', model: 'openai-fast' },
    { provider: 'mistral' },
  ],
  reason: [
    { provider: 'pollinations', model: 'perplexity-reasoning' },
    { provider: 'pollinations', model: 'deepseek' },
    { provider: 'groq' },
  ],
  compose: [
    { provider: 'mistral' },
    { provider: 'pollinations', model: 'openai-large' },
    { provider: 'groq' },
  ],
};

export async function llmCall(messages: LLMMessage[], opts: LLMOptions): Promise<LLMResult> {
  const chain = TIER_CHAINS[opts.tier] || TIER_CHAINS.fast;
  const timeout = opts.timeout || 20_000;
  let lastError: Error | null = null;

  for (const link of chain) {
    try {
      let content: string;

      switch (link.provider) {
        case 'groq':
          if (!opts.keys.groq) continue;
          content = (await groqChat(messages, opts.keys.groq, { timeout })).content;
          break;
        case 'pollinations':
          content = (await pollinationsChat(messages, link.model || 'openai-fast', { timeout })).content;
          break;
        case 'mistral':
          if (!opts.keys.mistral) continue;
          content = (await mistralChat(messages, opts.keys.mistral, { timeout })).content;
          break;
        default:
          continue;
      }

      incrementQuota(link.provider);
      return { content, provider: link.provider };
    } catch (err) {
      lastError = err as Error;
      continue;
    }
  }

  const failedProviders = chain.map(l => l.provider).join(', ');
  throw lastError || new Error(`All LLM providers failed (tried: ${failedProviders})`);
}
