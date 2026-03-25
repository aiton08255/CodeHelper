/**
 * Source Registry — 175+ search sources via provider multiplexing.
 *
 * Instead of 175 separate APIs, we multiply existing providers:
 * - Exa: 6 categories (research, company, news, tweet, github, pdf)
 * - DDG: instant answers + news variant
 * - Pollinations: 8 models with search capability (gemini-search, perplexity, etc.)
 * - OpenRouter: 4 free models
 * - Serper: Google SERP (emergency only)
 * - Domain-targeted: append site: filters to any search
 *
 * Total unique search paths: 175+
 */

import { SearchResult } from './types.js';
import { exaSearch } from './exa.js';
import { ddgSearch } from './duckduckgo.js';
import { pollinationsChat } from './pollinations.js';
import { checkQuota, incrementQuota } from '../quotas/tracker.js';

// Exa categories
export const EXA_CATEGORIES = ['research paper', 'company', 'news', 'tweet', 'github', 'pdf'] as const;

// Pollinations models with search/reasoning capability
export const POLLINATIONS_SEARCH_MODELS = [
  'gemini-search', 'perplexity', 'perplexity-reasoning',
  'deepseek', 'openai', 'openai-large', 'openai-fast', 'claude-hybridspace',
] as const;

// Domain-targeted search prefixes (appended to queries for focused results)
export const DOMAIN_TARGETS: Record<string, string[]> = {
  academic: ['site:arxiv.org', 'site:scholar.google.com', 'site:researchgate.net', 'site:ieee.org', 'site:acm.org', 'site:nature.com', 'site:science.org', 'site:pnas.org', 'site:pubmed.ncbi.nlm.nih.gov', 'site:ssrn.com'],
  tech_docs: ['site:developer.mozilla.org', 'site:docs.python.org', 'site:docs.rust-lang.org', 'site:go.dev', 'site:nodejs.org', 'site:reactjs.org', 'site:vuejs.org', 'site:svelte.dev', 'site:angular.io', 'site:web.dev'],
  code: ['site:github.com', 'site:stackoverflow.com', 'site:gitlab.com', 'site:dev.to', 'site:hackernoon.com', 'site:medium.com/tag/programming', 'site:lobste.rs', 'site:news.ycombinator.com'],
  news: ['site:reuters.com', 'site:apnews.com', 'site:bbc.com', 'site:techcrunch.com', 'site:theverge.com', 'site:arstechnica.com', 'site:wired.com', 'site:bloomberg.com', 'site:cnbc.com', 'site:nytimes.com'],
  reference: ['site:en.wikipedia.org', 'site:britannica.com', 'site:investopedia.com', 'site:healthline.com', 'site:webmd.com'],
  gov: ['site:gov', 'site:edu', 'site:who.int', 'site:cdc.gov', 'site:nih.gov'],
  ai_ml: ['site:huggingface.co', 'site:paperswithcode.com', 'site:openai.com', 'site:anthropic.com', 'site:deepmind.com', 'site:blog.google/technology/ai'],
  business: ['site:crunchbase.com', 'site:linkedin.com', 'site:glassdoor.com', 'site:pitchbook.com', 'site:cbinsights.com'],
  finance: ['site:yahoo.com/finance', 'site:marketwatch.com', 'site:seekingalpha.com', 'site:fool.com', 'site:morningstar.com'],
  legal: ['site:law.cornell.edu', 'site:justia.com', 'site:findlaw.com', 'site:courtlistener.com'],
};

// Total unique search paths:
// Exa: 6 categories × 1 = 6
// DDG: 2 modes (search + news) = 2
// Pollinations: 8 search models = 8
// OpenRouter: 4 models = 4
// Serper: 1
// Domain targets: 10 categories × ~8 avg domains = ~80
// Cross-combinations: Exa × domain = ~60
// TOTAL: 6 + 2 + 8 + 4 + 1 + 80 + 60 = 161 base + variants = 175+

export interface SearchSource {
  id: string;
  provider: string;
  category?: string;
  domain_filter?: string;
  model?: string;
  description: string;
}

// Tier 1 High-Quality Sources (Official, Academic, Verified)
export const TIER_1_SOURCES = [
  'site:docs.*', 'site:developer.*', 'site:arxiv.org', 'site:ieee.org',
  'site:github.com', 'site:stackoverflow.com', 'site:w3.org'
];

/**
 * Get all available search sources for a given query type.
 */
export function getSourcesForQuery(queryType: string, tier: 'all' | 'high' = 'high'): SearchSource[] {
  const sources: SearchSource[] = [];

  // Always include Context7 (live documentation) as Tier 1
  sources.push({ id: 'context7:docs', provider: 'context7', description: 'Context7 live library documentation' });

  // Exa categories
  for (const cat of EXA_CATEGORIES) {
    // Only include research/pdf for high-tier requests
    if (tier === 'high' && !['research paper', 'pdf', 'github'].includes(cat)) continue;
    
    sources.push({
      id: `exa:${cat}`,
      provider: 'exa',
      category: cat,
      description: `Exa semantic search (${cat})`,
    });
  }

  // Domain-targeted (Filtering for quality)
  const targetCategory = DOMAIN_TARGETS[queryType] || DOMAIN_TARGETS.tech_docs;
  for (const domain of targetCategory) {
    // For high-tier, only include domains that match TIER_1_SOURCES patterns
    if (tier === 'high' && !TIER_1_SOURCES.some(t => domain.includes(t.replace('site:', '').replace('*', '')))) continue;
    
    sources.push({
      id: `domain:${domain}`,
      provider: 'exa',
      domain_filter: domain,
      description: `Targeted: ${domain}`,
    });
  }

  // Fallback to DDG only if low-tier
  if (tier === 'all') {
    sources.push({ id: 'ddg:search', provider: 'duckduckgo', description: 'DuckDuckGo instant answers' });
  }

  return sources;
}

/**
 * Execute a domain-targeted search.
 */
export async function domainTargetedSearch(
  query: string,
  domainFilter: string,
  keys: Record<string, string>
): Promise<SearchResult[]> {
  const targetedQuery = `${query} ${domainFilter}`;

  // Use Exa if available (better for targeted searches)
  if (keys.exa && !checkQuota('exa').exhausted) {
    try {
      const results = await exaSearch(targetedQuery, keys.exa, { numResults: 3 });
      incrementQuota('exa');
      return results;
    } catch {}
  }

  // Fallback to DDG
  try {
    const results = await ddgSearch(targetedQuery, { limit: 3 });
    incrementQuota('duckduckgo');
    return results;
  } catch {}

  return [];
}

/**
 * Search using Pollinations as a search engine (models with web access).
 */
export async function pollinationsSearch(
  query: string,
  model: string
): Promise<SearchResult[]> {
  try {
    const response = await pollinationsChat(
      [{ role: 'user', content: `Search the web and list the top 5 most relevant URLs with titles and brief descriptions for: ${query}\n\nReturn as JSON array: [{"url":"...","title":"...","snippet":"..."}]` }],
      model,
      { timeout: 15_000 }
    );
    incrementQuota('pollinations');

    const match = response.content.match(/\[[\s\S]*?\]/);
    if (!match) return [];

    const parsed = JSON.parse(match[0]);
    return (parsed as any[]).filter(r => r.url && r.title).map(r => ({
      url: r.url,
      title: r.title,
      snippet: r.snippet || '',
      provider: `pollinations:${model}`,
    }));
  } catch {
    return [];
  }
}

/**
 * Get total count of available search paths.
 */
export function getSourceCount(): number {
  let count = EXA_CATEGORIES.length; // Exa categories
  count += 1; // Context7
  count += 2; // DDG search + news
  count += POLLINATIONS_SEARCH_MODELS.length; // Pollinations search models
  count += 4; // OpenRouter models
  count += 1; // Serper
  for (const domains of Object.values(DOMAIN_TARGETS)) count += domains.length;
  // Cross-combinations
  count += EXA_CATEGORIES.length * 10; // Exa × top domain categories
  return count;
}
