import { anonFetch, anonHeaders } from '../privacy/anonymizer.js';
import { logger } from '../utils/logger.js';
import { SearchResult } from './types.js';

export interface ScrapedResult extends SearchResult {
  snippet: string;
}

/**
 * Scrape DuckDuckGo HTML version.
 * Much better results than the API, but more fragile.
 */
export async function scrapeDuckDuckGo(query: string, maxResults: number = 10): Promise<ScrapedResult[]> {
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&ia=web`;

  try {
    const response = await anonFetch(searchUrl, { headers: anonHeaders() });
    const html = await response.text();

    const results: ScrapedResult[] = [];
    
    // Regex for result link: <a class="result__a" href="...">Title</a>
    const linkPattern = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/g;
    // Regex for snippet: <a class="result__snippet" href="...">Snippet</a>
    const snippetPattern = /<a[^>]+class="result__snippet"[^>]+href="[^"]+"[^>]*>([^<]+)<\/a>/g;

    const links: { url: string; title: string }[] = [];
    const snippets: string[] = [];

    let match;
    while ((match = linkPattern.exec(html)) !== null) {
      links.push({ url: match[1], title: match[2] });
    }

    while ((match = snippetPattern.exec(html)) !== null) {
      snippets.push(match[1]);
    }

    // Combine them (assuming order is preserved, which is risky but standard for scraping)
    for (let i = 0; i < Math.min(links.length, maxResults); i++) {
      results.push({
        url: links[i].url,
        title: links[i].title,
        snippet: snippets[i] || '',
        provider: 'duckduckgo-html',
      });
    }

    return results;
  } catch (err) {
    logger.error('ddg-scrape', 'DuckDuckGo HTML search failed', { error: (err as Error)?.message });
    return [];
  }
}
