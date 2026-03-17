/**
 * Hugging Face Inference API — 300+ models, free tier.
 * No API key needed for many models. Rate limited: 5 req/min.
 */

import { LLMResponse } from './types.js';

const API_URL = 'https://api-inference.huggingface.co/models';

// Free models that work without a token
const FREE_MODELS = [
  'microsoft/Phi-3-mini-4k-instruct',
  'HuggingFaceH4/zephyr-7b-beta',
  'mistralai/Mistral-7B-Instruct-v0.3',
];

export async function huggingfaceChat(
  messages: { role: string; content: string }[],
  model?: string,
  options: { timeout?: number } = {}
): Promise<LLMResponse> {
  const selectedModel = model || FREE_MODELS[0];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout || 30_000);

  try {
    // Convert to single prompt for models that don't support chat
    const prompt = messages.map(m => {
      if (m.role === 'system') return `<|system|>${m.content}`;
      if (m.role === 'user') return `<|user|>${m.content}`;
      return `<|assistant|>${m.content}`;
    }).join('\n') + '\n<|assistant|>';

    const res = await fetch(`${API_URL}/${selectedModel}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inputs: prompt,
        parameters: { max_new_tokens: 2048, temperature: 0.7 },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`HuggingFace ${res.status}: ${err.slice(0, 200)}`);
    }

    const data = await res.json();
    const text = Array.isArray(data) ? data[0]?.generated_text || '' : data.generated_text || '';
    // Strip the prompt from the response
    const clean = text.includes('<|assistant|>') ? text.split('<|assistant|>').pop()?.trim() || text : text;

    return {
      content: clean,
      provider: 'huggingface',
      model: selectedModel,
    };
  } finally {
    clearTimeout(timer);
  }
}
