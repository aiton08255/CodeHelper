/**
 * Tool Discovery Engine — Phase 5
 * Searches for new free AI tools, APIs, and search providers.
 * Evaluates them and suggests integration.
 *
 * This is the "open evolution" component — Self-Evo improves itself
 * by finding better tools on the web.
 */

import { getDb } from '../db/connection.js';
import { llmCall } from '../providers/llm.js';
import { executeSearch } from '../providers/router.js';
import { webFetchPage } from '../providers/webfetch.js';
import { extractJsonArray } from '../utils/safe-json.js';
import { logEvolution } from './changelog.js';

export interface DiscoveredTool {
  name: string;
  url: string;
  category: 'search' | 'llm' | 'embedding' | 'utility';
  free_tier: string;
  age_safe: boolean;      // 13+ compatible
  relevance_score: number; // 0-1 how useful for Self-Evo
  notes: string;
}

const DISCOVERY_PROMPT = `You are evaluating free AI tools/APIs for a private research engine. The user is 17 years old.

For each tool found, evaluate:
1. Is it free (or has a usable free tier)?
2. Is it age-safe (13+ minimum, NOT 18+)?
3. What category: search, llm, embedding, or utility?
4. How relevant for a deep research engine? (0-1)

Return JSON array:
[{"name":"...", "url":"...", "category":"search|llm|embedding|utility", "free_tier":"description of free tier", "age_safe":true/false, "relevance_score":0.8, "notes":"why useful or not"}]

Only include tools with free tiers. Exclude tools requiring 18+ age.`;

const SEARCH_QUERIES = [
  'free AI search API 2025 no credit card',
  'free LLM API endpoints 2025 open access',
  'free web search API alternative Google 2025',
  'free AI text generation API no signup',
  'new free AI tools developers 2025',
];

/**
 * Discover new tools by searching the web.
 * Returns evaluated candidates, doesn't auto-integrate.
 */
export async function discoverTools(keys: Record<string, string>): Promise<{
  candidates: DiscoveredTool[];
  search_queries_used: number;
  pages_analyzed: number;
}> {
  const allResults: { url: string; title: string; snippet: string }[] = [];

  // Search across multiple queries
  for (const query of SEARCH_QUERIES.slice(0, 3)) {
    try {
      const results = await executeSearch('exa', query, keys);
      allResults.push(...results.slice(0, 3));
    } catch {
      try {
        const results = await executeSearch('duckduckgo', query, keys);
        allResults.push(...results.slice(0, 3));
      } catch {}
    }
  }

  // Deduplicate by domain
  const seen = new Set<string>();
  const unique = allResults.filter(r => {
    try {
      const domain = new URL(r.url).hostname;
      if (seen.has(domain)) return false;
      seen.add(domain);
      return true;
    } catch { return false; }
  });

  // Fetch top pages for evaluation
  let pagesAnalyzed = 0;
  const pageContents: string[] = [];

  for (const result of unique.slice(0, 5)) {
    try {
      const content = await webFetchPage(result.url, { timeout: 8_000 });
      if (content && content.length > 200) {
        pageContents.push(`[${result.title}] (${result.url})\n${content.slice(0, 3000)}`);
        pagesAnalyzed++;
      }
    } catch {}
  }

  if (pageContents.length === 0) {
    // Fallback: use search snippets
    for (const r of unique.slice(0, 8)) {
      pageContents.push(`[${r.title}] (${r.url})\n${r.snippet}`);
    }
  }

  // Evaluate with LLM
  let candidates: DiscoveredTool[] = [];
  try {
    const response = await llmCall(
      [{ role: 'system', content: DISCOVERY_PROMPT },
       { role: 'user', content: `Evaluate these tools:\n\n${pageContents.join('\n\n---\n\n')}` }],
      { tier: 'fast', keys, timeout: 20_000 }
    );

    const parsed = extractJsonArray(response.content) as any[] | null;
    if (parsed) {
      candidates = parsed
        .filter((t: any) => t.age_safe && t.relevance_score > 0.3)
        .map((t: any) => ({
          name: t.name || 'Unknown',
          url: t.url || '',
          category: t.category || 'utility',
          free_tier: t.free_tier || 'unknown',
          age_safe: !!t.age_safe,
          relevance_score: Math.min(1, t.relevance_score || 0),
          notes: t.notes || '',
        }));
    }
  } catch {}

  // Store discoveries in DB
  storeDiscoveries(candidates);

  return {
    candidates: candidates.sort((a, b) => b.relevance_score - a.relevance_score),
    search_queries_used: Math.min(3, SEARCH_QUERIES.length),
    pages_analyzed: pagesAnalyzed,
  };
}

function storeDiscoveries(tools: DiscoveredTool[]): void {
  const db = getDb();

  // Ensure table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS discovered_tools (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT UNIQUE,
      category TEXT,
      free_tier TEXT,
      age_safe BOOLEAN DEFAULT 1,
      relevance_score REAL,
      notes TEXT,
      status TEXT DEFAULT 'candidate',
      discovered_at TEXT DEFAULT (datetime('now'))
    )
  `);

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO discovered_tools (name, url, category, free_tier, age_safe, relevance_score, notes, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'candidate')
  `);

  for (const tool of tools) {
    stmt.run(tool.name, tool.url, tool.category, tool.free_tier, tool.age_safe ? 1 : 0, tool.relevance_score, tool.notes);
  }

  if (tools.length > 0) {
    logEvolution({
      change_type: 'discovery',
      tier: 'notify',
      parameter: 'tools',
      old_value: null,
      new_value: `${tools.length} candidates found`,
      reason: `Discovered: ${tools.map(t => t.name).join(', ')}`,
    });
  }
}

/**
 * Get all discovered tools, optionally filtered.
 */
export function getDiscoveries(status?: string): DiscoveredTool[] {
  const db = getDb();

  // Ensure table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS discovered_tools (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT UNIQUE,
      category TEXT,
      free_tier TEXT,
      age_safe BOOLEAN DEFAULT 1,
      relevance_score REAL,
      notes TEXT,
      status TEXT DEFAULT 'candidate',
      discovered_at TEXT DEFAULT (datetime('now'))
    )
  `);

  const rows = status
    ? db.prepare('SELECT * FROM discovered_tools WHERE status = ? ORDER BY relevance_score DESC').all(status) as any[]
    : db.prepare('SELECT * FROM discovered_tools ORDER BY relevance_score DESC').all() as any[];

  return rows.map(r => ({
    name: r.name,
    url: r.url,
    category: r.category,
    free_tier: r.free_tier,
    age_safe: !!r.age_safe,
    relevance_score: r.relevance_score,
    notes: r.notes,
  }));
}

/**
 * Approve or reject a discovered tool.
 */
export function updateToolStatus(url: string, status: 'approved' | 'rejected' | 'integrated'): void {
  const db = getDb();
  db.prepare('UPDATE discovered_tools SET status = ? WHERE url = ?').run(status, url);

  logEvolution({
    change_type: 'tool_review',
    tier: 'approval',
    parameter: url,
    old_value: 'candidate',
    new_value: status,
    reason: `User ${status} discovered tool`,
    approved_by: 'user',
  });
}
