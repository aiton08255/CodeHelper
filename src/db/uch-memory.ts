
import { getDb } from '../db/connection.js';

export interface UserTopicStatus {
    topic: string;
    level: 'Novice' | 'Apprentice' | 'Practitioner' | 'Specialist' | 'Architect' | 'Master';
    subtopics: Record<string, boolean>;
    visual_pref: boolean;
}

/**
 * Initializes the refined 6-Tier Professional User-Centric Memory System.
 */
export function initUCHMemory() {
    const db = getDb();
    db.exec(`
        CREATE TABLE IF NOT EXISTS uch_user_profile (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            current_focus TEXT,
            visual_mode INTEGER DEFAULT 0 -- 0 for text, 1 for visual/diagrams
        );

        CREATE TABLE IF NOT EXISTS uch_topic_mastery (
            topic_id TEXT PRIMARY KEY,
            level TEXT DEFAULT 'Novice',
            mastered_subtopics TEXT DEFAULT '{}',
            last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    const exists = db.prepare('SELECT 1 FROM uch_user_profile WHERE id = 1').get();
    if (!exists) {
        db.prepare('INSERT INTO uch_user_profile (id, current_focus) VALUES (1, "General")').run();
    }
}

/**
 * Updates mastery for a specific topic/subtopic.
 */
export function updateTopicMastery(topic: string, subtopicId?: string, action: 'level_up' | 'get_it' | 'lost' = 'get_it') {
    const db = getDb();
    let record = db.prepare('SELECT * FROM uch_topic_mastery WHERE topic_id = ?').get(topic) as any;

    if (!record) {
        db.prepare('INSERT INTO uch_topic_mastery (topic_id, level) VALUES (?, "Novice")').run(topic);
        record = { topic_id: topic, level: 'Novice', mastered_subtopics: '{}' };
    }

    let level = record.level;
    let mastered = JSON.parse(record.mastered_subtopics);

    if (action === 'level_up') {
        const levels: any = { 
            'Novice': 'Apprentice', 
            'Apprentice': 'Practitioner', 
            'Practitioner': 'Specialist', 
            'Specialist': 'Architect', 
            'Architect': 'Master', 
            'Master': 'Master' 
        };
        level = levels[level];
    }

    if (subtopicId) {
        mastered[subtopicId] = (action !== 'lost');
    }

    db.prepare('UPDATE uch_topic_mastery SET level = ?, mastered_subtopics = ?, last_updated = CURRENT_TIMESTAMP WHERE topic_id = ?')
        .run(level, JSON.stringify(mastered), topic);
}

/**
 * Gets the current status for a topic to tailor the explanation.
 */
export function getTopicStatus(topic: string): UserTopicStatus {
    const db = getDb();
    const profile = db.prepare('SELECT visual_mode FROM uch_user_profile WHERE id = 1').get() as any;
    const record = db.prepare('SELECT * FROM uch_topic_mastery WHERE topic_id = ?').get(topic) as any;
    
    if (!record) return { topic, level: 'Novice', subtopics: {}, visual_pref: !!profile?.visual_mode };
    
    return {
        topic,
        level: record.level,
        subtopics: JSON.parse(record.mastered_subtopics),
        visual_pref: !!profile?.visual_mode
    };
}

/**
 * Toggle visual representation mode.
 */
export function setVisualMode(enabled: boolean) {
    const db = getDb();
    db.prepare('UPDATE uch_user_profile SET visual_mode = ? WHERE id = 1').run(enabled ? 1 : 0);
}
