export interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  date?: string;
  provider: string;
}

export interface LLMResponse {
  content: string;
  provider: string;
  model: string;
  tokens_used?: number;
}

export interface ProviderConfig {
  name: string;
  type: 'search' | 'llm';
  apiKey?: string;
  baseUrl: string;
}

export type QueryType =
  | 'news'
  | 'academic'
  | 'code'
  | 'general'
  | 'page_read'
  | 'fast_reason'
  | 'deep_reason'
  | 'search_reason'
  | 'company';

export type SearchStrategy = 'semantic' | 'keyword' | 'news' | 'docs' | 'crawl' | 'reason';
