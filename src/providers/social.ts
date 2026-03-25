import { llmCall } from './llm.js';
import { extractJsonArray } from '../utils/safe-json.js';
import { logger } from '../utils/logger.js';
import { webFetchPage } from './webfetch.js';
import { scrapeDuckDuckGo } from './duckduckgo-scraper.js';

export interface SocialResult {
  platform: string;
  url: string;
  title: string;
  snippet: string;
  content?: string;
}

export interface SocialInsight {
  claims: { claim: string; confidence: number; source_url: string }[];
  trending_sentiment: string;
  key_discussions: string[];
  mentioned_tools: string[];
  follow_up_queries: string[];
}

const SOCIAL_SITES = [
  { name: 'reddit', domain: 'reddit.com' },
  { name: '4chan', domain: '4chan.org' }, // Limited indexing
  { name: '4chan-archive', domain: 'archive.4plebs.org' }, // Better indexing for /pol/, /x/, etc.
  { name: 'instagram', domain: 'instagram.com' },
  { name: 'facebook', domain: 'facebook.com' },
  { name: 'twitter', domain: 'twitter.com' },
  { name: 'tiktok', domain: 'tiktok.com' }
];

/**
 * Search social media platforms via DuckDuckGo.
 */
export async function searchSocial(query: string, platforms: string[] = ['reddit', 'twitter'], maxResults: number = 5): Promise<SocialResult[]> {
  const selectedSites = SOCIAL_SITES.filter(s => platforms.includes(s.name) || platforms.includes('all'));
  if (selectedSites.length === 0) return [];

  const siteQuery = selectedSites.map(s => `site:${s.domain}`).join(' OR ');
  const fullQuery = `${query} (${siteQuery})`;
  
  try {
    const scraped = await scrapeDuckDuckGo(fullQuery, maxResults);

    return scraped.map(r => {
      // Try to determine platform from URL
      const platform = selectedSites.find(s => r.url.includes(s.domain))?.name || 'unknown';
      return {
        platform,
        url: r.url,
        title: r.title,
        snippet: r.snippet,
      };
    });
  } catch (err) {
    logger.error('social', 'Social search failed', { error: (err as Error)?.message });
    return [];
  }
}

/**
 * Analyze social content using LLM.
 */
export async function analyzeSocialContent(
  content: string,
  query: string,
  url: string,
  keys: Record<string, string>
): Promise<SocialInsight> {
  const prompt = `Analyze this social media content in the context of the research query.

Research query: "${query}"
Source URL: "${url}"

Content:
${content.slice(0, 8000)}

Extract:
1. "claims": Factual claims, rumors, or user reports with confidence (0.3-0.9). Be skeptical of unverified user claims.
2. "trending_sentiment": General mood/opinion (e.g., "Skeptical but interested", "Hostile", "Hyped").
3. "key_discussions": Main topics or arguments being debated.
4. "mentioned_tools": Specific tools/tech mentioned.
5. "follow_up_queries": Search queries to verify these claims.

Return JSON only:
{"claims":[{"claim":"...","confidence":0.5,"source_url":"..."}],"trending_sentiment":"...","key_discussions":["..."],"mentioned_tools":["..."],"follow_up_queries":["..."]}`;

  try {
    const response = await llmCall(
      [
        {
          role: 'system',
          content: 'You analyze social media discussions. Treat user comments as anecdotal evidence, not absolute fact. Look for consensus or repeated reports. Return valid JSON only.',
        },
        { role: 'user', content: prompt },
      ],
      { tier: 'fast', keys, timeout: 20_000 }
    );

    const parsed = extractJsonArray(response.content)?.[0] || JSON.parse(response.content);
    return {
      claims: parsed.claims || [],
      trending_sentiment: parsed.trending_sentiment || 'Neutral',
      key_discussions: parsed.key_discussions || [],
      mentioned_tools: parsed.mentioned_tools || [],
      follow_up_queries: parsed.follow_up_queries || [],
    };
  } catch {
    return {
      claims: [],
      trending_sentiment: 'Unknown',
      key_discussions: [],
      mentioned_tools: [],
      follow_up_queries: [],
    };
  }
}

/**
 * "Deep Scour" — Recursively searches social platforms.
 */
export async function deepScourSocial(
  query: string,
  keys: Record<string, string>,
  platforms: string[] = ['all'],
  maxDepth: number = 1,
  emit?: (msg: any) => void
): Promise<{
  pages_analyzed: number;
  total_claims: any[];
  sentiments: string[];
  all_tools: string[];
}> {
  const allClaims: any[] = [];
  const allSentiments: string[] = [];
  const allTools = new Set<string>();
  let pagesAnalyzed = 0;

  emit?.({ type: 'social-search', query, platforms });

  const results = await searchSocial(query, platforms, 5); // Start with 5 results

  for (const result of results) {
    emit?.({ type: 'social-analyzing', url: result.url, platform: result.platform });
    
    try {
      // Fetch page content
      const content = await webFetchPage(result.url);
      if (!content || content.length < 100) continue;

      const insight = await analyzeSocialContent(content, query, result.url, keys);
      
      pagesAnalyzed++;
      allClaims.push(...insight.claims);
      allSentiments.push(insight.trending_sentiment);
      insight.mentioned_tools.forEach(t => allTools.add(t));
      
      emit?.({ type: 'social-complete', url: result.url, claims: insight.claims.length });

    } catch (err) {
      // Ignore fetch errors
      continue;
    }
  }

  return {
    pages_analyzed: pagesAnalyzed,
    total_claims: allClaims,
    sentiments: allSentiments,
    all_tools: [...allTools]
  };
}
