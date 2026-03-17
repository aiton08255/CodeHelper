import { Hono } from 'hono';
import { searchClaimsByTags, searchClaimsFTS, deleteClaim } from '../memory/claims.js';
import { getDb } from '../db/connection.js';

export const claimsRouter = new Hono();

claimsRouter.get('/api/claims', (c) => {
  const tag = c.req.query('tag');
  const minConfidence = parseFloat(c.req.query('min_confidence') || '0');
  const limit = parseInt(c.req.query('limit') || '50', 10);

  if (tag) {
    const claims = searchClaimsByTags(tag.split(','));
    return c.json({
      claims: claims.filter(cl => cl.confidence >= minConfidence).slice(0, limit),
      total: claims.length,
    });
  }

  const db = getDb();
  const rows = db.prepare(`
    SELECT c.*, s.url as source_url FROM claims c
    LEFT JOIN sources s ON c.source_id = s.id
    WHERE c.confidence >= ?
    ORDER BY c.created_at DESC LIMIT ?
  `).all(minConfidence, limit);

  return c.json({ claims: rows, total: rows.length });
});

claimsRouter.get('/api/claims/search', (c) => {
  const q = c.req.query('q');
  if (!q) return c.json({ error: 'q parameter required' }, 400);
  const claims = searchClaimsFTS(q);
  return c.json({ claims });
});

claimsRouter.delete('/api/claims/:id', (c) => {
  const id = parseInt(c.req.param('id'), 10);
  deleteClaim(id);
  return c.json({ ok: true, deleted: id });
});
