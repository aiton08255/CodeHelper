
import { getDb } from '../db/connection.js';

/**
 * Creates the user_profile table to track your knowledge and level.
 */
export function initUserProfile() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_profile (
      id INTEGER PRIMARY KEY CHECK (id = 1), -- Single user only
      username TEXT DEFAULT 'User',
      knowledge_level TEXT DEFAULT 'newbie', -- newbie, apprentice, architect, master
      understood_concepts TEXT DEFAULT '[]', -- JSON array of topics
      preferred_explanation_style TEXT DEFAULT 'analogy', -- analogy, technical, concise
      last_active TEXT DEFAULT (datetime('now'))
    )
  `);

  // Insert default row if not exists
  const exists = db.prepare('SELECT 1 FROM user_profile WHERE id = 1').get();
  if (!exists) {
    db.prepare('INSERT INTO user_profile (id) VALUES (1)').run();
  }
}

/**
 * Update your understanding of a topic.
 */
export function recordUserUnderstanding(topic: string, mastered: boolean = true) {
  const db = getDb();
  const row = db.prepare('SELECT understood_concepts, knowledge_level FROM user_profile WHERE id = 1').get() as any;
  let concepts = JSON.parse(row.understood_concepts || '[]');

  if (mastered && !concepts.includes(topic)) {
    concepts.push(topic);
  } else if (!mastered) {
    concepts = concepts.filter((c: string) => c !== topic);
  }

  // Auto-level up based on concepts known
  let level = 'newbie';
  if (concepts.length > 10) level = 'apprentice';
  if (concepts.length > 30) level = 'architect';
  if (concepts.length > 50) level = 'master';

  db.prepare('UPDATE user_profile SET understood_concepts = ?, knowledge_level = ?, last_active = datetime(\'now\') WHERE id = 1')
    .run(JSON.stringify(concepts), level);
}
