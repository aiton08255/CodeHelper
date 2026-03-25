import puppeteer from 'puppeteer';
import { logger } from '../utils/logger.js';

let browser: any = null;

async function getBrowser() {
  if (browser) return browser;
  browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  return browser;
}

export async function browserFetchPage(url: string, options: { timeout?: number; waitSelector?: string } = {}): Promise<string> {
  const b = await getBrowser();
  const page = await b.newPage();
  
  // Set a realistic user agent
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  try {
    logger.info('browser', `Fetching ${url} with Puppeteer`);
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: options.timeout || 30_000,
    });

    if (options.waitSelector) {
      await page.waitForSelector(options.waitSelector, { timeout: 10_000 }).catch(() => {});
    }

    // Scroll down to trigger lazy loading (common on Instagram/Twitter)
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await new Promise(r => setTimeout(r, 2000));

    const html = await page.content();
    
    // Minimal cleanup
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 100_000); // Larger limit for browser fetch

  } catch (err) {
    logger.error('browser', `Puppeteer fetch failed for ${url}`, { error: (err as Error)?.message });
    throw err;
  } finally {
    await page.close();
  }
}

export async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
  }
}
