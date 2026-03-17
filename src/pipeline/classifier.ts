/**
 * Query complexity classifier — picks the right tool for the job.
 * "Don't nuke a mosquito."
 *
 * instant: simple factual, definitions, single-fact lookups
 * quick:   moderate questions, how-to, short lists
 * standard: comparisons, multi-faceted analysis, trends
 * deep:    research papers, comprehensive reviews, controversial topics
 */

export type Depth = 'instant' | 'quick' | 'standard' | 'deep';

// Patterns that indicate complexity
const DEEP_SIGNALS = [
  /\bcomprehensive\b/i, /\bin.depth\b/i, /\bresearch\b/i,
  /\banalyz[e]?\b/i, /\bsystematic\b/i, /\bevidence\b/i,
  /\bliterature\b/i, /\bstate of the art\b/i,
];

const STANDARD_SIGNALS = [
  /\bcompar[e|ison]\b/i, /\bvs\.?\b/i, /\bversus\b/i,
  /\bpros and cons\b/i, /\badvantages\b/i, /\bdifferences?\b/i,
  /\btrend\b/i, /\bhow has .+ changed\b/i, /\bover time\b/i,
  /\bbest .+ for\b/i, /\btop \d+\b/i, /\branking\b/i,
];

const INSTANT_SIGNALS = [
  /^what is /i, /^what are /i, /^who is /i, /^who was /i,
  /^define /i, /^meaning of /i, /^when (was|did|is) /i,
  /^where (is|was|are) /i, /^how old /i, /^how tall /i,
  /^how many /i, /^how much (does|is|was) /i,
  /^is .+ (true|real|a)\b/i,
];

export function classifyQuery(query: string): Depth {
  const q = query.trim();
  const wordCount = q.split(/\s+/).length;

  // Very short queries (1-4 words) are almost always instant
  if (wordCount <= 4 && !STANDARD_SIGNALS.some(p => p.test(q))) {
    return 'instant';
  }

  // Check for deep signals first (most specific)
  if (DEEP_SIGNALS.some(p => p.test(q))) return 'deep';

  // Check for standard signals
  if (STANDARD_SIGNALS.some(p => p.test(q))) return 'standard';

  // Check for instant signals
  if (INSTANT_SIGNALS.some(p => p.test(q))) return 'instant';

  // Multi-part questions (has "and also", multiple "?", semicolons)
  if ((q.match(/\?/g) || []).length > 1 || /\band also\b/i.test(q) || q.includes(';')) {
    return 'standard';
  }

  // Medium-length queries default to quick
  if (wordCount <= 12) return 'quick';

  // Long queries suggest complexity
  return 'standard';
}
