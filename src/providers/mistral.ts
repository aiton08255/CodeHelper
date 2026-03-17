import { LLMResponse } from './types.js';
import { anonFetch, anonApiHeaders } from '../privacy/anonymizer.js';

const BASE_URL = 'https://api.mistral.ai/v1/chat/completions';

export async function mistralChat(
  messages: { role: string; content: string }[],
  apiKey: string,
  options: { model?: string; timeout?: number } = {}
): Promise<LLMResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout || 30_000);

  try {
    const res = await anonFetch(BASE_URL, {
      method: 'POST',
      headers: anonApiHeaders({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` }),
      body: JSON.stringify({
        model: options.model || 'mistral-small-latest',
        messages,
      }),
      signal: controller.signal,
    });

    if (!res.ok) throw new Error(`Mistral: ${res.status} ${res.statusText}`);

    const data = await res.json() as any;
    return {
      content: data.choices?.[0]?.message?.content || '',
      provider: 'mistral',
      model: options.model || 'mistral-small-latest',
      tokens_used: data.usage?.total_tokens,
    };
  } finally {
    clearTimeout(timer);
  }
}
