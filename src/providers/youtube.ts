import { llmCall } from './llm.js';
import { extractJsonArray } from '../utils/safe-json.js';
import { getDb } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import { anonFetch, anonHeaders, anonApiHeaders } from '../privacy/anonymizer.js';
import { scrapeDuckDuckGo } from './duckduckgo-scraper.js';

function trackTranscriptMethod(method: string, success: boolean): void {
  try {
    const db = getDb();
    db.exec(`CREATE TABLE IF NOT EXISTS transcript_method_stats (
      method TEXT PRIMARY KEY,
      successes INTEGER DEFAULT 0,
      failures INTEGER DEFAULT 0
    )`);
    if (success) {
      db.prepare('INSERT INTO transcript_method_stats (method, successes) VALUES (?, 1) ON CONFLICT(method) DO UPDATE SET successes = successes + 1').run(method);
    } else {
      db.prepare('INSERT INTO transcript_method_stats (method, failures) VALUES (?, 1) ON CONFLICT(method) DO UPDATE SET failures = failures + 1').run(method);
    }
  } catch { /* intentionally silent */ }
}

/**
 * Get the best transcript method based on historical success.
 */
function getBestMethodOrder(): string[] {
  try {
    const db = getDb();
    const stats = db.prepare('SELECT method, successes, failures FROM transcript_method_stats ORDER BY (successes * 1.0 / MAX(1, successes + failures)) DESC').all() as { method: string; successes: number; failures: number }[];
    if (stats.length >= 2) {
      return stats.map(s => s.method);
    }
  } catch { /* intentionally silent */ }
  return ['youtubetranscript', 'pollinations', 'noembed']; // default order
}

/**
 * Content quality filter — rejects spam, ads, paid promotions, sketchy content.
 * Returns false if the content should be skipped.
 */
function isCleanContent(text: string): boolean {
  const lower = text.toLowerCase();
  const spamPatterns = [
    /\buse code\b.*\b\d+%?\s*off\b/,         // "use code X for 20% off"
    /\blink in (the )?description\b/,           // "link in description" promo
    /\bsponsored by\b/,                         // sponsored segments
    /\bthis video is sponsored\b/,
    /\btoday'?s sponsor\b/,
    /\bpromo code\b/,
    /\bcoupon code\b/,
    /\baffiliate link\b/,
    /\bsign up (now |today )?(for free |using )?my link\b/,
    /\bcheck out my course\b/,
    /\bbuy (my |the )?(course|book|ebook|program|membership)\b/,
    /\benroll now\b/,
    /\blimited time offer\b/,
    /\bdon'?t miss out\b/,
    /\bsubscribe (and|&) (hit|smash|click)\b/,  // engagement bait
    /\bmake \$\d+.*per (day|month|hour)\b/,     // money scams
    /\bpassive income\b.*\beasy\b/,
    /\bget rich\b/,
    /\bcrypto (trading |pump |signal)/,          // crypto spam
    /\bforex (signal|trading|robot)\b/,
    /\b(weight loss|diet) (pill|secret|trick)\b/, // health scams
  ];

  for (const pattern of spamPatterns) {
    if (pattern.test(lower)) return false;
  }
  return true;
}

/**
 * Filter promotional claims from extracted video insights.
 * Removes claims that are really ads or promotions, not facts.
 */
function filterPromotionalClaims(claims: { claim: string; confidence: number; timestamp?: string }[]): { claim: string; confidence: number; timestamp?: string }[] {
  return claims.filter(c => {
    const lower = c.claim.toLowerCase();
    // Skip promotional "claims"
    if (/\b(discount|coupon|promo|affiliate|referral)\b/.test(lower)) return false;
    if (/\b(buy now|sign up|enroll|subscribe)\b/.test(lower)) return false;
    if (/\b(my course|my book|my program|my link)\b/.test(lower)) return false;
    if (/\$\d+.*\b(off|per month|per year)\b/.test(lower)) return false;
    // Skip vague hype claims
    if (/\b(game.?changer|life.?changing|mind.?blowing|incredible|unbelievable)\b/.test(lower) && c.confidence < 0.7) return false;
    return true;
  });
}

export interface VideoResult {
  video_id: string;
  title: string;
  url: string;
  channel: string;
  description: string;
  transcript?: string;
  duration?: string;
}

export interface VideoInsight {
  claims: { claim: string; confidence: number; timestamp?: string }[];
  mentioned_topics: string[];
  mentioned_tools: string[];
  mentioned_urls: string[];
  key_takeaways: string[];
  follow_up_queries: string[];
}

/**
 * Search YouTube via DuckDuckGo (free, no API key needed).
 * Returns video URLs, titles, descriptions.
 */
export async function searchYouTube(query: string, maxResults: number = 5): Promise<VideoResult[]> {
  const fullQuery = `${query} site:youtube.com`;

  try {
    const scraped = await scrapeDuckDuckGo(fullQuery, maxResults);
    const videos: VideoResult[] = [];
    const seen = new Set<string>();

    for (const res of scraped) {
      // Extract video ID from URL
      const match = res.url.match(/(?:v=|youtu\.be\/|\/v\/|\/embed\/|\/watch\?v=)([^#&?]+)/);
      const videoId = match ? match[1] : null;

      if (videoId && !seen.has(videoId) && videoId.length === 11) {
        seen.add(videoId);
        videos.push({
          video_id: videoId,
          title: res.title || '',
          url: `https://www.youtube.com/watch?v=${videoId}`,
          channel: '', // Not available from search result easily
          description: res.snippet || '',
        });
      }
    }

    return videos;
  } catch (err) {
    logger.error('youtube', 'YouTube search failed', { error: (err as Error)?.message });
    return [];
  }
}

/**
 * Fetch transcript for a YouTube video using free API.
 */
export async function fetchTranscript(videoId: string): Promise<string | null> {
  const methodOrder = getBestMethodOrder();

  const methods: Record<string, () => Promise<string | null>> = {
    youtubetranscript: async () => {
      const res = await anonFetch(`https://youtubetranscript.com/?server_vid2=${videoId}`, {
        headers: anonHeaders(),
        signal: AbortSignal.timeout(10_000),
        skipJitter: true,
      });
      if (res.ok) {
        const text = await res.text();
        const lines = text.match(/<text[^>]*>([^<]+)<\/text>/g);
        if (lines && lines.length > 0) {
          return lines
            .map((l) =>
              l
                .replace(/<[^>]+>/g, '')
                .replace(/&amp;/g, '&')
                .replace(/&#39;/g, "'")
                .replace(/&quot;/g, '"'),
            )
            .join(' ');
        }
      }
      return null;
    },
    pollinations: async () => {
      const res = await anonFetch(`https://text.pollinations.ai/openai`, {
        method: 'POST',
        headers: anonApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          model: 'searchgpt',
          messages: [
            {
              role: 'user',
              content: `Summarize this YouTube video in detail with key points and claims: https://www.youtube.com/watch?v=${videoId}`,
            },
          ],
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (res.ok) {
        const data = await res.json();
        return data.choices?.[0]?.message?.content || null;
      }
      return null;
    },
    noembed: async () => {
      const res = await anonFetch(
        `https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`,
        { signal: AbortSignal.timeout(5_000), skipJitter: true },
      );
      if (res.ok) {
        const data = await res.json();
        return `Video: "${data.title}" by ${data.author_name}. ${data.title}`;
      }
      return null;
    },
  };

  for (const methodName of methodOrder) {
    const fn = methods[methodName];
    if (!fn) continue;
    try {
      const result = await fn();
      if (result) {
        trackTranscriptMethod(methodName, true);
        return result;
      }
      trackTranscriptMethod(methodName, false);
    } catch { /* transcript method failed — try next */
      trackTranscriptMethod(methodName, false);
    }
  }

  return null;
}

/**
 * Analyze video content — extract claims, topics, tools, and follow-up queries.
 * This is the "rabbit hole" engine: it identifies what to research next.
 */
export async function analyzeVideoContent(
  transcript: string,
  query: string,
  keys: Record<string, string>,
): Promise<VideoInsight> {
  const prompt = `Analyze this video transcript/summary in the context of the research query.

Research query: "${query}"

Video content:
${transcript.slice(0, 8000)}

Extract:
1. "claims": Factual claims with confidence (0.5-0.9) and approximate timestamp if visible
2. "mentioned_topics": Topics, concepts, or technologies mentioned that deserve deeper research
3. "mentioned_tools": Specific tools, libraries, frameworks, APIs mentioned
4. "mentioned_urls": Any URLs, websites, or resources mentioned
5. "key_takeaways": The 3-5 most important points from the video
6. "follow_up_queries": 2-3 specific search queries to go deeper on the most interesting findings

Return JSON only:
{"claims":[{"claim":"...","confidence":0.7,"timestamp":"2:30"}],"mentioned_topics":["..."],"mentioned_tools":["..."],"mentioned_urls":["..."],"key_takeaways":["..."],"follow_up_queries":["..."]}`;

  try {
    const response = await llmCall(
      [
        {
          role: 'system',
          content:
            'You analyze video content and extract structured knowledge. IGNORE all sponsored segments, paid promotions, affiliate links, "use my code" offers, course/book sales pitches, and engagement bait. Only extract genuine factual claims and educational content. Return valid JSON only.',
        },
        { role: 'user', content: prompt },
      ],
      { tier: 'fast', keys, timeout: 20_000 },
    );

    const parsed = extractJsonArray(response.content)?.[0] || JSON.parse(response.content);
    return {
      claims: parsed.claims || [],
      mentioned_topics: parsed.mentioned_topics || [],
      mentioned_tools: parsed.mentioned_tools || [],
      mentioned_urls: parsed.mentioned_urls || [],
      key_takeaways: parsed.key_takeaways || [],
      follow_up_queries: parsed.follow_up_queries || [],
    };
  } catch { /* video analysis LLM call failed */
    return {
      claims: [],
      mentioned_topics: [],
      mentioned_tools: [],
      mentioned_urls: [],
      key_takeaways: [],
      follow_up_queries: [],
    };
  }
}

/**
 * Rabbit hole video research — searches YouTube, extracts transcripts,
 * analyzes content, follows leads, and keeps going deeper.
 *
 * maxDepth controls how many levels deep to go:
 * - depth 1: search + analyze initial videos
 * - depth 2: follow up on mentioned topics
 * - depth 3: go even deeper on the most interesting findings
 */
export async function rabbitHoleVideoResearch(
  query: string,
  keys: Record<string, string>,
  maxDepth: number = 2,
  emit?: (msg: any) => void,
): Promise<{
  videos_analyzed: number;
  total_claims: { claim: string; confidence: number; source_video: string }[];
  all_topics: string[];
  all_tools: string[];
  key_takeaways: string[];
  depth_reached: number;
  follow_up_suggestions: string[];
}> {
  const allClaims: { claim: string; confidence: number; source_video: string }[] = [];
  const allTopics = new Set<string>();
  const allTools = new Set<string>();
  const allTakeaways: string[] = [];
  const allFollowUps: string[] = [];
  const analyzedVideos = new Set<string>();
  let videosAnalyzed = 0;

  const searchQueue: { query: string; depth: number }[] = [{ query, depth: 1 }];

  while (searchQueue.length > 0) {
    const current = searchQueue.shift()!;
    if (current.depth > maxDepth) continue;

    emit?.({ type: 'video-search', depth: current.depth, query: current.query });

    // Search for videos
    const videos = await searchYouTube(current.query, current.depth === 1 ? 5 : 3);

    for (const video of videos) {
      if (analyzedVideos.has(video.video_id)) continue;
      analyzedVideos.add(video.video_id);

      emit?.({
        type: 'video-analyzing',
        video_id: video.video_id,
        title: video.title || video.url,
      });

      // Fetch transcript/summary
      const transcript = await fetchTranscript(video.video_id);
      if (!transcript || transcript.length < 50) continue;

      // Skip spammy/promotional content
      if (!isCleanContent(transcript)) {
        emit?.({ type: 'video-skipped', video_id: video.video_id, reason: 'promotional/spam content detected' });
        continue;
      }

      // Analyze content
      const insight = await analyzeVideoContent(transcript, query, keys);

      // Filter out promotional claims
      insight.claims = filterPromotionalClaims(insight.claims);
      videosAnalyzed++;

      // Collect claims
      for (const claim of insight.claims) {
        allClaims.push({
          claim: claim.claim,
          confidence: claim.confidence,
          source_video: video.url,
        });
      }

      // Collect topics, tools, takeaways
      for (const t of insight.mentioned_topics) allTopics.add(t);
      for (const t of insight.mentioned_tools) allTools.add(t);
      allTakeaways.push(...insight.key_takeaways);

      // Queue follow-up searches for next depth level (filtered for quality)
      if (current.depth < maxDepth) {
        const sketchyFollowUps = /\b(make money|get rich|passive income|forex|crypto trading|weight loss|diet pill|free iphone|hack|crack|keygen)\b/i;
        for (const followUp of insight.follow_up_queries.slice(0, 2)) {
          if (!searchQueue.find((q) => q.query === followUp) && !sketchyFollowUps.test(followUp)) {
            searchQueue.push({ query: followUp, depth: current.depth + 1 });
            allFollowUps.push(followUp);
          }
        }
      }

      emit?.({
        type: 'video-complete',
        video_id: video.video_id,
        claims: insight.claims.length,
        depth: current.depth,
      });
    }
  }

  return {
    videos_analyzed: videosAnalyzed,
    total_claims: allClaims,
    all_topics: [...allTopics],
    all_tools: [...allTools],
    key_takeaways: allTakeaways.slice(0, 15),
    depth_reached: maxDepth,
    follow_up_suggestions: allFollowUps.slice(0, 10),
  };
}
