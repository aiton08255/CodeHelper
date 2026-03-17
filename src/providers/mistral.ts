import { LLMResponse } from './types.js';

const BASE_URL = 'https://api.mistral.ai/v1/chat/completions';

export async function mistralChat(
  messages: { role: string; content: string }[],
  apiKey: string,
  options: { model?: string; timeout?: number } = {}
): Promise<LLMResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout || 30_000);

  try {
    const res = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
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
