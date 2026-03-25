/**
 * DeepSeek via Pollinations gateway — free, no API key.
 * DeepSeek V3: 128K context, strong reasoning.
 * Accessed through Pollinations' model routing.
 */

import { pollinationsChat } from './pollinations.js';
import { LLMResponse } from './types.js';

export async function deepseekChat(
  messages: { role: string; content: string }[],
  options: { timeout?: number } = {}
): Promise<LLMResponse> {
  // DeepSeek is available through Pollinations as 'deepseek'
  return pollinationsChat(messages, 'deepseek', options);
}

export async function deepseekReason(
  messages: { role: string; content: string }[],
  options: { timeout?: number } = {}
): Promise<LLMResponse> {
  // DeepSeek reasoning model via Pollinations
  return pollinationsChat(messages, 'deepseek-reasoning', options);
}
