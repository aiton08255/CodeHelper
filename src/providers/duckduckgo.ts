import { SearchResult } from './types.js';
import { anonFetch, anonHeaders } from '../privacy/anonymizer.js';

/**
 * DuckDuckGo search using the Instant Answer API (JSON, no scraping).
 * Falls back to the abstract API if no results.
 * Note: This returns fewer results than scraping but is reliable.
 */
const API_URL = 'https://api.duckduckgo.com/';

export async function ddgSearch(query: string, options: { limit?: number; timeout?: number } = {}): Promise<SearchResult[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout || 10_000);

  try {
    // DDG Instant Answer API — returns structured JSON
    const params = new URLSearchParams({
      q: query,
      format: 'json',
      no_html: '1',
      skip_disambig: '1',
    });

    const res = await anonFetch(`${API_URL}?${params}`, {
      headers: anonHeaders(),
      signal: controller.signal,
      skipJitter: true,
    });
    const data = await res.json();
    const results: SearchResult[] = [];
    const limit = options.limit || 8;

    // Abstract (Wikipedia-style summary)
    if (data.AbstractText && data.AbstractURL) {
      results.push({
        url: data.AbstractURL,
        title: data.Heading || query,
        snippet: data.AbstractText.slice(0, 300),
        provider: 'duckduckgo',
      });
    }

    // Related topics
    if (data.RelatedTopics) {
      for (const topic of data.RelatedTopics.slice(0, limit - results.length)) {
        if (topic.FirstURL && topic.Text) {
          results.push({
            url: topic.FirstURL,
            title: topic.Text.split(' - ')[0]?.slice(0, 100) || '',
            snippet: topic.Text.slice(0, 300),
            provider: 'duckduckgo',
          });
        }
        // Nested topics (sub-categories)
        if (topic.Topics) {
          for (const sub of topic.Topics.slice(0, 3)) {
            if (sub.FirstURL && sub.Text) {
              results.push({
                url: sub.FirstURL,
                title: sub.Text.split(' - ')[0]?.slice(0, 100) || '',
                snippet: sub.Text.slice(0, 300),
                provider: 'duckduckgo',
              });
            }
          }
        }
      }
    }

    // Results section
    if (data.Results) {
      for (const r of data.Results.slice(0, limit - results.length)) {
        if (r.FirstURL && r.Text) {
          results.push({
            url: r.FirstURL,
            title: r.Text.split(' - ')[0]?.slice(0, 100) || '',
            snippet: r.Text.slice(0, 300),
            provider: 'duckduckgo',
          });
        }
      }
    }

    return results.slice(0, limit);
  } finally {
    clearTimeout(timer);
  }
}

export async function ddgNewsSearch(query: string, options: { limit?: number; timeout?: number } = {}): Promise<SearchResult[]> {
  return ddgSearch(`${query} news latest 2025`, options);
}
