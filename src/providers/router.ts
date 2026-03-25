import { QueryType, SearchResult } from './types.js';
import { ddgSearch, ddgNewsSearch } from './duckduckgo.js';
import { exaSearch } from './exa.js';
import { serperSearch } from './serper.js';
import { googleAIGroundedSearch } from './google-ai.js';

interface RoutingEntry {
  primary: string;
  secondary: string;
  fallback: string;
}

const ROUTING_TABLE: Record<QueryType, RoutingEntry> = {
  news:          { primary: 'duckduckgo:news', secondary: 'pollinations:gemini-search', fallback: 'duckduckgo' },
  academic:      { primary: 'exa',             secondary: 'duckduckgo',                 fallback: 'duckduckgo' },
  code:          { primary: 'duckduckgo',      secondary: 'exa',                        fallback: 'duckduckgo' },
  general:       { primary: 'exa',              secondary: 'google-search',              fallback: 'duckduckgo' },
  page_read:     { primary: 'webfetch',        secondary: 'exa:crawl',                  fallback: 'serper:scrape' },
  fast_reason:   { primary: 'groq',            secondary: 'pollinations:openai-fast',   fallback: 'mistral' },
  deep_reason:   { primary: 'pollinations:perplexity-reasoning', secondary: 'pollinations:deepseek', fallback: 'mistral' },
  search_reason: { primary: 'google-search',                     secondary: 'pollinations:gemini-search', fallback: 'duckduckgo' },
  company:       { primary: 'exa:company',     secondary: 'duckduckgo',                 fallback: 'serper' },
};

export function getRoute(queryType: QueryType): RoutingEntry {
  return ROUTING_TABLE[queryType];
}

export async function executeSearch(
  provider: string,
  query: string,
  keys: Record<string, string>
): Promise<SearchResult[]> {
  const [name, variant] = provider.split(':');

  switch (name) {
    case 'duckduckgo':
      return variant === 'news' ? ddgNewsSearch(query) : ddgSearch(query);
    case 'exa':
      if (!keys.exa) return [];
      return exaSearch(query, keys.exa, { category: variant });
    case 'serper':
      if (!keys.serper) return [];
      return serperSearch(query, keys.serper);
    case 'google-search':
      if (!keys.googleai) return [];
      const gResult = await googleAIGroundedSearch(query, keys.googleai);
      // Parse grounded search response into search results
      return [{
        url: `https://google.com/search?q=${encodeURIComponent(query)}`,
        title: query,
        snippet: gResult.content.slice(0, 500),
        provider: 'google-search',
      }];
    case 'webfetch':
      return [];
    default:
      return [];
  }
}

export { ROUTING_TABLE };
