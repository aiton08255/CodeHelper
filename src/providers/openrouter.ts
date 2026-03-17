/**
 * OpenRouter — unified gateway to 24+ free models.
 * Free tier: 500k tokens/month, 10 req/min.
 * No API key needed for free models.
 */

import { LLMResponse } from './types.js';
import { anonFetch, anonApiHeaders } from '../privacy/anonymizer.js';

const API_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Free models on OpenRouter (no API key needed for these)
const FREE_MODELS = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'google/gemma-3-27b-it:free',
  'mistralai/mistral-small-3.1-24b-instruct:free',
  'qwen/qwen3-235b-a22b:free',
];

export async function openrouterChat(
  messages: { role: string; content: string }[],
  model?: string,
  options: { timeout?: number } = {}
): Promise<LLMResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout || 25_000);

  try {
    const res = await anonFetch(API_URL, {
      method: 'POST',
      headers: anonApiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        model: model || FREE_MODELS[0],
        messages,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenRouter ${res.status}: ${err.slice(0, 200)}`);
    }

    const data = await res.json();
    return {
      content: data.choices?.[0]?.message?.content || '',
      provider: 'openrouter',
      model: data.model || model || FREE_MODELS[0],
      tokens_used: data.usage?.total_tokens || 0,
    };
  } finally {
    clearTimeout(timer);
  }
}
