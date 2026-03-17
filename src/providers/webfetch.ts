export async function webFetchPage(url: string, options: { timeout?: number } = {}): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout || 15_000);

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SelfEvo/1.0)' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`WebFetch ${url}: ${res.status}`);
    const html = await res.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 50_000);
  } finally {
    clearTimeout(timer);
  }
}
