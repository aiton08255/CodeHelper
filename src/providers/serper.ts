import { SearchResult } from './types.js';

const BASE_URL = 'https://google.serper.dev/search';

export async function serperSearch(
  query: string,
  apiKey: string,
  options: { num?: number; timeout?: number } = {}
): Promise<SearchResult[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout || 10_000);

  try {
    const res = await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, num: options.num || 5 }),
      signal: controller.signal,
    });

    if (!res.ok) throw new Error(`Serper: ${res.status}`);
    const data = await res.json() as any;

    return (data.organic || []).map((r: any) => ({
      url: r.link,
      title: r.title || '',
      snippet: r.snippet || '',
      date: r.date,
      provider: 'serper',
    }));
  } finally {
    clearTimeout(timer);
  }
}
