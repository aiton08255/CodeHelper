import { LLMResponse } from './types.js';
import { anonFetch, anonApiHeaders } from '../privacy/anonymizer.js';

const BASE_URL = 'https://api.groq.com/openai/v1/chat/completions';

export async function groqChat(
  messages: { role: string; content: string }[],
  apiKey: string,
  options: { model?: string; timeout?: number } = {}
): Promise<LLMResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout || 15_000);

  try {
    const res = await anonFetch(BASE_URL, {
      method: 'POST',
      headers: anonApiHeaders({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` }),
      body: JSON.stringify({
        model: options.model || 'llama-3.3-70b-versatile',
        messages,
      }),
      signal: controller.signal,
    });

    if (!res.ok) throw new Error(`Groq: ${res.status} ${res.statusText}`);

    const data = await res.json() as any;
    return {
      content: data.choices?.[0]?.message?.content || '',
      provider: 'groq',
      model: options.model || 'llama-3.3-70b-versatile',
      tokens_used: data.usage?.total_tokens,
    };
  } finally {
    clearTimeout(timer);
  }
}
