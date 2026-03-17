import { LLMResponse } from './types.js';

const BASE_URL = 'https://gen.pollinations.ai/v1/chat/completions';

export async function pollinationsChat(
  messages: { role: string; content: string }[],
  model: string = 'openai',
  options: { timeout?: number } = {}
): Promise<LLMResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout || 30_000);

  try {
    const res = await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: false }),
      signal: controller.signal,
    });

    if (!res.ok) throw new Error(`Pollinations ${model}: ${res.status} ${res.statusText}`);

    const data = await res.json() as any;
    return {
      content: data.choices?.[0]?.message?.content || '',
      provider: 'pollinations',
      model,
      tokens_used: data.usage?.total_tokens,
    };
  } finally {
    clearTimeout(timer);
  }
}
