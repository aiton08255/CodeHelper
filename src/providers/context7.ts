/**
 * Context7 provider — fetches up-to-date library documentation.
 *
 * Context7 resolves library names to IDs, then returns current docs/code examples.
 * Perfect for code-related research where training data may be outdated.
 *
 * Uses the public Context7 MCP-compatible REST API.
 */

import { SearchResult } from './types.js';

const C7_BASE = 'https://context7.com/api';

interface C7Library {
  id: string;
  name: string;
  description?: string;
  url?: string;
}

/**
 * Resolve a library name to a Context7 library ID.
 */
export async function context7ResolveLibrary(
  libraryName: string,
  options: { timeout?: number } = {}
): Promise<C7Library | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout || 8_000);

  try {
    const res = await fetch(`${C7_BASE}/v1/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ libraryName }),
      signal: controller.signal,
    });

    clearTimeout(timer);
    if (!res.ok) return null;

    const data = await res.json() as any;
    if (!data?.id) return null;

    return {
      id: data.id,
      name: data.name || libraryName,
      description: data.description || '',
      url: data.url || '',
    };
  } catch {
    clearTimeout(timer);
    return null;
  }
}

/**
 * Query documentation for a resolved library.
 */
export async function context7QueryDocs(
  libraryId: string,
  query: string,
  options: { maxTokens?: number; timeout?: number } = {}
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout || 12_000);

  try {
    const res = await fetch(`${C7_BASE}/v1/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        libraryId,
        query,
        maxTokens: options.maxTokens || 5000,
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);
    if (!res.ok) return null;

    const data = await res.json() as any;
    return data?.content || data?.text || null;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

/**
 * Search Context7 for library documentation matching a query.
 * Extracts library names from the query, resolves them, and fetches docs.
 */
export async function context7Search(
  query: string,
  options: { timeout?: number } = {}
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];

  // Extract potential library names from query
  const libraryPatterns = extractLibraryNames(query);

  for (const libName of libraryPatterns.slice(0, 3)) {
    try {
      const lib = await context7ResolveLibrary(libName, options);
      if (!lib) continue;

      const docs = await context7QueryDocs(lib.id, query, options);
      if (!docs) continue;

      results.push({
        url: lib.url || `https://context7.com/${lib.id}`,
        title: `${lib.name} — Documentation`,
        snippet: docs.slice(0, 1000),
        provider: 'context7',
      });
    } catch {
      continue;
    }
  }

  return results;
}

/**
 * Extract likely library/framework names from a search query.
 */
function extractLibraryNames(query: string): string[] {
  // Common library patterns
  const known = [
    'react', 'next.js', 'nextjs', 'vue', 'svelte', 'angular', 'express',
    'fastify', 'hono', 'django', 'flask', 'fastapi', 'spring', 'rails',
    'tailwind', 'typescript', 'node', 'deno', 'bun', 'vite', 'webpack',
    'prisma', 'drizzle', 'mongoose', 'sequelize', 'typeorm',
    'tone.js', 'tonejs', 'three.js', 'threejs', 'd3', 'chart.js',
    'zustand', 'redux', 'jotai', 'mobx', 'tanstack', 'react-query',
    'framer-motion', 'shadcn', 'radix', 'mui', 'chakra',
    'langchain', 'llamaindex', 'openai', 'anthropic',
    'postgres', 'redis', 'mongodb', 'sqlite', 'supabase', 'firebase',
    'docker', 'kubernetes', 'terraform', 'aws-sdk', 'gcloud',
    'jest', 'vitest', 'playwright', 'cypress', 'pytest',
    'rust', 'go', 'python', 'java', 'swift', 'kotlin',
  ];

  const lower = query.toLowerCase();
  const found = known.filter(lib => lower.includes(lib));

  // Also try to extract quoted terms or capitalized words as potential library names
  const quoted = query.match(/["']([^"']+)["']/g)?.map(m => m.replace(/["']/g, '')) || [];

  return [...new Set([...found, ...quoted])];
}
