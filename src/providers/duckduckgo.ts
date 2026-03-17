import { SearchResult } from './types.js';

// Use DuckDuckGo lite endpoint — simpler HTML, more stable markup
const LITE_URL = 'https://lite.duckduckgo.com/lite/';

export async function ddgSearch(query: string, options: { limit?: number; timeout?: number } = {}): Promise<SearchResult[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout || 10_000);

  try {
    const res = await fetch(LITE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (compatible; SelfEvo/1.0)',
      },
      body: `q=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });
    const html = await res.text();
    return parseLiteResults(html, options.limit || 8);
  } finally {
    clearTimeout(timer);
  }
}

export async function ddgNewsSearch(query: string, options: { limit?: number; timeout?: number } = {}): Promise<SearchResult[]> {
  // DDG lite doesn't have a news mode, so we append "news" to query
  return ddgSearch(`${query} news latest`, options);
}

function parseLiteResults(html: string, limit: number): SearchResult[] {
  const results: SearchResult[] = [];

  // DuckDuckGo lite uses simple table rows with class "result-link" for URLs
  // and plain <td> cells for snippets. Parse using multiple strategies.

  // Strategy 1: Find all links in result rows
  // DDG lite format: <a rel="nofollow" href="URL" class="result-link">TITLE</a>
  const linkRegex = /<a[^>]*class="result-link"[^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/gi;
  const snippetRegex = /<td class="result-snippet">([\s\S]*?)<\/td>/gi;

  const links: { url: string; title: string }[] = [];
  const snippets: string[] = [];

  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    links.push({ url: match[1], title: match[2].trim() });
  }
  while ((match = snippetRegex.exec(html)) !== null) {
    snippets.push(match[1].replace(/<[^>]+>/g, '').trim());
  }

  // Strategy 2 fallback: if result-link class not found, try generic href pattern
  if (links.length === 0) {
    const genericRegex = /<a[^>]*rel="nofollow"[^>]*href="(https?:\/\/[^"]+)"[^>]*>([^<]+)<\/a>/gi;
    while ((match = genericRegex.exec(html)) !== null) {
      const url = match[1];
      // Skip DDG internal links
      if (url.includes('duckduckgo.com')) continue;
      links.push({ url, title: match[2].trim() });
    }
  }

  // Strategy 3 fallback: extract any external URLs
  if (links.length === 0) {
    const urlRegex = /href="(https?:\/\/(?!.*duckduckgo\.com)[^"]+)"/gi;
    while ((match = urlRegex.exec(html)) !== null && links.length < limit) {
      links.push({ url: match[1], title: '' });
    }
  }

  for (let i = 0; i < Math.min(links.length, limit); i++) {
    results.push({
      url: links[i].url,
      title: links[i].title || `Result ${i + 1}`,
      snippet: snippets[i] || '',
      provider: 'duckduckgo',
    });
  }

  return results;
}
