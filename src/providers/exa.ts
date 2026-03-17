import { SearchResult } from './types.js';

const BASE_URL = 'https://api.exa.ai/search';

export async function exaSearch(
  query: string,
  apiKey: string,
  options: { numResults?: number; category?: string } = {}
): Promise<SearchResult[]> {
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      type: 'auto',
      num_results: options.numResults || 5,
      contents: { highlights: { max_characters: 4000 } },
      ...(options.category && { category: options.category }),
    }),
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
}
