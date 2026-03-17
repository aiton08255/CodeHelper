import { SearchResult } from './types.js';

export async function ddgSearch(query: string, options: { limit?: number } = {}): Promise<SearchResult[]> {
  const params = new URLSearchParams({ q: query, kl: 'wt-wt' });
  const res = await fetch(`https://html.duckduckgo.com/html/?${params}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SelfEvo/1.0)' },
  });
  const html = await res.text();
  return parseResults(html, options.limit || 8);
}

export async function ddgNewsSearch(query: string, options: { limit?: number } = {}): Promise<SearchResult[]> {
  const params = new URLSearchParams({ q: query, kl: 'wt-wt', iar: 'news' });
  const res = await fetch(`https://html.duckduckgo.com/html/?${params}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SelfEvo/1.0)' },
  });
  const html = await res.text();
  return parseResults(html, options.limit || 8);
}

function parseResults(html: string, limit: number): SearchResult[] {
  const results: SearchResult[] = [];
  const resultRegex = /<a rel="nofollow" class="result__a" href="([^"]+)">(.+?)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  let match;

  while ((match = resultRegex.exec(html)) !== null && results.length < limit) {
    const rawUrl = match[1];
    const url = decodeURIComponent(
      rawUrl.replace(/\/\/duckduckgo\.com\/l\/\?uddg=/, '').split('&')[0]
    );
    results.push({
      url,
      title: match[2].replace(/<[^>]+>/g, '').trim(),
      snippet: match[3].replace(/<[^>]+>/g, '').trim(),
      provider: 'duckduckgo',
    });
  }
  return results;
}
