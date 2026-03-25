import { SearchResult } from './types.js';
import { anonFetch, anonApiHeaders } from '../privacy/anonymizer.js';

const BASE_URL = 'https://api.exa.ai/search';

export async function exaSearch(
  query: string,
  apiKey: string,
  options: { numResults?: number; category?: string; timeout?: number } = {}
): Promise<SearchResult[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout || 10_000);

  try {
    const res = await anonFetch(BASE_URL, {
      method: 'POST',
      headers: anonApiHeaders({ 'x-api-key': apiKey, 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        query,
        type: 'auto',
        num_results: options.numResults || 5,
        contents: { highlights: { max_characters: 4000 } },
        ...(options.category && { category: options.category }),
      }),
      signal: controller.signal,
    });

    if (!res.ok) throw new Error(`Exa: ${res.status}`);
    const data = await res.json() as any;

    return (data.results || []).map((r: any) => ({
      url: r.url,
      title: r.title || '',
      snippet: r.highlights?.join(' ') || r.text?.slice(0, 500) || '',
      date: r.publishedDate,
      provider: 'exa',
    }));
  } finally {
    clearTimeout(timer);
  }
}
