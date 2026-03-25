/**
 * Safe JSON extraction from LLM responses.
 * Handles markdown code blocks, trailing text, and malformed JSON.
 */

export function extractJsonArray(text: string): unknown[] | null {
  // Try direct parse
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
  } catch {}

  // Strip markdown code fences
  const cleaned = text.replace(/```(?:json)?\s*/g, '').replace(/```/g, '');

  // Find the outermost array by bracket matching
  const start = cleaned.indexOf('[');
  if (start === -1) return null;

  let depth = 0;
  for (let i = start; i < cleaned.length; i++) {
    if (cleaned[i] === '[') depth++;
    else if (cleaned[i] === ']') depth--;
    if (depth === 0) {
      try {
        const parsed = JSON.parse(cleaned.slice(start, i + 1));
        if (Array.isArray(parsed)) return parsed;
      } catch {}
      return null;
    }
  }
  return null;
}

export function extractJsonObject(text: string): Record<string, unknown> | null {
  // Try direct parse
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {}

  // Strip markdown code fences
  const cleaned = text.replace(/```(?:json)?\s*/g, '').replace(/```/g, '');

  // Find the outermost object by brace matching
  const start = cleaned.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  for (let i = start; i < cleaned.length; i++) {
    if (cleaned[i] === '{') depth++;
    else if (cleaned[i] === '}') depth--;
    if (depth === 0) {
      try {
        const parsed = JSON.parse(cleaned.slice(start, i + 1));
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
      } catch {}
      return null;
    }
  }
  return null;
}
