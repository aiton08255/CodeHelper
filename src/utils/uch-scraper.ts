
import { Fetcher, Selector } from 'scrapling';
import { getDb } from '../db/connection.js';
import { searchClaimsFTS } from '../memory/claims.js';

/**
 * The UCH Hybrid Scraper: 
 * Bridges the gap between Persistent Memory (SQLite) and Live Data (Scrapling).
 */
export async function runHybridScrape(query: string, url: string) {
    const db = getDb();

    // 1. Memory Check (Logic: Efficiency First)
    const existingKnowledge = searchClaimsFTS(query);
    if (existingKnowledge.length > 3 && existingKnowledge[0].confidence > 0.85) {
        return { source: 'memory', data: existingKnowledge };
    }

    // 2. Live Fetching (Logic: Real-time Discovery)
    const fetcher = new Fetcher({
        headless: true,
        stealth: true // Bypasses anti-bot protections
    });

    try {
        const response = await fetcher.get(url);
        
        // Adaptive Selector: Learns the page structure to remain resilient to UI changes
        const page = new Selector(response.content, { adaptive: true });
        
        const extractedData = {
            title: page.css('title::text').get(),
            content: page.css('main p::text').get_all(),
            url: url
        };

        // 3. Knowledge Integration (Logic: Closure)
        // In a full pipeline, we would now "Verify" and "Store" these claims.
        return { source: 'web', data: extractedData };
    } catch (error) {
        return { source: 'error', message: (error as Error).message };
    }
}
