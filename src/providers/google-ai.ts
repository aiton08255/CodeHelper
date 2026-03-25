/**
 * Google AI Studio (Gemini) — 1M token context, grounded search.
 * Free tier: 15 RPM, 1M tokens/min, 1500 req/day.
 * Models: gemini-2.0-flash (fast), gemini-2.5-pro (best quality)
 */

import { LLMResponse } from './types.js';
import { anonFetch, anonApiHeaders } from '../privacy/anonymizer.js';

const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

export async function googleAIChat(
  messages: { role: string; content: string }[],
  apiKey: string,
  options: { model?: string; timeout?: number } = {}
): Promise<LLMResponse> {
  const model = options.model || 'gemini-2.0-flash';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout || 30_000);

  try {
    // Convert messages to Gemini format
    const contents = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    // Prepend system instruction if present
    const systemMsg = messages.find(m => m.role === 'system');
    const systemInstruction = systemMsg
      ? { parts: [{ text: systemMsg.content }] }
      : undefined;

    const res = await anonFetch(`${API_URL}/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: anonApiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        contents,
        ...(systemInstruction && { systemInstruction }),
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 4096,
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Google AI ${res.status}: ${err.slice(0, 200)}`);
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const tokens = data.usageMetadata?.totalTokenCount || 0;

    return {
      content: text,
      provider: 'google-ai',
      model,
      tokens_used: tokens,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Google AI with grounded search — uses Google Search to ground responses.
 */
export async function googleAIGroundedSearch(
  query: string,
  apiKey: string,
  options: { timeout?: number } = {}
): Promise<LLMResponse> {
  const model = 'gemini-2.0-flash';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout || 30_000);

  try {
    const res = await anonFetch(`${API_URL}/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: anonApiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: query }] }],
        tools: [{ googleSearch: {} }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 4096,
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Google AI Search ${res.status}: ${err.slice(0, 200)}`);
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const tokens = data.usageMetadata?.totalTokenCount || 0;

    return {
      content: text,
      provider: 'google-ai',
      model: `${model}+search`,
      tokens_used: tokens,
    };
  } finally {
    clearTimeout(timer);
  }
}
